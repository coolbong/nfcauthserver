// scripts/deploy_db.js
import fs from 'node:fs';
import path from 'node:path';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'jklfqmbaubvnbrbuhzak';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  console.error('❌ SUPABASE_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const sqlPath = path.resolve('supabase/migrations/20261014000000_create_nfc_auth_schema.sql');
const sql = fs.readFileSync(sqlPath, 'utf-8');

console.log('🚀 Supabase DB 스키마 배포 시작...');

async function run() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  const responseText = await res.text();
  if (!res.ok) {
    console.error('❌ SQL 배포 실패:', res.status, responseText);
    process.exit(1);
  }

  console.log('✅ DB 스키마 및 저장 프로시저 배포 성공!');
}

run().catch(err => {
  console.error('에러 발생:', err);
  process.exit(1);
});
