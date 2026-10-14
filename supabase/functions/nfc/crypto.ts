// supabase/functions/nfc/crypto.ts
// Deno 및 Web 표준 호환 NTAG 424 DNA 보안 연산 및 DB 키 복호화 모듈
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
 * Constant-time 비교 (타이밍 공격 방지)
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

/**
 * DB에 저장된 암호화된 NTAG 키를 Web Crypto API로 안전하게 복호화
 */
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
// 2. NTAG 424 DNA SDMMAC (NIST SP 800-38B AES-128-CMAC)
// ============================================================================

/**
 * AES-128-ECB 단일 블록(16바이트) 암호화
 * Deno 호환성을 위해 iv 인자에 Buffer.alloc(0)을 전달합니다.
 */
export function aes128EcbEncryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  if (key.length !== 16) throw new Error('Key must be 16 bytes');
  if (block.length !== 16) throw new Error('Block must be 16 bytes');
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(key), Buffer.alloc(0));
  cipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([cipher.update(Buffer.from(block)), cipher.final()]));
}

/**
 * NIST SP 800-38B 서브키(K1, K2) 생성
 */
export function generateCmacSubkeys(key: Uint8Array): { K1: Uint8Array; K2: Uint8Array } {
  const zeroBlock = new Uint8Array(16);
  const L = aes128EcbEncryptBlock(key, zeroBlock);
  const constRb = 0x87;

  function shiftLeftOneBit(src: Uint8Array) {
    const dst = new Uint8Array(16);
    let carry = 0;
    for (let i = 15; i >= 0; i--) {
      const nextCarry = (src[i] & 0x80) ? 1 : 0;
      dst[i] = ((src[i] << 1) & 0xFF) | carry;
      carry = nextCarry;
    }
    return { dst, msb: (src[0] & 0x80) !== 0 };
  }

  const { dst: shiftedL, msb: msbL } = shiftLeftOneBit(L);
  const K1 = new Uint8Array(shiftedL);
  if (msbL) {
    K1[15] ^= constRb;
  }

  const { dst: shiftedK1, msb: msbK1 } = shiftLeftOneBit(K1);
  const K2 = new Uint8Array(shiftedK1);
  if (msbK1) {
    K2[15] ^= constRb;
  }

  return { K1, K2 };
}

/**
 * NIST SP 800-38B AES-128-CMAC 계산
 */
export function calculateAes128Cmac(key: Uint8Array, message: Uint8Array): Uint8Array {
  const { K1, K2 } = generateCmacSubkeys(key);
  const blockSize = 16;
  const msgLen = message.length;
  const n = Math.ceil(msgLen / blockSize) || 1;
  const isComplete = (msgLen > 0) && (msgLen % blockSize === 0);

  let lastBlock = new Uint8Array(blockSize);
  if (isComplete) {
    const srcLast = message.subarray((n - 1) * blockSize, n * blockSize);
    for (let i = 0; i < blockSize; i++) {
      lastBlock[i] = srcLast[i] ^ K1[i];
    }
  } else {
    const offset = (n - 1) * blockSize;
    const remaining = msgLen - offset;
    for (let i = 0; i < remaining; i++) {
      lastBlock[i] = message[offset + i];
    }
    lastBlock[remaining] = 0x80;
    for (let i = remaining + 1; i < blockSize; i++) {
      lastBlock[i] = 0x00;
    }
    for (let i = 0; i < blockSize; i++) {
      lastBlock[i] ^= K2[i];
    }
  }

  let X = new Uint8Array(blockSize);
  for (let i = 0; i < n - 1; i++) {
    const M_i = message.subarray(i * blockSize, (i + 1) * blockSize);
    const Y = new Uint8Array(blockSize);
    for (let j = 0; j < blockSize; j++) {
      Y[j] = X[j] ^ M_i[j];
    }
    X = aes128EcbEncryptBlock(key, Y);
  }

  const finalY = new Uint8Array(blockSize);
  for (let j = 0; j < blockSize; j++) {
    finalY[j] = X[j] ^ lastBlock[j];
  }
  return aes128EcbEncryptBlock(key, finalY);
}

/**
 * 16바이트 CMAC에서 홀수 인덱스(1,3,5,7,9,11,13,15) 8바이트를 취해 MACt 생성
 */
