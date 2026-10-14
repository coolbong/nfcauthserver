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

export function encryptNfcKey(plainKeyHex, kekHex) {
  const plainBytes = hexToBytes(plainKeyHex);
  const kekBytes = hexToBytes(kekHex);
  if (kekBytes.length !== 32) throw new Error('KEK must be 32 bytes (64 hex chars)');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kekBytes, iv);
  const encrypted = Buffer.concat([cipher.update(plainBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    cipherHex: bytesToHex(encrypted),
    ivHex: bytesToHex(iv),
    tagHex: bytesToHex(authTag)
  };
}

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

export function aes128EcbEncryptBlock(key, block) {
  if (key.length !== 16) throw new Error('Key must be 16 bytes');
  if (block.length !== 16) throw new Error('Block must be 16 bytes');
  const cipher = crypto.createCipheriv('aes-128-ecb', key, Buffer.alloc(0));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

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

  const { dst: shiftedL, msb: msbL } = shiftLeftOneBit(L);
  const K1 = Buffer.from(shiftedL);
  if (msbL) {
    K1[15] ^= constRb;
  }

  const { dst: shiftedK1, msb: msbK1 } = shiftLeftOneBit(K1);
  const K2 = Buffer.from(shiftedK1);
  if (msbK1) {
    K2[15] ^= constRb;
  }

  return { K1, K2 };
}

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

export function buildSV2(uid, counterBytes) {
  if (uid.length !== 7) throw new Error('UID must be 7 bytes');
  if (counterBytes.length !== 3) throw new Error('Counter must be 3 bytes for NTAG SV2');
  const header = Buffer.from([0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80]);
  return Buffer.concat([header, uid, counterBytes]);
}

/**
 * 카운터 파싱 함수: 3바이트(6자리 Hex) 및 6바이트(12자리 Hex) 모두 지원!
 * NTAG 424 DNA 하드웨어 규격(SV2)에서는 3바이트 LSB-first를 사용하므로,
 * 6바이트 카운터가 넘어온 경우 정확한 3바이트 LSB 바이트열을 추출합니다.
 */
export function parseCounterToLsbBytes(counterInput) {
  if (typeof counterInput === 'number' || typeof counterInput === 'bigint') {
    const num = Number(counterInput);
    const buf = Buffer.alloc(3);
    buf.writeUIntLE(num & 0xFFFFFF, 0, 3);
    return {
      lsbBytes: buf,
      intValue: num,
      candidates: [
        { lsb: buf, intValue: num }
      ]
    };
  }

  const cleanHex = counterInput.trim().replace(/^0x/i, '');
  const candidates = [];

  // Case A: 6자리 Hex (3바이트 카운터)
  if (cleanHex.length === 6) {
    // 1) Big-Endian 문자열 (예: "00003D" -> 61)
    const beInt = parseInt(cleanHex, 16);
    const lsbFromBe = Buffer.alloc(3);
    lsbFromBe.writeUIntLE(beInt, 0, 3);
    candidates.push({ lsb: lsbFromBe, intValue: beInt });

    // 2) Little-Endian 바이트열 (예: "3D0000" -> 61)
    const rawBytes = Buffer.from(cleanHex, 'hex');
    const leInt = rawBytes.readUIntLE(0, 3);
    candidates.push({ lsb: rawBytes, intValue: leInt });
  }
  // Case B: 12자리 Hex (6바이트 카운터)
  else if (cleanHex.length === 12) {
    // 1) Big-Endian 6바이트 문자열 (예: "00000000003D" -> 하위 3바이트 "00003D")
    const last6 = cleanHex.slice(-6);
    const beInt = parseInt(cleanHex, 16);
    const lsbFromBe = Buffer.alloc(3);
    lsbFromBe.writeUIntLE(parseInt(last6, 16), 0, 3);
    candidates.push({ lsb: lsbFromBe, intValue: beInt });

    // 2) Little-Endian 6바이트 바이트열 (예: "3D0000000000" -> 앞의 3바이트 "3D0000")
    const rawBytes6 = Buffer.from(cleanHex, 'hex');
    const lsb3 = rawBytes6.subarray(0, 3);
    const leInt = rawBytes6.readUIntLE(0, 6);
    candidates.push({ lsb: lsb3, intValue: leInt });
  } else {
    throw new Error(`Counter hex must be 6 or 12 characters (3 or 6 bytes), got: ${cleanHex}`);
  }

  return {
    candidates,
    intValue: candidates[0].intValue
  };
}

/**
 * NTAG 424 DNA SDMMAC 검증 함수 (3바이트 & 6바이트 카운터 완벽 지원)
 */
export function verifyNtag424Mac({ uidHex, cntHex, macHex, fileReadKeyHex }) {
  const uid = hexToBytes(uidHex);
  const fileReadKey = hexToBytes(fileReadKeyHex);
  const parsedCnt = parseCounterToLsbBytes(cntHex);
  const receivedMac = macHex.trim().toUpperCase();

  let firstExpectedMacT = '';
  let firstFullCmac = '';
  let firstCounter = parsedCnt.intValue;

  for (let i = 0; i < parsedCnt.candidates.length; i++) {
    const candidate = parsedCnt.candidates[i];
    const sv2 = buildSV2(uid, candidate.lsb);
    const sessionMacKey = calculateAes128Cmac(fileReadKey, sv2);
    const fullCmac = calculateAes128Cmac(sessionMacKey, Buffer.alloc(0));
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
