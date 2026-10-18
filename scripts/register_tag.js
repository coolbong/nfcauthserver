// scripts/register_tag.js
// 새로운 NFC 스마트카드를 Supabase 데이터베이스에 등록하거나 카운터를 초기화하는 CLI 도구
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

// .env 파일 자동 로드
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  } else if (fs.existsSync('.env')) {
    const lines = fs.readFileSync('.env', 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  }
} catch (_) {}

const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'jklfqmbaubvnbrbuhzak';
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_ACCESS_TOKEN) {
  console.error('❌ 오류: SUPABASE_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.');
  console.error('   PowerShell: $env:SUPABASE_ACCESS_TOKEN="<your_token>"');
  console.error('   CMD:        SET SUPABASE_ACCESS_TOKEN=<your_token>');
  process.exit(1);
}

function printHelp() {
  console.log(`
=============================================================================
  NFC 스마트카드 DB 등록 및 초기화 도구
=============================================================================
사용법:
  1. 새 카드 등록 (또는 기존 카드 갱신):
     node scripts/register_tag.js <UID> [태그명] [모델명] [시리얼번호]

  2. 카운터만 0으로 초기화:
     node scripts/register_tag.js <UID> --reset

예시:
  # 기본 등록:
  node scripts/register_tag.js 04DE5F1EACC040

  # 상세 정보와 함께 새 카드 등록:
  node scripts/register_tag.js 04112233445566 "VIP 고객용 정품 카드" "NFC Secure SmartCard" "SN-VIP-0001"

  # 카운터 0으로 리셋:
  node scripts/register_tag.js 04DE5F1EACC040 --reset
=============================================================================
`);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
  printHelp();
  process.exit(0);
}

const rawUid = args[0].replace(/[^0-9a-fA-F]/g, '').toUpperCase();
if (rawUid.length !== 14) {
  console.error(`❌ 오류: UID는 14자리 16진수(Hex)여야 합니다. (입력값: ${args[0]})`);
  process.exit(1);
}

const isResetOnly = args.includes('--reset');
const tagName = args[1] && !args[1].startsWith('--') ? args[1] : 'NFC 보안 인증 정품 태그';
const modelName = args[2] || 'NFC Secure SmartCard';
const serialNumber = args[3] || `NFC-AUTH-${rawUid.slice(-4).toUpperCase()}`;

async function run() {
  console.log(`\n📡 [Supabase DB] 카드 작업 진행 중: UID = ${rawUid}`);

  let query = '';
  if (isResetOnly) {
    query = `
      UPDATE public.nfc_tags
      SET last_counter = 0,
          total_scans = 0,
          first_verified_at = NULL,
          updated_at = NOW()
      WHERE UPPER(uid) = '${rawUid}';

      DELETE FROM public.nfc_scan_logs
      WHERE UPPER(uid) = '${rawUid}';

      SELECT uid, tag_name, key_index, last_counter, total_scans, status
      FROM public.nfc_tags
      WHERE UPPER(uid) = '${rawUid}';
    `;
  } else {
    query = `
      INSERT INTO public.nfc_tags (
        uid, tag_name, key_index, last_counter, total_scans, status, product_info
      )
      VALUES (
        '${rawUid}',
        '${tagName}',
        1,
        0,
        0,
        'ACTIVE',
        jsonb_build_object(
          'brand', 'NFC Authentication',
          'model', '${modelName}',
          'serialNumber', '${serialNumber}',
          'warranty', '2년 품질 및 보안 무결성 보증',
          'supportUrl', 'https://coolbong.github.io/nfcauthserver/certificate.html?uid=${rawUid}',
          'description', 'DB 키 암호화 및 실시간 CMAC 검증이 적용된 공식 디지털 정품 인증 태그입니다.'
        )
      )
      ON CONFLICT (uid) DO UPDATE
      SET tag_name = EXCLUDED.tag_name,
          last_counter = 0,
          total_scans = 0,
          first_verified_at = NULL,
          status = 'ACTIVE',
          product_info = EXCLUDED.product_info,
          updated_at = NOW();

      DELETE FROM public.nfc_scan_logs
      WHERE LOWER(uid) = '${rawUid}';

      SELECT uid, tag_name, key_index, last_counter, total_scans, status, product_info
      FROM public.nfc_tags
      WHERE LOWER(uid) = '${rawUid}';
    `;
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('❌ Supabase 쿼리 실행 실패:', res.status, errorText);
    process.exit(1);
  }

  const result = await res.json();
  console.log('✅ 작업 성공! 데이터베이스 상태:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\n🎉 UID: ${rawUid} 카드가 정상 등록되었으며 카운터가 0으로 초기화되었습니다.`);
  console.log('👉 이제 실물 카드를 리더기 또는 스마트폰에 태깅하여 정품 인증을 테스트해보세요!');
}

run().catch(err => {
  console.error('❌ 예기치 못한 에러 발생:', err);
  process.exit(1);
});
