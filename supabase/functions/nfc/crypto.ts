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

export function aes128EcbEncryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  if (key.length !== 16) throw new Error('Key must be 16 bytes');
  if (block.length !== 16) throw new Error('Block must be 16 bytes');
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(key), Buffer.alloc(0));
  cipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([cipher.update(Buffer.from(block)), cipher.final()]));
}

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

/**
 * 3바이트(6자리 Hex) 및 6바이트(12자리 Hex) 카운터 모두 지원
 */
export function parseCounter(cntHex: string) {
  const cleanHex = cntHex.trim().replace(/^0x/i, '');
  const candidates: { lsb: Uint8Array; intValue: number }[] = [];

  if (cleanHex.length === 6) {
    // 1) Big-Endian 문자열 (예: "00003D" -> 61)
    const beInt = parseInt(cleanHex, 16);
    const lsbFromBe = new Uint8Array(3);
    lsbFromBe[0] = beInt & 0xFF;
    lsbFromBe[1] = (beInt >> 8) & 0xFF;
    lsbFromBe[2] = (beInt >> 16) & 0xFF;
    candidates.push({ lsb: lsbFromBe, intValue: beInt });

    // 2) Little-Endian 바이트열 (예: "3D0000" -> 61)
    const rawBytes = hexToBytes(cleanHex);
    const leInt = rawBytes[0] | (rawBytes[1] << 8) | (rawBytes[2] << 16);
    candidates.push({ lsb: rawBytes, intValue: leInt });
  } else if (cleanHex.length === 12) {
    // 6바이트 카운터 (12자리 Hex)
    // 1) Big-Endian 6바이트 (예: "00000000003D")
    const last6 = cleanHex.slice(-6);
    const beInt = parseInt(last6, 16);
    const lsbFromBe = new Uint8Array(3);
    lsbFromBe[0] = beInt & 0xFF;
    lsbFromBe[1] = (beInt >> 8) & 0xFF;
    lsbFromBe[2] = (beInt >> 16) & 0xFF;
    candidates.push({ lsb: lsbFromBe, intValue: beInt });

    // 2) Little-Endian 6바이트 (예: "3D0000000000")
    const rawBytes6 = hexToBytes(cleanHex);
    const lsb3 = rawBytes6.subarray(0, 3);
    const leInt = lsb3[0] | (lsb3[1] << 8) | (lsb3[2] << 16);
    candidates.push({ lsb: lsb3, intValue: leInt });
  } else {
    throw new Error(`Counter hex must be 6 or 12 characters (3 or 6 bytes), got: ${cleanHex}`);
  }

  return {
    candidates,
    intValue: candidates[0].intValue
  };
}

export interface VerificationResult {
  isValid: boolean;
  expectedMacT: string;
  counter: number;
  fullCmac: string;
}

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

  let firstExpectedMacT = '';
  let firstFullCmac = '';
  let firstCounter = parsedCnt.intValue;

  for (let i = 0; i < parsedCnt.candidates.length; i++) {
    const candidate = parsedCnt.candidates[i];
    const sv2 = buildSV2(uid, candidate.lsb);
    const sessionMacKey = calculateAes128Cmac(fileReadKey, sv2);
    const fullCmac = calculateAes128Cmac(sessionMacKey, new Uint8Array(0));
    const macT = bytesToHex(truncateMac(fullCmac));
    const fullCmacHex = bytesToHex(fullCmac);

    if (i === 0) {
      firstExpectedMacT = macT;
      firstFullCmac = fullCmacHex;
      firstCounter = candidate.intValue;
    }

    if (timingSafeEqualStr(receivedMac, macT) || timingSafeEqualStr(receivedMac, fullCmacHex)) {
      return {
        isValid: true,
        expectedMacT: macT,
        counter: candidate.intValue,
        fullCmac: fullCmacHex
      };
    }
  }

  return {
    isValid: false,
    expectedMacT: firstExpectedMacT,
    counter: firstCounter,
    fullCmac: firstFullCmac
  };
}
