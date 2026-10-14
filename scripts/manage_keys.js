// scripts/manage_keys.js
// NTAG 424 DNA AES 키를 KEK(AES-256-GCM)로 안전하게 암호화하여 Supabase DB에 등록할 SQL을 생성하는 CLI 도구
import crypto from 'node:crypto';
import { encryptNfcKey, decryptNfcKey, bytesToHex } from '../tests/crypto.js';

// 기본 KEK (실제 운영 시에는 환경변수 NFC_KEK 또는 안전한 시크릿으로 관리)
const DEFAULT_KEK = process.env.NFC_KEK || '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF';

function printHelp() {
  console.log(`
사용법:
  1. 새 KEK (Master Key) 생성:
     node scripts/manage_keys.js generate-kek

  2. NTAG 424 DNA 키 암호화 및 DB Insert SQL 생성:
     node scripts/manage_keys.js encrypt --index <번호> --name "<키이름>" --key <16바이트HEX> [--kek <32바이트HEX>]

예시:
  node scripts/manage_keys.js encrypt --index 1 --name "기본 공장출하 키" --key 00000000000000000000000000000000
`);
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'generate-kek') {
  const randomKek = bytesToHex(crypto.randomBytes(32));
  console.log('🔑 [신규 생성된 KEK (Master Key Encryption Key)]');
  console.log(`\n  ${randomKek}\n`);
  console.log('👉 이 값을 Supabase Secrets에 등록하세요:');
  console.log(`   npx supabase secrets set NFC_KEK=${randomKek}\n`);
  process.exit(0);
}

if (command === 'encrypt') {
  let keyIndex = 1;
  let keyName = '기본 NTAG 키';
  let plainKey = '00000000000000000000000000000000';
  let kek = DEFAULT_KEK;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--index' && args[i + 1]) keyIndex = parseInt(args[++i], 10);
    else if (args[i] === '--name' && args[i + 1]) keyName = args[++i];
    else if (args[i] === '--key' && args[i + 1]) plainKey = args[++i];
    else if (args[i] === '--kek' && args[i + 1]) kek = args[++i];
  }

  const encrypted = encryptNfcKey(plainKey, kek);

  // 복호화 테스트 검증
  const verified = decryptNfcKey(encrypted.cipherHex, encrypted.ivHex, encrypted.tagHex, kek);
  if (verified.toUpperCase() !== plainKey.toUpperCase()) {
    console.error('❌ 암호화 무결성 검증 실패!');
    process.exit(1);
  }

  console.log('\n===============================================================');
  console.log(`🔐 [키 암호화 완료 - 인덱스 #${keyIndex}]`);
  console.log(`• 원본 NTAG 키 (평문)  : ${plainKey.toUpperCase()}`);
  console.log(`• 암호화된 값 (Cipher) : ${encrypted.cipherHex} (DB에 평문은 노출되지 않음)`);
  console.log(`• 초기화 벡터 (IV)     : ${encrypted.ivHex}`);
  console.log(`• 인증 태그 (Auth Tag) : ${encrypted.tagHex}`);
  console.log('===============================================================\n');
  console.log('-- 아래 SQL을 Supabase SQL Editor에서 실행하여 키를 등록하세요:\n');
  console.log(`INSERT INTO public.nfc_keys (key_index, key_name, encrypted_key, key_iv, key_tag, status)
VALUES (
    ${keyIndex},
    '${keyName}',
    '${encrypted.cipherHex}',
    '${encrypted.ivHex}',
    '${encrypted.tagHex}',
    'ACTIVE'
)
ON CONFLICT (key_index) DO UPDATE
SET key_name = EXCLUDED.key_name,
    encrypted_key = EXCLUDED.encrypted_key,
    key_iv = EXCLUDED.key_iv,
    key_tag = EXCLUDED.key_tag,
    status = EXCLUDED.status;`);
  console.log('\n===============================================================\n');
} else {
  printHelp();
}
