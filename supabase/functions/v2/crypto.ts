// supabase/functions/auth/crypto.ts
// Deno 및 Web 표준 호환 RFC 4226 HOTP, BER-TLV 파서 및 DB 키 복호화 모듈
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim().replace(/^0x/i, '');
  if (cleanHex.length % 2 !== 0) {
    throw new Error(`Invalid hex length: ${cleanHex.length}`);
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Constant-time 문자열 비교 (타이밍 공격 방지)
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================================
// 1. DB 키 복호화 (Envelope Encryption - AES-256-GCM via Web Crypto API)
// ============================================================================

export async function decryptNfcKeyFromDb(
  cipherHex: string,
  ivHex: string,
  tagHex: string,
  kekHex: string
): Promise<string> {
  const cipherBytes = hexToBytes(cipherHex);
  const ivBytes = hexToBytes(ivHex);
  const tagBytes = hexToBytes(tagHex);
  const kekBytes = hexToBytes(kekHex);

  if (kekBytes.length !== 32) {
    throw new Error('NFC_KEK must be 32 bytes (64 hex characters)');
  }

  const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
  combined.set(cipherBytes, 0);
  combined.set(tagBytes, cipherBytes.length);

  const subtle = globalThis.crypto?.subtle || crypto.webcrypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API SubtleCrypto is not available');
  }

  const key = await subtle.importKey(
    'raw',
    kekBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    combined
  );

  return bytesToHex(new Uint8Array(decrypted));
}

// ============================================================================
// 2. BER-TLV (ISO 7816-4) 파서
// 지원 태그:
// - DF61: id (UID / 스마트카드 식별자)
// - DF62: otp (HOTP 일회용 비밀번호)
// - DF63: count (카운터 정수)
// ============================================================================

export interface ParsedTlvItem {
  tag: string;
  length: number;
  valueHex: string;
}

export interface ParsedAuthPayload {
  rawHex: string;
  id: string;             // DF61: 대문자 Hex UID
  otp: string;            // DF62: 6자리 또는 8자리 십진수 OTP 문자열
  counter: number;        // DF63: 카운터 정수
  items: Map<string, ParsedTlvItem>;
}

/**
 * BER-TLV 바이트열(Hex 문자열)을 파싱하여 Tag 목록을 반환합니다.
 */
export function parseBerTlv(rawHexInput: string): Map<string, ParsedTlvItem> {
  const cleanHex = rawHexInput.trim().replace(/^0x/i, '').replace(/\s+/g, '');
  if (!/^[0-9A-Fa-f]+$/.test(cleanHex)) {
    throw new Error('유효한 Hex 문자열이 아닙니다.');
  }
  if (cleanHex.length < 4) {
    throw new Error('TLV 데이터 길이가 너무 짧습니다.');
  }

  const items = new Map<string, ParsedTlvItem>();
  let offset = 0;
  const totalLen = cleanHex.length;

  while (offset < totalLen) {
    if (offset + 2 > totalLen) break;

    // 1. Tag 추출
    // 스마트카드 BER-TLV 규격: 첫 바이트 하위 5비트가 0x1F (예: DF, 9F, 5F, 7F, BF 등)이면 2바이트 태그
    const firstTagByte = parseInt(cleanHex.substring(offset, offset + 2), 16);
    let tag: string;

    if ((firstTagByte & 0x1F) === 0x1F) {
      if (offset + 4 > totalLen) {
        throw new Error(`태그 헤더가 잘렸습니다: offset ${offset}`);
      }
      tag = cleanHex.substring(offset, offset + 4).toUpperCase();
      offset += 4;
    } else {
      tag = cleanHex.substring(offset, offset + 2).toUpperCase();
      offset += 2;
    }

    if (offset >= totalLen) {
      throw new Error(`태그(${tag}) 뒤에 길이 필드가 누락되었습니다.`);
    }

    // 2. Length 추출 (BER-TLV 규격)
    const firstLenByte = parseInt(cleanHex.substring(offset, offset + 2), 16);
    offset += 2;

    let length: number;
    if (firstLenByte < 0x80) {
      length = firstLenByte;
    } else if (firstLenByte === 0x81) {
      if (offset + 2 > totalLen) throw new Error(`태그(${tag})의 길이 필드(0x81)가 잘렸습니다.`);
      length = parseInt(cleanHex.substring(offset, offset + 2), 16);
      offset += 2;
    } else if (firstLenByte === 0x82) {
      if (offset + 4 > totalLen) throw new Error(`태그(${tag})의 길이 필드(0x82)가 잘렸습니다.`);
      length = parseInt(cleanHex.substring(offset, offset + 4), 16);
      offset += 4;
    } else {
      throw new Error(`지원하지 않는 TLV 길이 인코딩입니다: 0x${firstLenByte.toString(16)}`);
    }

    // 3. Value 추출
    const valueHexChars = length * 2;
    if (offset + valueHexChars > totalLen) {
      throw new Error(`태그(${tag})의 값 데이터가 명시된 길이(${length}B)보다 부족합니다.`);
    }

    const valueHex = cleanHex.substring(offset, offset + valueHexChars).toUpperCase();
    offset += valueHexChars;

    items.set(tag, {
      tag,
      length,
      valueHex
    });
  }

  return items;
}