export function truncateMac(cmac16Bytes: Uint8Array): Uint8Array {
  if (cmac16Bytes.length !== 16) throw new Error('CMAC must be 16 bytes');
  const macT = new Uint8Array(8);
  let j = 0;
  for (let i = 0; i < 16; i++) {
    if (i % 2 !== 0) {
      macT[j++] = cmac16Bytes[i];
    }
  }
  return macT;
}

/**
 * SDM 세션 유도 벡터 SV2 생성 (16바이트)
 * SV2 = 3CC3 0001 0080 || UID (7B) || SDMReadCtr (3B Little-Endian)
 */
export function buildSV2(uid: Uint8Array, counterBytes: Uint8Array): Uint8Array {
  if (uid.length !== 7) throw new Error('UID must be 7 bytes');
  if (counterBytes.length !== 3) throw new Error('Counter must be 3 bytes');
  const header = new Uint8Array([0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80]);
  const out = new Uint8Array(16);
  out.set(header, 0);
  out.set(uid, 6);
  out.set(counterBytes, 13);
  return out;
}

export function parseCounter(cntHex: string) {
  const cleanHex = cntHex.trim().replace(/^0x/i, '');
  if (cleanHex.length !== 6) {
    throw new Error(`Counter hex must be 6 characters (3 bytes), got: ${cleanHex}`);
  }

  const beInt = parseInt(cleanHex, 16);
  const lsbFromBe = new Uint8Array(3);
  lsbFromBe[0] = beInt & 0xFF;
  lsbFromBe[1] = (beInt >> 8) & 0xFF;
  lsbFromBe[2] = (beInt >> 16) & 0xFF;

  const rawBytes = hexToBytes(cleanHex);
  const leInt = rawBytes[0] | (rawBytes[1] << 8) | (rawBytes[2] << 16);

  return {
    lsbFromBe,
    beInt,
    rawBytes,
    leInt
  };
}

export interface VerificationResult {
  isValid: boolean;
  expectedMacT: string;
  counter: number;
  fullCmac: string;
}

/**
 * NTAG 424 DNA MAC 검증
 */
export function verifyNtag424Mac(
  uidHex: string,
  cntHex: string,
  macHex: string,
  fileReadKeyHex: string
): VerificationResult {
  const uid = hexToBytes(uidHex);
  const fileReadKey = hexToBytes(fileReadKeyHex);
  const parsedCnt = parseCounter(cntHex);
  const receivedMac = macHex.trim().toUpperCase();

  // 1차 시도: Big-Endian 문자열 기반 카운터
  const sv2_1 = buildSV2(uid, parsedCnt.lsbFromBe);
  const sessionMacKey_1 = calculateAes128Cmac(fileReadKey, sv2_1);
  const fullCmac_1 = calculateAes128Cmac(sessionMacKey_1, new Uint8Array(0));
  const macT_1 = bytesToHex(truncateMac(fullCmac_1));
  const fullCmacHex_1 = bytesToHex(fullCmac_1);

  if (timingSafeEqualStr(receivedMac, macT_1) || timingSafeEqualStr(receivedMac, fullCmacHex_1)) {
    return {
      isValid: true,
      expectedMacT: macT_1,
      counter: parsedCnt.beInt,
      fullCmac: fullCmacHex_1
    };
  }

  // 2차 시도: Little-Endian 문자열 기반 카운터
  const sv2_2 = buildSV2(uid, parsedCnt.rawBytes);
  const sessionMacKey_2 = calculateAes128Cmac(fileReadKey, sv2_2);
  const fullCmac_2 = calculateAes128Cmac(sessionMacKey_2, new Uint8Array(0));
  const macT_2 = bytesToHex(truncateMac(fullCmac_2));
  const fullCmacHex_2 = bytesToHex(fullCmac_2);

  if (timingSafeEqualStr(receivedMac, macT_2) || timingSafeEqualStr(receivedMac, fullCmacHex_2)) {
    return {
      isValid: true,
      expectedMacT: macT_2,
      counter: parsedCnt.leInt,
      fullCmac: fullCmacHex_2
    };
  }

  return {
    isValid: false,
    expectedMacT: macT_1,
    counter: parsedCnt.beInt,
    fullCmac: fullCmacHex_1
  };
}
