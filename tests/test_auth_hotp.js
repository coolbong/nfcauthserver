// tests/test_auth_hotp.js
// RFC 4226 HOTP 및 BER-TLV 파서 단위 테스트
import assert from 'assert';
import {
  calculateHotp,
  verifyHotp,
  parseAuthTlv,
  buildTlvPayload,
  hexToBytes,
  bytesToHex,
  encryptNfcKey,
  decryptNfcKey
} from './crypto.js';

console.log('🧪 ===============================================================');
console.log('🧪 [NFC Authentication: BER-TLV + HOTP (RFC 4226) 단위 테스트 시작]');
console.log('🧪 ===============================================================\n');

// 1. RFC 4226 공식 표준 테스트 벡터 검증 (Secret: "12345678901234567890" ASCII, 20바이트)
console.log('1. RFC 4226 공식 표준 테스트 벡터 검증 (Secret: "12345678901234567890")');
const rfcSecretAscii = '12345678901234567890';
const rfcSecretBytes = Buffer.from(rfcSecretAscii, 'ascii');

const rfcExpectedValues = [
  { count: 0, otp: '755224' },
  { count: 1, otp: '287082' },
  { count: 2, otp: '359152' },
  { count: 3, otp: '969429' },
  { count: 4, otp: '338314' },
  { count: 5, otp: '254676' },
  { count: 6, otp: '287922' },
  { count: 7, otp: '162583' },
  { count: 8, otp: '399871' },
  { count: 9, otp: '520489' }
];

for (const exp of rfcExpectedValues) {
  const result = calculateHotp(rfcSecretBytes, exp.count, 6);
  assert.strictEqual(result.otp6, exp.otp, `RFC 4226 Test Vector Failure for Count: ${exp.count}`);
}
console.log('  ✅ RFC 4226 10개 공식 테스트 벡터 100% 통과!\n');

// 2. BER-TLV (DF61: 16B id, DF62: otp, DF63: count) 인코딩 & 디코딩 테스트
console.log('2. BER-TLV (DF61: 16B id, DF62: otp, DF63: count) 인코딩 & 디코딩 테스트');
const sample16BUid = '0102030405060708090A0B0C0D0E0F10';
const sampleCount = 1;
const sampleOtp = '287082';

// 2-1. 3바이트 Packed BCD OTP
const tlvBcd = buildTlvPayload(sample16BUid, sampleOtp, sampleCount, 'bcd');
console.log('  • 생성된 TLV (3B BCD OTP):', tlvBcd);
const parsedBcd = parseAuthTlv(tlvBcd);
assert.strictEqual(parsedBcd.id, sample16BUid);
assert.strictEqual(parsedBcd.otp, sampleOtp);
assert.strictEqual(parsedBcd.counter, sampleCount);
console.log('  ✅ 3바이트 BCD 포맷 TLV 파싱 성공!');

// 2-2. 6바이트 ASCII 문자열 OTP
const tlvAscii = buildTlvPayload(sample16BUid, sampleOtp, sampleCount, 'ascii');
console.log('  • 생성된 TLV (ASCII OTP):', tlvAscii);
const parsedAscii = parseAuthTlv(tlvAscii);
assert.strictEqual(parsedAscii.id, sample16BUid);
assert.strictEqual(parsedAscii.otp, sampleOtp);
assert.strictEqual(parsedAscii.counter, sampleCount);
console.log('  ✅ ASCII 포맷 TLV 파싱 성공!');

// 2-3. 4바이트 Binary OTP
const tlvBinary = buildTlvPayload(sample16BUid, sampleOtp, sampleCount, 'binary');
console.log('  • 생성된 TLV (Binary 4B OTP):', tlvBinary);
const parsedBinary = parseAuthTlv(tlvBinary);
assert.strictEqual(parsedBinary.id, sample16BUid);
assert.strictEqual(parsedBinary.otp, sampleOtp);
assert.strictEqual(parsedBinary.counter, sampleCount);
console.log('  ✅ Binary 정수 포맷 TLV 파싱 성공!\n');

// 3. DB 키(AES-128 대칭키 16B) 기반 HOTP 엔드투엔드 검증
console.log('3. DB 키(AES-128 대칭키 16B) 기반 HOTP 엔드투엔드 검증');
const dummyKek = '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF';
const dbPlainKey16B = '000102030405060708090A0B0C0D0E0F';
const encrypted = encryptNfcKey(dbPlainKey16B, dummyKek);
const decryptedKeyHex = decryptNfcKey(encrypted.cipherHex, encrypted.ivHex, encrypted.tagHex, dummyKek);
assert.strictEqual(decryptedKeyHex, dbPlainKey16B);

