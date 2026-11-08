// scripts/reset.mjs
// 관리자 계정으로 로그인해 카드 한 장의 카운터를 0으로 리셋한다.
// 사용법: ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/reset.mjs <UID>

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jklfqmbaubvnbrbuhzak.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const uid = (process.argv[2] || '').trim().toUpperCase();

if (!ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD || !uid) {
  console.error('사용법: SUPABASE_ANON_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/reset.mjs <UID>');
  process.exit(1);
}

async function main() {
  const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const session = await login.json();
  if (!login.ok) throw new Error(`로그인 실패: ${session.error_description || session.msg || login.status}`);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin/tags/${encodeURIComponent(uid)}/reset`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.access_token}`, apikey: ANON_KEY },
  });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(`리셋 실패: ${body.message || res.status}`);
  console.log(`✅ ${body.tag.uid} (${body.tag.tag_name}) 카운터를 0으로 리셋했습니다.`);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
