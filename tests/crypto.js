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
// 2. NFC Authentication SDMMAC (NIST SP 800-38B AES-128-CMAC) - v1
// ============================================================================

export function aes128EcbEncryptBlock(key, block) {
  if (key.length !== 16) throw new Error('Key must be 16 bytes');
  if (block.length !== 16) throw new Error('Block must be 16 bytes');
  const cipher = crypto.createCipheriv('aes-128-ecb', key, Buffer.alloc(0));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

export function generateCmacSubkeys(key) {
  const zeroBlock = Buffer.alloc(16);
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

  let X = Buffer.alloc(blockSize);
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
  if (counterBytes.length !== 3) throw new Error('Counter must be 3 bytes');
  const header = Buffer.from([0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80]);
  return Buffer.concat([header, uid, counterBytes]);
}

export function parseCounterToLsbBytes(cntHex) {
  const cleanHex = cntHex.trim().replace(/^0x/i, '');
  if (cleanHex.length !== 6) {
    throw new Error(`Counter hex must be 6 characters (3 bytes), got: ${cleanHex}`);
  }

  const intValue = parseInt(cleanHex, 16);
  if (isNaN(intValue)) {
    throw new Error(`Invalid counter hex: ${cleanHex}`);
  }

  const lsb = Buffer.alloc(3);
  lsb.writeUIntLE(intValue & 0xFFFFFF, 0, 3);

  return {
    lsbBytes: lsb,
    lsb,
    intValue
  };
}

export function verifyNfcAuthMac({ uidHex, cntHex, macHex, fileReadKeyHex }) {
  const uid = hexToBytes(uidHex);
  const fileReadKey = hexToBytes(fileReadKeyHex);
  const parsedCnt = parseCounterToLsbBytes(cntHex);
  const receivedMac = (macHex || '').trim().toUpperCase();

  const sv2 = buildSV2(uid, parsedCnt.lsb);
  const sessionMacKey = calculateAes128Cmac(fileReadKey, sv2);
  const fullCmac = calculateAes128Cmac(sessionMacKey, Buffer.alloc(0));
  const macT = bytesToHex(truncateMac(fullCmac));
  const fullCmacHex = bytesToHex(fullCmac);

  const isValid = timingSafeEqualStr(receivedMac, macT) || timingSafeEqualStr(receivedMac, fullCmacHex);

  return {
    isValid,
    expectedMacT: macT,
    counter: parsedCnt.intValue,
    fullCmac: fullCmacHex
  };
}

// ============================================================================
// 3. RFC 4226 HOTP (HMAC-based One-Time Password) - v2
// ============================================================================

/**
 * RFC 4226 HOTP 생성 함수
 */
export function calculateHotp(keyBytes, counter, digits = 6) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', keyBytes);
  hmac.update(counterBuffer);
  const hs = hmac.digest();

  const offset = hs[19] & 0x0F;
  const binCode = (
    ((hs[offset] & 0x7F) << 24) |
    ((hs[offset + 1] & 0xFF) << 16) |
    ((hs[offset + 2] & 0xFF) << 8) |
    (hs[offset + 3] & 0xFF)
  ) >>> 0;

  const code6 = binCode % 1000000;
  const code8 = binCode % 100000000;

  return {
    otp6: code6.toString().padStart(6, '0'),
    otp8: code8.toString().padStart(8, '0'),
    code: digits === 8 ? code8 : code6,
    binCode,
    fullHash: hs.toString('hex').toUpperCase()
  };
}

/**
 * HOTP 검증 함수
 */
export function verifyHotp(keyBytes, counter, receivedOtp) {
  const hotp = calculateHotp(keyBytes, counter);
  const cleanReceived = String(receivedOtp).trim();

  const isMatch6 = timingSafeEqualStr(cleanReceived, hotp.otp6);
  const isMatch8 = timingSafeEqualStr(cleanReceived, hotp.otp8);

  const numReceived = parseInt(cleanReceived, 10);
  const isMatchNum = !isNaN(numReceived) && (
    numReceived === parseInt(hotp.otp6, 10) ||
    numReceived === parseInt(hotp.otp8, 10)
  );

  return {
    isValid: isMatch6 || isMatch8 || isMatchNum,
    expectedOtp6: hotp.otp6,
    expectedOtp8: hotp.otp8
  };
}

// ============================================================================
// 4. BER-TLV (ISO 7816-4) 파서 및 빌더 - v2
// 지원 태그: DF61 (id), DF62 (otp), DF63 (count)
// ============================================================================

