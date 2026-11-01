// tests/test_runner.js
import assert from 'node:assert';
import {
  hexToBytes,
  bytesToHex,
  calculateAes128Cmac,
  generateCmacSubkeys,
  buildSV2,
  truncateMac,
  verifyNfcAuthMac,
  encryptNfcKey,
  decryptNfcKey,
  calculateHotp,
  verifyHotp,
  parseAuthTlv,
  buildTlvPayload
} from './crypto.js';

console.log('🧪 [NFC Authentication 암호화 표준 + 3바이트 카운터 + DB 키 암호화 검증 시작]\n');

// 0. DB 키 암호화 (Envelope Encryption - AES-256-GCM) 테스트
console.log('0. DB Key Encryption (AES-256-GCM) Test:');
const dummyKek = '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF';
const originalNfcKey = '00000000000000000000000000000000';

const encryptedResult = encryptNfcKey(originalNfcKey, dummyKek);
const decryptedKey = decryptNfcKey(
  encryptedResult.cipherHex,
  encryptedResult.ivHex,
  encryptedResult.tagHex,
  dummyKek
);
assert.strictEqual(decryptedKey, originalNfcKey);
console.log('  ✅ DB 키 암복호화(Envelope Encryption) 정상 동작 확인!\n');

// 1. NIST SP 800-38B 서브키 생성 테스트
const testSessionKey = hexToBytes('3FB5F6E3A807A03D5E3570ACE393776F');
const { K1, K2 } = generateCmacSubkeys(testSessionKey);
assert.strictEqual(bytesToHex(K1), '1C5E18A33EC1D73292FDDAD167EF8B4A');
assert.strictEqual(bytesToHex(K2), '38BC31467D83AE6525FBB5A2CFDF1694');
console.log('1. Subkey Generation Test: ✅ 통과\n');

// 2. Zero-length payload CMAC 계산 및 Truncation 테스트
const fullCmac = calculateAes128Cmac(testSessionKey, Buffer.alloc(0));
assert.strictEqual(bytesToHex(fullCmac), 'E194C7EE12D9F7EE8A65C8331B704386');
const macT = truncateMac(fullCmac);
assert.strictEqual(bytesToHex(macT), '94EED9EE65337086');
console.log('2. Zero-Length Input CMAC Test: ✅ 통과\n');

// 3. 3바이트 Big-Endian 카운터 (6자리 Hex) 검증 테스트
console.log('3. 3바이트 Big-Endian 카운터 (6자리 Hex) 검증 테스트:');

// 3-1. Big-Endian: "00003D" (카운터 61)
const result3B_61 = verifyNfcAuthMac({
  uidHex: '04DE5F1EACC040',
  cntHex: '00003D',
  macHex: '94EED9EE65337086',
  fileReadKeyHex: decryptedKey
});
assert.strictEqual(result3B_61.isValid, true);
assert.strictEqual(result3B_61.counter, 61);
assert.strictEqual(result3B_61.expectedMacT, '94EED9EE65337086');
console.log('  ✅ 3바이트 Big-Endian ("00003D" -> cnt=61) 카운터 인증 성공!');

// 3-2. Big-Endian: "000060" (카운터 96)
const result3B_96 = verifyNfcAuthMac({
  uidHex: '04DE5F1EACC040',
  cntHex: '000060',
  macHex: '96FAD65E40E02794',
  fileReadKeyHex: decryptedKey
});
assert.strictEqual(result3B_96.isValid, true);
assert.strictEqual(result3B_96.counter, 96);
assert.strictEqual(result3B_96.expectedMacT, '96FAD65E40E02794');
console.log('  ✅ 3바이트 Big-Endian ("000060" -> cnt=96) 카운터 인증 성공!');

// 3-3. UID 대소문자 차이 검증 (소문자 UID "04de5f1eacc040")
const resultCase = verifyNfcAuthMac({
  uidHex: '04de5f1eacc040',
  cntHex: '00003D',
  macHex: '94EED9EE65337086',
  fileReadKeyHex: decryptedKey
});
assert.strictEqual(resultCase.isValid, true);
assert.strictEqual(resultCase.expectedMacT, '94EED9EE65337086');
console.log('  ✅ UID 대소문자 불변성 검증 통과 (대문자/소문자 모두 동일한 MAC 생성)!\n');

// 4. 3바이트 이외 길이(예: 12자리/6바이트) 카운터 거부 테스트
console.log('4. 3바이트 이외의 카운터 길이 거부 테스트:');
assert.throws(() => {
  verifyNfcAuthMac({
    uidHex: '04DE5F1EACC040',
    cntHex: '00000000003D',
    macHex: '94EED9EE65337086',
    fileReadKeyHex: decryptedKey
  });
}, /Counter hex must be 6 characters/);
console.log('  ✅ 3바이트(6자리 Hex) 규격 외 입력 거부 확인!\n');

// 5. BER-TLV (DF61, DF62, DF63) 및 HOTP (RFC 4226) 검증 테스트
console.log('5. BER-TLV + HOTP (RFC 4226) 통합 검증 테스트:');
const rfcSecret = Buffer.from('12345678901234567890', 'ascii');
const hotp0 = calculateHotp(rfcSecret, 0, 6);
assert.strictEqual(hotp0.otp6, '755224');
const hotp1 = calculateHotp(rfcSecret, 1, 6);
assert.strictEqual(hotp1.otp6, '287082');
console.log('  ✅ RFC 4226 공식 테스트 벡터 (C=0 -> 755224, C=1 -> 287082) 통과!');

const tlvPayload = buildTlvPayload('0102030405060708090A0B0C0D0E0F10', hotp1.otp6, 1, 'ascii');
const tlvParsed = parseAuthTlv(tlvPayload);
assert.strictEqual(tlvParsed.id, '0102030405060708090A0B0C0D0E0F10');
assert.strictEqual(tlvParsed.otp, '287082');
assert.strictEqual(tlvParsed.counter, 1);
const tlvVerified = verifyHotp(rfcSecret, tlvParsed.counter, tlvParsed.otp);
assert.strictEqual(tlvVerified.isValid, true);
console.log('  ✅ 단일 TLV 파라미터 (DF61/DF62/DF63) 패킹 & 언패킹 & HOTP 검증 성공!\n');

console.log('🎉 [NFC Authentication (SDM MAC & HOTP TLV) 모든 암호화 테스트 100% 통과!]');
