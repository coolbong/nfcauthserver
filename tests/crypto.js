// tests/crypto.js
// Node.js & Deno 호환 순수 암호화 모듈 (외부 의존성 없음, node:crypto 기반)
import crypto from 'node:crypto';

/**
 * Hex 문자열을 Buffer로 변환
 */
export function hexToBytes(hex) {
  const cleanHex = hex.trim().replace(/^0x/i, '');
  if (cleanHex.length % 2 !== 0) {
    throw new Error(`Invalid hex length: ${cleanHex.length}`);
  }
  return Buffer.from(cleanHex, 'hex');
}

/**
 * Buffer를 Hex 문자열로 변환 (대문자)
 */
export function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex').toUpperCase();
}

/**
 * Constant-time 비교 (타이밍 공격 방지)
 */
export function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
}

// ============================================================================
// 1. DB 키 암호화/복호화 (Envelope Encryption - AES-256-GCM)
// ============================================================================

/**
 * KEK(Key Encryption Key, 32바이트)를 사용하여 NTAG 키(16바이트)를 AES-256-GCM으로 암호화
 * @param {string} plainKeyHex 암호화할 NTAG 424 DNA AES-128 키 (32 hex chars)
 * @param {string} kekHex 32바이트 마스터 KEK (64 hex chars)
 * @returns {{ cipherHex: string, ivHex: string, tagHex: string }}
 */