export function parseBerTlv(rawHexInput) {
  const cleanHex = rawHexInput.trim().replace(/^0x/i, '').replace(/\s+/g, '');
  if (!/^[0-9A-Fa-f]+$/.test(cleanHex)) {
    throw new Error('유효한 Hex 문자열이 아닙니다.');
  }
  if (cleanHex.length < 4) {
    throw new Error('TLV 데이터 길이가 너무 짧습니다.');
  }

  const items = new Map();
  let offset = 0;
  const totalLen = cleanHex.length;

  while (offset < totalLen) {
    if (offset + 2 > totalLen) break;

    const firstTagByte = parseInt(cleanHex.substring(offset, offset + 2), 16);
    let tag;

    if ((firstTagByte & 0x1F) === 0x1F) {
      if (offset + 4 > totalLen) throw new Error(`태그 헤더가 잘렸습니다: offset ${offset}`);
      tag = cleanHex.substring(offset, offset + 4).toUpperCase();
      offset += 4;
    } else {
      tag = cleanHex.substring(offset, offset + 2).toUpperCase();
      offset += 2;
    }

    if (offset >= totalLen) throw new Error(`태그(${tag}) 뒤에 길이 필드가 누락되었습니다.`);

    const firstLenByte = parseInt(cleanHex.substring(offset, offset + 2), 16);
    offset += 2;

    let length;
    if (firstLenByte < 0x80) {
      length = firstLenByte;
    } else if (firstLenByte === 0x81) {
      if (offset + 2 > totalLen) throw new Error(`태그(${tag}) 길이(0x81) 잘림`);
      length = parseInt(cleanHex.substring(offset, offset + 2), 16);
      offset += 2;
    } else if (firstLenByte === 0x82) {
      if (offset + 4 > totalLen) throw new Error(`태그(${tag}) 길이(0x82) 잘림`);
      length = parseInt(cleanHex.substring(offset, offset + 4), 16);
      offset += 4;
    } else {
      throw new Error(`지원하지 않는 TLV 길이: 0x${firstLenByte.toString(16)}`);
    }

    const valueHexChars = length * 2;
    if (offset + valueHexChars > totalLen) {
      throw new Error(`태그(${tag})의 값 데이터가 명시된 길이(${length}B)보다 부족합니다.`);
    }

    const valueHex = cleanHex.substring(offset, offset + valueHexChars).toUpperCase();
    offset += valueHexChars;

    items.set(tag, { tag, length, valueHex });
  }

  return items;
}

export function parseAuthTlv(rawHexInput) {
  const items = parseBerTlv(rawHexInput);

  const itemDf61 = items.get('DF61');
  const itemDf62 = items.get('DF62');
  const itemDf63 = items.get('DF63');

  if (!itemDf61) throw new Error('필수 TLV 태그 DF61 (id)가 누락되었습니다.');
  if (!itemDf62) throw new Error('필수 TLV 태그 DF62 (otp)가 누락되었습니다.');
  if (!itemDf63) throw new Error('필수 TLV 태그 DF63 (count)가 누락되었습니다.');

  const id = itemDf61.valueHex.toUpperCase();

  const cntBytes = hexToBytes(itemDf63.valueHex);
  let counter = 0;
  const isAsciiDigits = cntBytes.length > 0 && Array.from(cntBytes).every(b => b >= 0x30 && b <= 0x39);
  if (isAsciiDigits) {
    counter = parseInt(Buffer.from(cntBytes).toString('ascii'), 10);
  } else {
    for (let i = 0; i < cntBytes.length; i++) {
      counter = (counter * 256) + cntBytes[i];
    }
  }

  const otpBytes = hexToBytes(itemDf62.valueHex);
  let otpStr = '';

  if (itemDf62.length === 3 || otpBytes.length === 3) {
    // 3바이트 Packed BCD 포맷 (6자리 OTP: 예: DF62 03 328482 -> "328482")
    const bcdHex = itemDf62.valueHex.toUpperCase();
    if (!/^[0-9]{6}$/.test(bcdHex)) {
      throw new Error(`BCD OTP(DF62)에 유효하지 않은 16진수 문자가 포함되어 있습니다: ${bcdHex}`);
    }
    otpStr = bcdHex;
  } else if (otpBytes.length >= 6 && Array.from(otpBytes).every(b => b >= 0x30 && b <= 0x39)) {
    // ASCII 문자열 호환 (예: 6바이트 "333238343832" -> "328482")
    otpStr = Buffer.from(otpBytes).toString('ascii');
  } else if (otpBytes.length === 4) {
    // 4바이트 Big-Endian 바이너리 정수
    let code = 0;
    for (let i = 0; i < 4; i++) {
      code = (code << 8) | otpBytes[i];
    }
    otpStr = (code % 1000000).toString().padStart(6, '0');
  } else {
    // Hex 문자열 그대로
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

export function buildTlvPayload(id, otp, counter, otpFormat = 'bcd') {
  const idHex = id.trim().replace(/^0x/i, '').toUpperCase();
  const idLen = idHex.length / 2;
  const tlvId = `DF61${idLen.toString(16).padStart(2, '0').toUpperCase()}${idHex}`;

  let otpValueHex = '';
  const otpStr = String(otp).trim();
  if (otpFormat === 'bcd') {
    // 3바이트 Packed BCD 포맷 (예: "328482" -> 3바이트 "328482", TLV: DF6203328482)
    const cleanOtp = otpStr.padStart(6, '0');
    if (!/^[0-9]{6}$/.test(cleanOtp)) {
      throw new Error(`BCD OTP는 6자리 숫자여야 합니다: ${otpStr}`);
    }
    otpValueHex = cleanOtp;
  } else if (otpFormat === 'ascii') {
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

  const cntBuf = Buffer.alloc(3);
  cntBuf[0] = (counter >> 16) & 0xFF;
  cntBuf[1] = (counter >> 8) & 0xFF;
  cntBuf[2] = counter & 0xFF;
  const cntHex = cntBuf.toString('hex').toUpperCase();
  const tlvCnt = `DF6303${cntHex}`;

  return `${tlvId}${tlvOtp}${tlvCnt}`;
}