/**
 * DF61, DF62, DF63 TLV 태그를 파싱하고 의미 있는 id, otp, count 값으로 변환합니다.
 */
export function parseAuthTlv(rawHexInput: string): ParsedAuthPayload {
  const items = parseBerTlv(rawHexInput);

  const itemDf61 = items.get('DF61');
  const itemDf62 = items.get('DF62');
  const itemDf63 = items.get('DF63');

  if (!itemDf61) {
    throw new Error('필수 TLV 태그 DF61 (id)가 누락되었습니다.');
  }
  if (!itemDf62) {
    throw new Error('필수 TLV 태그 DF62 (otp)가 누락되었습니다.');
  }
  if (!itemDf63) {
    throw new Error('필수 TLV 태그 DF63 (count)가 누락되었습니다.');
  }

  // 1. ID 해석 (DF61): 고유 식별자 (대문자 Hex)
  const id = itemDf61.valueHex.toUpperCase();

  // 2. 카운터 해석 (DF63): Big-Endian 정수 또는 ASCII 정수
  const cntBytes = hexToBytes(itemDf63.valueHex);
  let counter = 0;

  // 혹시 ASCII 숫자로 들어왔는지 체크 (모든 바이트가 0x30~0x39)
  const isAsciiDigits = cntBytes.length > 0 && Array.from(cntBytes).every(b => b >= 0x30 && b <= 0x39);
  if (isAsciiDigits) {
    counter = parseInt(Buffer.from(cntBytes).toString('ascii'), 10);
  } else {
    // 바이너리 Big-Endian 정수 변환
    for (let i = 0; i < cntBytes.length; i++) {
      counter = (counter * 256) + cntBytes[i];
    }
  }

  if (isNaN(counter) || counter < 0) {
    throw new Error(`카운터(DF63) 값이 올바르지 않습니다: ${itemDf63.valueHex}`);
  }

  // 3. OTP 해석 (DF62)
  // 스마트카드에서 OTP가 전달될 수 있는 3가지 형식 지원:
  // A. ASCII 문자열 (예: 6바이트 "313233343536" -> "123456")
  // B. 4바이트 Big-Endian 정수 (예: 4바이트 "0001E240" -> 123456)
  // C. BCD 또는 Hex 10진수 문자열
  const otpBytes = hexToBytes(itemDf62.valueHex);
  let otpStr = '';

  const isOtpAscii = otpBytes.length >= 6 && Array.from(otpBytes).every(b => b >= 0x30 && b <= 0x39);
  if (isOtpAscii) {
    otpStr = Buffer.from(otpBytes).toString('ascii');
  } else if (otpBytes.length === 4) {
    // 4바이트 Big-Endian 바이너리 정수
    let code = 0;
    for (let i = 0; i < 4; i++) {
      code = (code << 8) | otpBytes[i];
    }
    // 기본 6자리 형식
    otpStr = (code % 1000000).toString().padStart(6, '0');
  } else {
    // Hex 문자열 그대로를 OTP로 간주
    otpStr = itemDf62.valueHex;
  }

  return {
    rawHex: rawHexInput.trim().toUpperCase(),
    id,
    otp: otpStr,
    counter,
    items
  };
}

// ============================================================================
// 3. RFC 4226 HOTP (HMAC-based One-Time Password) 알고리즘
// ============================================================================

export interface HotpResult {
  otp6: string;
  otp8: string;
  code: number;
  fullHash: string;
}

/**
 * RFC 4226 표준 HOTP 계산
 * @param key 비밀키 바이트열 (대칭키)
 * @param counter 64비트 카운터 정수 (0 이상의 정수)
 * @param digits 자릿수 (기본 6자리)
 */
