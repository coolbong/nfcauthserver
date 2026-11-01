// scripts/reset.mjs
// NFC 스마트카드 및 태그 카운터 0번 즉시 초기화 스크립트

const API_URL = process.env.AUTH_API_URL || 'https://nfcauth.vercel.app/auth?action=reset';

async function resetCounters() {
  console.log('🔄 NFC 데이터베이스 카운터 초기화 요청 중...');
  try {
    const res = await fetch(API_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (data.success) {
      console.log('✅ ' + data.message);
      console.log('\n[초기화된 태그 상태]');
      console.table(data.tags.map(t => ({
        UID: t.uid,
        태그명: t.tag_name,
        키인덱스: `#${t.key_index}`,
        현재카운터: `#${t.last_counter}`,
        인증횟수: `${t.total_scans}회`
      })));
      console.log('\n💡 이제 카운터 0번 URL부터 다시 정품 인증을 테스트하실 수 있습니다.');
    } else {
      console.error('❌ 초기화 실패:', data.message);
    }
  } catch (err) {
    console.error('❌ 통신 오류:', err.message);
  }
}

resetCounters();
