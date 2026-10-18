// scripts/preview.js
// Supabase의 *.supabase.co 도메인 text/plain 제한을 우회하여 브라우저에서 모바일 화면을 즉시 확인할 수 있는 로컬 프리뷰 서버
import http from 'node:http';

const port = 3000;
const supabaseUrl = 'https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/nfc';

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${port}`);

  if (reqUrl.pathname === '/' || reqUrl.pathname === '/v1/nfc') {
    const target = `${supabaseUrl}${reqUrl.search}`;
    console.log(`📡 Supabase Edge Function 호출: ${target}`);

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

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(port, () => {
  console.log(`\n===============================================================`);
  console.log(`🚀 [모바일 인증 화면 로컬 프리뷰 서버 실행 중]`);
  console.log(`👉 브라우저에서 아래 링크를 클릭하여 확인해 보세요:`);
  console.log(`\n   http://localhost:3000/v1/nfc?uid=04DE5F1EACC040&cnt=000060&mac=96FAD65E40E02794\n`);
  console.log(`   (새로고침을 누르면 '복제 의심 경고' 화면으로 전환됩니다)`);
  console.log(`===============================================================\n`);
});
