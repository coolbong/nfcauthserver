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

console.log('🧪 [NTAG 424 DNA AN12196 + 6바이트 카운터 + DB 키 암호화 검증 시작]\n');

// 0. DB 키 암호화 (Envelope Encryption - AES-256-GCM) 테스트
console.log('0. DB Key Encryption (AES-256-GCM) Test:');
const dummyKek = '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF';
const originalNtagKey = '00000000000000000000000000000000';

const encryptedResult = encryptNfcKey(originalNtagKey, dummyKek);
const decryptedKey = decryptNfcKey(
  encryptedResult.cipherHex,
  encryptedResult.ivHex,
  encryptedResult.tagHex,
  dummyKek
);
assert.strictEqual(decryptedKey, originalNtagKey);
console.log('  ✅ DB 키 암복호화(Envelope Encryption) 정상 동작 확인!\n');

// 1. AN12196 Section 16 서브키 생성 테스트
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

// 3. 3바이트 카운터 (6자리 Hex) 검증 테스트
console.log('3. 3바이트 카운터 (6자리 Hex: 3D0000) 검증 테스트:');
const result3B = verifyNtag424Mac({
  uidHex: '04DE5F1EACC040',
  cntHex: '3D0000',
  macHex: '94EED9EE65337086',
  fileReadKeyHex: decryptedKey
});
assert.strictEqual(result3B.isValid, true);
assert.strictEqual(result3B.expectedMacT, '94EED9EE65337086');
console.log('  ✅ 3바이트 카운터 인증 성공!\n');

// 4. 6바이트 카운터 (12자리 Hex: 00000000003D 또는 3D0000000000) 검증 테스트
console.log('4. 6바이트 카운터 (12자리 Hex) 검증 테스트:');
// 4-1. Big-Endian 6바이트 카운터: "00000000003D"
const result6B_BE = verifyNtag424Mac({
  uidHex: '04DE5F1EACC040',
  cntHex: '00000000003D',
  macHex: '94EED9EE65337086',
  fileReadKeyHex: decryptedKey
});
assert.strictEqual(result6B_BE.isValid, true);
console.log('  ✅ 6바이트 Big-Endian 카운터 ("00000000003D") 검증 통과!');

// 4-2. Little-Endian 6바이트 카운터: "3D0000000000"
const result6B_LE = verifyNtag424Mac({
  uidHex: '04DE5F1EACC040',
  cntHex: '3D0000000000',
  macHex: '94EED9EE65337086',
  fileReadKeyHex: decryptedKey
});
assert.strictEqual(result6B_LE.isValid, true);
console.log('  ✅ 6바이트 Little-Endian 카운터 ("3D0000000000") 검증 통과!\n');

console.log('🎉 [3바이트 / 6바이트 카운터 및 모든 암호화 테스트 100% 통과!]');
