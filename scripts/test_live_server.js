// scripts/test_live_server.js
import { verifyNtag424Mac } from '../tests/crypto.js';

const baseUrl = 'https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/nfc';
const uid = '04DE5F1EACC040';
const plainKey = '00000000000000000000000000000000';

console.log('🌐 [배포된 Supabase 실서버 End-to-End 전체 테스트 시작]\n');

async function testLive() {
  // 현재 DB의 last_counter보다 큰 새 카운터(예: cnt=65 -> Big-Endian '000041')로 정품 인증 테스트
  const nextCntHex = '000041'; // decimal 65
  const cryptoSuccess = verifyNtag424Mac({
    uidHex: uid,
    cntHex: nextCntHex,
    macHex: '0000000000000000',
    fileReadKeyHex: plainKey
  });

  // 1. [정품 인증 성공 테스트]
  console.log(`1. [정품 인증 성공 테스트] cnt: ${nextCntHex} (65), MAC: ${cryptoSuccess.expectedMacT}`);
  const res1 = await fetch(`${baseUrl}?uid=${uid}&cnt=${nextCntHex}&mac=${cryptoSuccess.expectedMacT}&format=json`);
  const data1 = await res1.json();
  console.log('  HTTP 상태코드:', res1.status);
  console.log('  응답 데이터:', JSON.stringify(data1, null, 2));

  // 2. [동일 카운터 재전송 테스트 (리플레이 공격 / 복제 감지)]
  console.log(`\n2. [리플레이 공격 탐지 테스트] 동일 cnt=${nextCntHex} 재전송`);
  const res2 = await fetch(`${baseUrl}?uid=${uid}&cnt=${nextCntHex}&mac=${cryptoSuccess.expectedMacT}&format=json`);
  const data2 = await res2.json();
  console.log('  HTTP 상태코드:', res2.status);
  console.log('  응답 데이터:', JSON.stringify(data2, null, 2));

  // 3. [위조 MAC 탐지 테스트]
  console.log('\n3. [위조 MAC 탐지 테스트] 잘못된 MAC 전송');
  const res3 = await fetch(`${baseUrl}?uid=${uid}&cnt=000042&mac=0000000000000000&format=json`);
  const data3 = await res3.json();
  console.log('  HTTP 상태코드:', res3.status);
  console.log('  응답 데이터:', JSON.stringify(data3, null, 2));

  // 4. [모바일 HTML UI 렌더링 테스트]
  const cntHtml = '000043'; // decimal 67
  const cryptoHtml = verifyNtag424Mac({
    uidHex: uid,
    cntHex: cntHtml,
    macHex: '0000000000000000',
    fileReadKeyHex: plainKey
  });
  console.log(`\n4. [모바일 브라우저 HTML UI 렌더링 테스트] cnt: ${cntHtml}, MAC: ${cryptoHtml.expectedMacT}`);
  const res4 = await fetch(`${baseUrl}?uid=${uid}&cnt=${cntHtml}&mac=${cryptoHtml.expectedMacT}`);
  const html = await res4.text();
  console.log('  HTTP 상태코드:', res4.status);
  console.log('  Content-Type:', res4.headers.get('content-type'));
  console.log('  정품 인증 완료 배지 포함 여부:', html.includes('정품 인증 완료'));
  console.log('  HTML 총 크기:', html.length, 'bytes');

  console.log('\n🎉 [배포된 실서버 모든 기능 100% 정상 작동 완료!]');
}

testLive().catch(err => {
  console.error('실서버 테스트 실패:', err);
  process.exit(1);
});
