// tests/test_auth_hotp.js
// NFC Authentication TLV (DF61, DF62, DF63) + HOTP (RFC 4226) 종합 단위 테스트 러너
import assert from 'node:assert';
import {
  hexToBytes,
  bytesToHex,
  calculateHotp,
  verifyHotp,
  parseBerTlv,
  parseAuthTlv,
  buildTlvPayload,
  encryptNfcKey,
  decryptNfcKey
} from './crypto.js';

console.log('🧪 ===============================================================');
console.log('🧪 [NFC Authentication: BER-TLV + HOTP (RFC 4226) 단위 테스트 시작]');
console.log('🧪 ===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: RFC 4226 공식 표준 테스트 벡터 검증
// ----------------------------------------------------------------------------
console.log('1. RFC 4226 공식 표준 테스트 벡터 검증 (Secret: "12345678901234567890")');
const rfcSecret = Buffer.from('12345678901234567890', 'ascii');
const rfcExpected = [
  '755224', // C = 0
  '287082', // C = 1
  '359152', // C = 2
  '969429', // C = 3
  '338314', // C = 4
  '254676', // C = 5
  '287922', // C = 6
  '162583', // C = 7
  '399871', // C = 8
  '520489'  // C = 9
];

for (let c = 0; c < rfcExpected.length; c++) {
  const result = calculateHotp(rfcSecret, c, 6);
  assert.strictEqual(result.otp6, rfcExpected[c], `C=${c}에서 HOTP 불일치`);
  const verifyRes = verifyHotp(rfcSecret, c, rfcExpected[c]);
  assert.strictEqual(verifyRes.isValid, true, `C=${c}에서 검증 실패`);
}
console.log('  ✅ RFC 4226 10개 공식 테스트 벡터 100% 통과!\n');

// ----------------------------------------------------------------------------
// Test 2: BER-TLV 파서 및 빌더 검증 (DF61, DF62, DF63)
// ----------------------------------------------------------------------------
console.log('2. BER-TLV (DF61: id, DF62: otp, DF63: count) 인코딩 & 디코딩 테스트');
const testId = '04DE5F1EACC040';
const testOtp = '287082';
const testCount = 1;

// A. 3바이트 Packed BCD OTP 빌드 (표준: DF62 03 328482)
const tlvBcd = buildTlvPayload(testId, testOtp, testCount, 'bcd');
console.log('  • 생성된 TLV (3B BCD OTP):', tlvBcd);
assert.ok(tlvBcd.includes('DF6203287082'), 'DF62 03 BCD 인코딩 검증');
const parsedBcd = parseAuthTlv(tlvBcd);
assert.strictEqual(parsedBcd.id, testId);
assert.strictEqual(parsedBcd.otp, testOtp);
assert.strictEqual(parsedBcd.counter, testCount);
console.log('  ✅ 3바이트 BCD 포맷 TLV 파싱 성공!');

// B. ASCII OTP 호환성 검증
const tlvAscii = buildTlvPayload(testId, testOtp, testCount, 'ascii');
console.log('  • 생성된 TLV (ASCII OTP):', tlvAscii);
const parsedAscii = parseAuthTlv(tlvAscii);
assert.strictEqual(parsedAscii.id, testId);
assert.strictEqual(parsedAscii.otp, testOtp);
assert.strictEqual(parsedAscii.counter, testCount);
console.log('  ✅ ASCII 포맷 TLV 파싱 성공!');

// C. Binary 정수 OTP 호환성 검증
const tlvBinary = buildTlvPayload(testId, testOtp, testCount, 'binary');
console.log('  • 생성된 TLV (Binary 4B OTP):', tlvBinary);
const parsedBinary = parseAuthTlv(tlvBinary);
assert.strictEqual(parsedBinary.id, testId);
assert.strictEqual(parsedBinary.otp, testOtp);
assert.strictEqual(parsedBinary.counter, testCount);
console.log('  ✅ Binary 정수 포맷 TLV 파싱 성공!');

// D. 16바이트 (32자리 HEX) 스마트카드 UID + 3바이트 BCD OTP 빌드 및 파싱 검증
const test16ByteId = '0102030405060708090A0B0C0D0E0F10';
const tlv16B = buildTlvPayload(test16ByteId, testOtp, testCount, 'bcd');
console.log('  • 생성된 16B UID + BCD OTP TLV:', tlv16B);
assert.strictEqual(tlv16B, 'DF61100102030405060708090A0B0C0D0E0F10DF6203287082DF6303000001');
const parsed16B = parseAuthTlv(tlv16B);
assert.strictEqual(parsed16B.id, test16ByteId);
assert.strictEqual(parsed16B.otp, testOtp);
assert.strictEqual(parsed16B.items.get('DF61').length, 16);
assert.strictEqual(parsed16B.items.get('DF62').length, 3);
console.log('  ✅ 16바이트 UID + 3바이트 BCD OTP 스마트카드 TLV 파싱 성공!\n');

// ----------------------------------------------------------------------------
// Test 3: DB 키 암호화(Envelope Encryption)와 결합된 HOTP 인증 테스트
// ----------------------------------------------------------------------------
console.log('3. DB 키(AES-128 대칭키) 기반 HOTP 엔드투엔드 검증');
const dummyKek = '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF';
const plainNfcKey = '00000000000000000000000000000000'; // DB 등록 기본키

// DB 저장 시뮬레이션
const encrypted = encryptNfcKey(plainNfcKey, dummyKek);
const decryptedKeyHex = decryptNfcKey(encrypted.cipherHex, encrypted.ivHex, encrypted.tagHex, dummyKek);
assert.strictEqual(decryptedKeyHex, plainNfcKey);

const nfcKeyBytes = hexToBytes(decryptedKeyHex);

// 카운터 1001에 대해 스마트카드가 생성한 OTP 계산
const currentCounter = 1001;
const cardHotp = calculateHotp(nfcKeyBytes, currentCounter, 6);
console.log(`  • 카운터 #${currentCounter} HOTP: ${cardHotp.otp6}`);

// 스마트카드가 단일 TLV 파라미터 생성
const cardPayload = buildTlvPayload('04DE5F1EACC040', cardHotp.otp6, currentCounter, 'ascii');
console.log('  • 전송할 단일 TLV 페이로드:', cardPayload);

// 서버 수신 및 파싱
const received = parseAuthTlv(cardPayload);
assert.strictEqual(received.id, '04DE5F1EACC040');
assert.strictEqual(received.counter, currentCounter);
assert.strictEqual(received.otp, cardHotp.otp6);

// 서버 HOTP 검증
const serverCheck = verifyHotp(nfcKeyBytes, received.counter, received.otp);
assert.strictEqual(serverCheck.isValid, true, '정상 OTP 검증 실패');
console.log('  ✅ 정상 정품 태그 HOTP 검증 성공 (AUTHENTIC)!\n');

// ----------------------------------------------------------------------------
// Test 4: 위조 OTP 차단 (INVALID_OTP) 테스트
// ----------------------------------------------------------------------------
console.log('4. 위조된 OTP 차단 테스트');
const forgedPayload = buildTlvPayload('04DE5F1EACC040', '000000', currentCounter, 'ascii');
const parsedForged = parseAuthTlv(forgedPayload);
const forgedCheck = verifyHotp(nfcKeyBytes, parsedForged.counter, parsedForged.otp);
assert.strictEqual(forgedCheck.isValid, false, '위조 OTP가 통과되었습니다');
console.log('  ✅ 위조된 OTP 차단 확인 (INVALID_OTP 정상 동작)!\n');

// ----------------------------------------------------------------------------
// Test 5: 카운터 파싱 다중 바이트 길이 호환성 테스트
// ----------------------------------------------------------------------------
console.log('5. 카운터 길이 호환성 테스트 (1B, 2B, 3B, 4B)');
const tlv1B = 'DF610704DE5F1EACC040DF6206313233343536DF630105'; // cnt = 5
assert.strictEqual(parseAuthTlv(tlv1B).counter, 5);

const tlv2B = 'DF610704DE5F1EACC040DF6206313233343536DF63020100'; // cnt = 256
assert.strictEqual(parseAuthTlv(tlv2B).counter, 256);

const tlv3B = 'DF610704DE5F1EACC040DF6206313233343536DF630300003D'; // cnt = 61
assert.strictEqual(parseAuthTlv(tlv3B).counter, 61);

const tlv4B = 'DF610704DE5F1EACC040DF6206313233343536DF6304000003EA'; // cnt = 1002
assert.strictEqual(parseAuthTlv(tlv4B).counter, 1002);
console.log('  ✅ 1B, 2B, 3B, 4B 카운터 길이 디코딩 100% 호환 확인!\n');

console.log('🎉 ===============================================================');
console.log('🎉 [BER-TLV + HOTP (RFC 4226) 모든 단위 테스트 100% 통과!]');
console.log('🎉 ===============================================================');