export function calculateHotp(
  key: Uint8Array,
  counter: number | bigint,
  digits: number = 6
): HotpResult {
  // 1. 카운터를 8바이트 Big-Endian 버퍼로 패킹 (RFC 4226 Section 5.1 R1)
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

  // 2. HMAC-SHA-1 계산 (RFC 4226 Section 5.1 R3)
  const hmac = crypto.createHmac('sha1', Buffer.from(key));
  hmac.update(counterBuffer);
  const hs = hmac.digest(); // 20바이트

  // 3. Dynamic Truncation (DT) (RFC 4226 Section 5.3)
  const offset = hs[19] & 0x0F;
  const binCode = (
    ((hs[offset] & 0x7F) << 24) |
    ((hs[offset + 1] & 0xFF) << 16) |
    ((hs[offset + 2] & 0xFF) << 8) |
    (hs[offset + 3] & 0xFF)
  ) >>> 0; // Unsigned 32-bit int

  // 4. Modulo 연산 (6자리 & 8자리 생성)
  const code6 = binCode % 1000000;
  const code8 = binCode % 100000000;

  const otp6 = code6.toString().padStart(6, '0');
  const otp8 = code8.toString().padStart(8, '0');

  return {
    otp6,
    otp8,
    code: digits === 8 ? code8 : code6,
    fullHash: hs.toString('hex').toUpperCase()
  };
}

/**
 * 수신된 OTP 문자열과 키, 카운터를 기반으로 HOTP 일치 여부를 검증합니다.
 */
export function verifyHotp(
  keyBytes: Uint8Array,
  counter: number,
  receivedOtp: string
): { isValid: boolean; expectedOtp6: string; expectedOtp8: string } {
  const hotp = calculateHotp(keyBytes, counter);
  const cleanReceived = receivedOtp.trim();

  // 6자리 또는 8자리 또는 원시 코드 정수 일치 여부 확인
  const isMatch6 = timingSafeEqualStr(cleanReceived, hotp.otp6);
  const isMatch8 = timingSafeEqualStr(cleanReceived, hotp.otp8);

  // 만약 정수로 전달된 경우 대비 (예: "012345" vs 12345)
  const numericReceived = parseInt(cleanReceived, 10);
  const isMatchNumeric = !isNaN(numericReceived) && (
    numericReceived === parseInt(hotp.otp6, 10) ||
    numericReceived === parseInt(hotp.otp8, 10)
  );

  return {
    isValid: isMatch6 || isMatch8 || isMatchNumeric,
    expectedOtp6: hotp.otp6,
    expectedOtp8: hotp.otp8
  };
}

/**
 * 테스트 및 클라이언트용 TLV 페이로드 인코더 헬퍼
 * @param id UID (예: "04DE5F1EACC040")
 * @param otp OTP 문자열 또는 정수 (예: "123456")
 * @param counter 카운터 정수 (예: 1)
 * @param otpFormat 'ascii' | 'binary' | 'hex'
 */
export function buildTlvPayload(
  id: string,
  otp: string | number,
  counter: number,
  otpFormat: 'ascii' | 'binary' | 'hex' = 'ascii'
): string {
  // 1. DF61 (id)
  const idHex = id.trim().replace(/^0x/i, '').toUpperCase();
  const idLen = idHex.length / 2;
  const tlvId = `DF61${idLen.toString(16).padStart(2, '0').toUpperCase()}${idHex}`;

  // 2. DF62 (otp)
  let otpValueHex = '';
  const otpStr = String(otp).trim();
  if (otpFormat === 'ascii') {
    otpValueHex = Buffer.from(otpStr, 'ascii').toString('hex').toUpperCase();
  } else if (otpFormat === 'binary') {
    const num = parseInt(otpStr, 10);
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(num, 0);
    otpValueHex = buf.toString('hex').toUpperCase();
  } else {
    otpValueHex = otpStr.toUpperCase();
  }
  const otpLen = otpValueHex.length / 2;
  const tlvOtp = `DF62${otpLen.toString(16).padStart(2, '0').toUpperCase()}${otpValueHex}`;

  // 3. DF63 (count) - 3바이트 Big-Endian 카운터
  const cntBuf = Buffer.alloc(3);
  cntBuf[0] = (counter >> 16) & 0xFF;
  cntBuf[1] = (counter >> 8) & 0xFF;
  cntBuf[2] = counter & 0xFF;
  const cntHex = cntBuf.toString('hex').toUpperCase();
  const tlvCnt = `DF6303${cntHex}`;

  return `${tlvId}${tlvOtp}${tlvCnt}`;
}