export function encryptNfcKey(plainKeyHex, kekHex) {
  const plainBytes = hexToBytes(plainKeyHex);
  const kekBytes = hexToBytes(kekHex);
  if (kekBytes.length !== 32) throw new Error('KEK must be 32 bytes (64 hex chars)');

  const iv = crypto.randomBytes(12); // GCM 표준 12바이트 IV
  const cipher = crypto.createCipheriv('aes-256-gcm', kekBytes, iv);
  const encrypted = Buffer.concat([cipher.update(plainBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    cipherHex: bytesToHex(encrypted),
    ivHex: bytesToHex(iv),
    tagHex: bytesToHex(authTag)
  };
}

/**
 * KEK를 사용하여 DB에 저장된 암호화된 키를 복호화
 * @param {string} cipherHex 암호화된 데이터 hex
 * @param {string} ivHex 12바이트 IV hex
 * @param {string} tagHex 16바이트 Auth Tag hex
 * @param {string} kekHex 32바이트 마스터 KEK (64 hex chars)
 * @returns {string} 복호화된 NTAG AES-128 키 hex (32 chars)
 */
export function decryptNfcKey(cipherHex, ivHex, tagHex, kekHex) {
  const cipherBytes = hexToBytes(cipherHex);
  const ivBytes = hexToBytes(ivHex);
  const tagBytes = hexToBytes(tagHex);
  const kekBytes = hexToBytes(kekHex);
  if (kekBytes.length !== 32) throw new Error('KEK must be 32 bytes (64 hex chars)');

  const decipher = crypto.createDecipheriv('aes-256-gcm', kekBytes, ivBytes);
  decipher.setAuthTag(tagBytes);
  const decrypted = Buffer.concat([decipher.update(cipherBytes), decipher.final()]);

  return bytesToHex(decrypted);
}

// ============================================================================
// 2. NTAG 424 DNA SDMMAC (NIST SP 800-38B AES-128-CMAC)
// ============================================================================

/**
 * AES-128-ECB 단일 블록(16바이트) 암호화 (PKCS7 패딩 없음)
 */
export function aes128EcbEncryptBlock(key, block) {
  if (key.length !== 16) throw new Error('Key must be 16 bytes');
  if (block.length !== 16) throw new Error('Block must be 16 bytes');
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

/**
 * NIST SP 800-38B 서브키(K1, K2) 생성
 */
export function generateCmacSubkeys(key) {
  const zeroBlock = Buffer.alloc(16, 0);
  const L = aes128EcbEncryptBlock(key, zeroBlock);
  const constRb = 0x87;

  function shiftLeftOneBit(src) {
    const dst = Buffer.alloc(16);
    let carry = 0;
    for (let i = 15; i >= 0; i--) {
      const nextCarry = (src[i] & 0x80) ? 1 : 0;
      dst[i] = ((src[i] << 1) & 0xFF) | carry;
      carry = nextCarry;
    }
    return { dst, msb: (src[0] & 0x80) !== 0 };
  }

  // K1 계산
  const { dst: shiftedL, msb: msbL } = shiftLeftOneBit(L);
  const K1 = Buffer.from(shiftedL);
  if (msbL) {
    K1[15] ^= constRb;
  }

  // K2 계산
  const { dst: shiftedK1, msb: msbK1 } = shiftLeftOneBit(K1);
  const K2 = Buffer.from(shiftedK1);
  if (msbK1) {
    K2[15] ^= constRb;
  }

  return { K1, K2 };
}

/**
 * AES-128-CMAC 계산 (NIST SP 800-38B 표준)
 */
export function calculateAes128Cmac(key, message) {
  const { K1, K2 } = generateCmacSubkeys(key);
  const blockSize = 16;
  const msgLen = message.length;
  const n = Math.ceil(msgLen / blockSize) || 1;
  const isComplete = (msgLen > 0) && (msgLen % blockSize === 0);

  let lastBlock = Buffer.alloc(blockSize);
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

  let X = Buffer.alloc(blockSize, 0);
  for (let i = 0; i < n - 1; i++) {
    const M_i = message.subarray(i * blockSize, (i + 1) * blockSize);
    const Y = Buffer.alloc(blockSize);
    for (let j = 0; j < blockSize; j++) {
      Y[j] = X[j] ^ M_i[j];
    }
    X = aes128EcbEncryptBlock(key, Y);
  }

  const finalY = Buffer.alloc(blockSize);
  for (let j = 0; j < blockSize; j++) {
    finalY[j] = X[j] ^ lastBlock[j];
  }
  return aes128EcbEncryptBlock(key, finalY);
}

/**
 * 16바이트 CMAC에서 홀수 인덱스 바이트 8개를 취해 Truncated MAC (MACt) 생성
 */
export function truncateMac(cmac16Bytes) {
  if (cmac16Bytes.length !== 16) throw new Error('CMAC must be 16 bytes');
  const macT = Buffer.alloc(8);
  let j = 0;
  for (let i = 0; i < 16; i++) {
    if (i % 2 !== 0) {
      macT[j++] = cmac16Bytes[i];
    }
  }
  return macT;
}

/**
 * SDM 세션 MAC 키 유도 벡터 (SV2) 생성 (16바이트)
 */
export function buildSV2(uid, counterBytes) {
  if (uid.length !== 7) throw new Error('UID must be 7 bytes');
  if (counterBytes.length !== 3) throw new Error('Counter must be 3 bytes');
  const header = Buffer.from([0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80]);
  return Buffer.concat([header, uid, counterBytes]);
}

export function parseCounterToLsbBytes(counterInput) {
  if (typeof counterInput === 'number') {
    const buf = Buffer.alloc(3);
    buf.writeUIntLE(counterInput & 0xFFFFFF, 0, 3);
    return { bytes: buf, intValue: counterInput };
  }
  const cleanHex = counterInput.trim().replace(/^0x/i, '');
  if (cleanHex.length !== 6) {
    throw new Error(`Counter hex must be 6 characters (3 bytes), got: ${cleanHex}`);
  }

  const beInt = parseInt(cleanHex, 16);
  const lsbFromBe = Buffer.alloc(3);
  lsbFromBe.writeUIntLE(beInt, 0, 3);

  const rawBytes = Buffer.from(cleanHex, 'hex');
  const leInt = rawBytes.readUIntLE(0, 3);

  return {
    lsbFromBigEndian: lsbFromBe,
    beIntValue: beInt,
    rawBytesAsLsb: rawBytes,
    leIntValue: leInt
  };
}

/**
 * NTAG 424 DNA SDMMAC 검증 함수
 */
export function verifyNtag424Mac({ uidHex, cntHex, macHex, fileReadKeyHex }) {
  const uid = hexToBytes(uidHex);
  const fileReadKey = hexToBytes(fileReadKeyHex);
  const parsedCnt = parseCounterToLsbBytes(cntHex);
  const receivedMac = macHex.trim().toUpperCase();

  // 1차 시도: Big-Endian 문자열 기반 카운터
  const sv2_1 = buildSV2(uid, parsedCnt.lsbFromBigEndian);
  const sessionMacKey_1 = calculateAes128Cmac(fileReadKey, sv2_1);
  const fullCmac_1 = calculateAes128Cmac(sessionMacKey_1, Buffer.alloc(0));
  const macT_1 = bytesToHex(truncateMac(fullCmac_1));
  const fullCmacHex_1 = bytesToHex(fullCmac_1);

  if (timingSafeEqualStr(receivedMac, macT_1) || timingSafeEqualStr(receivedMac, fullCmacHex_1)) {
    return {
      isValid: true,
      expectedMacT: macT_1,
      counter: parsedCnt.beIntValue,
      fullCmac: fullCmacHex_1
    };
  }

  // 2차 시도: Little-Endian 문자열 기반 카운터
  const sv2_2 = buildSV2(uid, parsedCnt.rawBytesAsLsb);
  const sessionMacKey_2 = calculateAes128Cmac(fileReadKey, sv2_2);
  const fullCmac_2 = calculateAes128Cmac(sessionMacKey_2, Buffer.alloc(0));
  const macT_2 = bytesToHex(truncateMac(fullCmac_2));
  const fullCmacHex_2 = bytesToHex(fullCmac_2);

  if (timingSafeEqualStr(receivedMac, macT_2) || timingSafeEqualStr(receivedMac, fullCmacHex_2)) {
    return {
      isValid: true,
      expectedMacT: macT_2,
      counter: parsedCnt.leIntValue,
      fullCmac: fullCmacHex_2
    };
  }

  return {
    isValid: false,
    expectedMacT: macT_1,
    counter: parsedCnt.beIntValue,
    fullCmac: fullCmacHex_1
  };
}
