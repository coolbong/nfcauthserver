// tests/test_runner.js
import assert from 'node:assert';
import {
  hexToBytes,
  bytesToHex,
  calculateAes128Cmac,
  generateCmacSubkeys,
  buildSV2,
  truncateMac,
  verifyNtag424Mac,
  encryptNfcKey,
  decryptNfcKey
} from './crypto.js';

console.log('🧪 [NTAG 424 DNA AN12196 + DB 키 암호화 검증 시작]\n');

// 0. DB 키 암호화 (Envelope Encryption - AES-256-GCM) 테스트
console.log('0. DB Key Encryption (AES-256-GCM) Test:');
const dummyKek = '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'; // 32바이트 KEK (64 hex)
const originalNtagKey = '00000000000000000000000000000000'; // 16바이트 NTAG AES 키

const encryptedResult = encryptNfcKey(originalNtagKey, dummyKek);
console.log('  Encrypted in DB (Ciphertext):', encryptedResult.cipherHex);
console.log('  IV in DB:', encryptedResult.ivHex);
console.log('  Tag in DB:', encryptedResult.tagHex);

// 공격자가 DB를 탈취해도 KEK가 없으면 복호화 불가
// 서버(Edge Function)는 KEK로 복호화하여 원본 키 복원
const decryptedKey = decryptNfcKey(
  encryptedResult.cipherHex,
  encryptedResult.ivHex,
  encryptedResult.tagHex,
  dummyKek
);
console.log('  Decrypted NTAG Key:', decryptedKey);
assert.strictEqual(decryptedKey, originalNtagKey);
console.log('  ✅ DB 키 암복호화(Envelope Encryption) 정상 동작 확인!\n');

// 1. AN12196 Section 16 서브키 생성 테스트
const testSessionKey = hexToBytes('3FB5F6E3A807A03D5E3570ACE393776F');
const { K1, K2 } = generateCmacSubkeys(testSessionKey);

console.log('1. Subkey Generation Test:');
console.log('  K1:', bytesToHex(K1));
assert.strictEqual(bytesToHex(K1), '1C5E18A33EC1D73292FDDAD167EF8B4A');
console.log('  K2:', bytesToHex(K2));
assert.strictEqual(bytesToHex(K2), '38BC31467D83AE6525FBB5A2CFDF1694');
console.log('  ✅ Subkey 생성 일치 확인!\n');

// 2. Zero-length payload CMAC 계산 및 Truncation 테스트
const fullCmac = calculateAes128Cmac(testSessionKey, Buffer.alloc(0));
console.log('2. Zero-Length Input CMAC Test:');
console.log('  Full CMAC:', bytesToHex(fullCmac));
assert.strictEqual(bytesToHex(fullCmac), 'E194C7EE12D9F7EE8A65C8331B704386');
const macT = truncateMac(fullCmac);
console.log('  Truncated MACt:', bytesToHex(macT));
assert.strictEqual(bytesToHex(macT), '94EED9EE65337086');
console.log('  ✅ CMAC 및 Truncated MACt 계산 일치 확인!\n');

// 3. SV2 유도 벡터 및 세션키 유도 테스트
const uid = hexToBytes('04DE5F1EACC040');
const ctrBytes = hexToBytes('3D0000');
const sv2 = buildSV2(uid, ctrBytes);
console.log('3. SV2 Vector & Session Key Derivation Test:');
console.log('  SV2:', bytesToHex(sv2));
assert.strictEqual(bytesToHex(sv2), '3CC30001008004DE5F1EACC0403D0000');
const rootKey = hexToBytes(decryptedKey);
const derivedSessionKey = calculateAes128Cmac(rootKey, sv2);
console.log('  Derived KSesSDMFileReadMAC:', bytesToHex(derivedSessionKey));
assert.strictEqual(bytesToHex(derivedSessionKey), '3FB5F6E3A807A03D5E3570ACE393776F');
console.log('  ✅ SV2 및 세션키 유도 완벽 일치!\n');

// 4. End-to-End 전체 검증 함수 테스트 (복호화된 키 사용)
console.log('4. End-to-End verifyNtag424Mac Test:');
const resultSuccess = verifyNtag424Mac({
  uidHex: '04DE5F1EACC040',
  cntHex: '3D0000',
  macHex: '94EED9EE65337086',
  fileReadKeyHex: decryptedKey
});
console.log('  Success case result:', resultSuccess);
assert.strictEqual(resultSuccess.isValid, true);
assert.strictEqual(resultSuccess.expectedMacT, '94EED9EE65337086');

// 5. 위조 MAC 테스트
const resultFail = verifyNtag424Mac({
  uidHex: '04DE5F1EACC040',
  cntHex: '3D0000',
  macHex: '1122334455667788',
  fileReadKeyHex: decryptedKey
});
console.log('  Tampered MAC case result:', resultFail);
assert.strictEqual(resultFail.isValid, false);
console.log('  ✅ 위조 MAC 탐지 성공!\n');

console.log('🎉 [DB 키 암호화 및 모든 테스트 벡터 100% 통과!]');
