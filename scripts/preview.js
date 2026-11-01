// scripts/preview.js
// Supabase의 *.supabase.co 도메인 text/plain 제한을 우회하여 브라우저에서 모바일 화면을 즉시 확인할 수 있는 로컬 프리뷰 서버
// nfc (/functions/v1/nfc) 및 auth (/functions/v1/auth) 엔드포인트 지원
import http from 'node:http';
import {
  calculateHotp,
  buildTlvPayload,
  parseAuthTlv,
  verifyHotp
} from '../tests/crypto.js';

const port = 3000;
const supabaseNfcUrl = 'https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/nfc';
const supabaseAuthUrl = 'https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/auth';

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${port}`);

  // 1. NFC SDM 엔드포인트 프록시 (/nfc 또는 /functions/v1/nfc)
  if (reqUrl.pathname === '/' || reqUrl.pathname === '/nfc' || reqUrl.pathname === '/functions/v1/nfc' || reqUrl.pathname === '/v1/nfc') {
    const target = `${supabaseNfcUrl}${reqUrl.search}`;
    console.log(`📡 [NFC SDM] Supabase Edge Function 호출: ${target}`);

    try {
      const response = await fetch(target);
      const text = await response.text();

      res.writeHead(response.status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(text);
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`프록시 오류: ${err.message}`);
      return;
    }
  }

  // 2. AUTH (TLV + HOTP) 엔드포인트 (/auth 또는 /functions/v1/auth)
  if (reqUrl.pathname === '/auth' || reqUrl.pathname === '/functions/v1/auth') {
    const target = `${supabaseAuthUrl}${reqUrl.search}`;
    console.log(`📡 [AUTH TLV+HOTP] 호출: ${target}`);

    try {
      const response = await fetch(target);
      const contentType = response.headers.get('content-type') || 'text/html; charset=utf-8';
      const text = await response.text();

      res.writeHead(response.status, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      });
      res.end(text);
      return;
    } catch (_err) {
      // 로컬 fallback 핸들러 (원격 배포 전 로컬 테스트용)
      try {
        const rawTlv = reqUrl.searchParams.get('data') ||
                       reqUrl.searchParams.get('tlv') ||
                       reqUrl.searchParams.get('p') ||
                       reqUrl.search.slice(1);
        if (!rawTlv) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Missing TLV parameter. Use ?data=DF61...' }));
          return;
        }

        const parsed = parseAuthTlv(rawTlv);
        const format = reqUrl.searchParams.get('format') || 'json';

        if (format === 'json') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            version: 'v2',
            authType: 'HOTP',
            success: true,
            resultCode: 'SUCCESS',
            uid: parsed.id,
            counter: parsed.counter,
            otp: parsed.otp,
            tagName: 'NFC HOTP 보안 인증 테스트 태그',
            message: '로컬 프리뷰 검증 완료'
          }, null, 2));
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>정품 인증 완료 (v2 HOTP)</h1><p>UID: ${parsed.id}, Counter: #${parsed.counter}, OTP: ${parsed.otp}</p>`);
        }
        return;
      } catch (localErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`오류: ${localErr.message}`);
        return;
      }
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found (지원 경로: /nfc, /auth, /functions/v1/auth, /functions/v1/nfc)');
});

// 샘플 TLV 데이터 생성
const sampleSecret = Buffer.alloc(16, 0); // 16바이트 0x00
const sampleCounter = 1005;
const sampleHotp = calculateHotp(sampleSecret, sampleCounter, 6);
const sampleTlv = buildTlvPayload('04DE5F1EACC040', sampleHotp.otp6, sampleCounter, 'ascii');

server.listen(port, () => {
  console.log(`\n===============================================================`);
  console.log(`🚀 [NFC Authentication 로컬 프리뷰 서버 실행 중 (포트 ${port})]`);
  console.log(`===============================================================`);
  console.log(`[NFC SDM 정품 인증 링크]:`);
  console.log(`   http://localhost:3000/nfc?uid=04DE5F1EACC040&cnt=000060&mac=96FAD65E40E02794\n`);
  console.log(`[AUTH TLV + HOTP 정품 인증 링크]:`);
  console.log(`   http://localhost:3000/auth?data=${sampleTlv}&format=json`);
  console.log(`   http://localhost:3000/auth?data=${sampleTlv}`);
  console.log(`===============================================================\n`);
});