const testCounter = 1001;
const hotp1001 = calculateHotp(hexToBytes(decryptedKeyHex), testCounter, 6);
console.log('  • 카운터 #1001 HOTP:', hotp1001.otp6);

const dynamicTlv = buildTlvPayload(sample16BUid, hotp1001.otp6, testCounter, 'ascii');
console.log('  • 전송할 단일 TLV 페이로드:', dynamicTlv);

const authResult = verifyHotp(hexToBytes(decryptedKeyHex), testCounter, hotp1001.otp6);
assert.strictEqual(authResult.isValid, true);
console.log('  ✅ 정상 정품 태그 HOTP 검증 성공 (AUTHENTIC)!\n');

// 4. 위조된 OTP 차단 테스트
console.log('4. 위조된 OTP 차단 테스트');
const invalidResult = verifyHotp(hexToBytes(decryptedKeyHex), testCounter, '999999');
assert.strictEqual(invalidResult.isValid, false);
console.log('  ✅ 위조된 OTP 차단 확인 (INVALID_OTP 정상 동작)!\n');

// 5. 카운터 길이 호환성 테스트 (1B, 2B, 3B, 4B)
console.log('5. 카운터 길이 호환성 테스트 (1B, 2B, 3B, 4B)');
const tlv1B = 'DF61100102030405060708090A0B0C0D0E0F10DF6206313233343536DF63013D'; // cnt = 61
assert.strictEqual(parseAuthTlv(tlv1B).counter, 61);

const tlv2B = 'DF61100102030405060708090A0B0C0D0E0F10DF6206313233343536DF6302003D'; // cnt = 61
assert.strictEqual(parseAuthTlv(tlv2B).counter, 61);

const tlv3B = 'DF61100102030405060708090A0B0C0D0E0F10DF6206313233343536DF63030003E9'; // cnt = 1001
assert.strictEqual(parseAuthTlv(tlv3B).counter, 1001);

const tlv4B = 'DF61100102030405060708090A0B0C0D0E0F10DF6206313233343536DF6304000003EA'; // cnt = 1002
assert.strictEqual(parseAuthTlv(tlv4B).counter, 1002);
console.log('  ✅ 1B, 2B, 3B, 4B 카운터 길이 디코딩 100% 호환 확인!\n');

// 6. 스마트카드 20바이트 (160비트) 키 인덱스(#2) 암복호화 및 HOTP 검증 테스트
console.log('6. 스마트카드 20바이트 (160비트) 키 인덱스(#2) 검증');
const dbPlainKey20B = '000102030405060708090A0B0C0D0E0F10111213'; // 20 bytes
const enc20 = encryptNfcKey(dbPlainKey20B, dummyKek);
assert.strictEqual(enc20.cipherHex.length, 40); // 20B = 40 Hex chars
const dec20 = decryptNfcKey(enc20.cipherHex, enc20.ivHex, enc20.tagHex, dummyKek);
assert.strictEqual(dec20, dbPlainKey20B);

const hotp20_c0 = calculateHotp(hexToBytes(dec20), 0, 6);
assert.strictEqual(hotp20_c0.otp6, '858575');

const tlv20B = buildTlvPayload('0102030405060708090A0B0C0D0E0F10', hotp20_c0.otp6, 0, 'bcd');
const parsed20B = parseAuthTlv(tlv20B);
assert.strictEqual(parsed20B.otp, '858575');
assert.strictEqual(parsed20B.counter, 0);

const verify20Result = verifyHotp(hexToBytes(dec20), 0, '858575');
assert.strictEqual(verify20Result.isValid, true);
console.log('  ✅ 20바이트 키 암복호화 및 HOTP (#0 = 858575) 100% 검증 통과!\n');

// 7. 16바이트가 아닌 규격 외 UID (예: 7바이트) 차단 테스트
console.log('7. 16바이트 규격 외 UID (예: 7바이트) 엄격 차단 테스트');
assert.throws(() => {
  parseAuthTlv('DF610704DE5F1EACC040DF6203328482DF6303000000');
}, (err) => {
  return err.message.includes('16바이트(32자리 Hex)');
});
console.log('  ✅ 16바이트 미만(7바이트 등) 규격 외 UID 즉시 차단(Bad Request) 확인!\n');

console.log('🎉 ===============================================================');
console.log('🎉 [BER-TLV + HOTP (RFC 4226) 모든 단위 테스트 100% 통과!]');
console.log('🎉 ===============================================================');
