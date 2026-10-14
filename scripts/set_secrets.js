// scripts/set_secrets.js
const projectRef = process.env.SUPABASE_PROJECT_REF || 'jklfqmbaubvnbrbuhzak';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const kek = process.env.NFC_KEK || '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF';

if (!accessToken) {
  console.error('❌ SUPABASE_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const secrets = [
  {
    name: 'NFC_KEK',
    value: kek
  }
];

console.log('🔐 Supabase Secrets 등록 시작...');

async function run() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(secrets)
  });

  const responseText = await res.text();
  if (!res.ok) {
    console.error('❌ Secrets 등록 실패:', res.status, responseText);
    process.exit(1);
  }

  console.log('✅ Secrets(NFC_KEK) 등록 완료!');
}

run().catch(err => {
  console.error('에러 발생:', err);
  process.exit(1);
});
