import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { calculateHotp, buildTlvPayload, parseAuthTlv, verifyHotp } from '../../tests/crypto.js';

const PORT = Number(process.env.PORT || 4173);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DESIGNS = ['a', 'a1', 'a2', 'a3', 'b', 'c'];

const FILES = {
  '/': ['index.html', 'text/html'],
  '/a': ['a.html', 'text/html'],
  '/b': ['b.html', 'text/html'],
  '/c': ['c.html', 'text/html'],
  '/verify': ['../../index.html', 'text/html'],
  '/assets/fonts/Geist-Variable.woff2': ['../../assets/fonts/Geist-Variable.woff2', 'font/woff2'],
  '/assets/jsbarcode.code128.min.js': ['../../assets/jsbarcode.code128.min.js', 'text/javascript'],
  '/a1': ['a1.html', 'text/html'],
  '/a2': ['a2.html', 'text/html'],
  '/a3': ['a3.html', 'text/html'],
  '/security.js': ['security.js', 'text/javascript'],
  '/jsbarcode.js': ['jsbarcode.js', 'text/javascript'],
  '/base.css': ['base.css', 'text/css'],
  '/verdict.js': ['verdict.js', 'text/javascript'],
  '/card.svg': ['card.svg', 'image/svg+xml'],
  '/fonts/Geist-Variable.woff2': ['fonts/Geist-Variable.woff2', 'font/woff2'],
  '/fonts/PretendardVariable.woff2': ['fonts/PretendardVariable.woff2', 'font/woff2'],
};

const tag = {
  uid: '04DE5F1EACC040',
  key: Buffer.alloc(20, 0x5a),
  lastCounter: -1,
  scans: 0,
  firstVerifiedAt: null,
  card: { year: 2026, album: 'AFTERGLOW', artist: 'NOVA ROOM', member: '서하린', cardNumber: '017', imageUrl: '/card.svg', certNumber: 'CERT-2026-1EACC040', issuer: 'NOVA ROOM 공식 스토어' },
};

function tagUrl(design, counter, otp) {
  return `/${design}?${buildTlvPayload(tag.uid, otp, counter, 'ascii')}`;
}

// 칩이 하는 일을 재현한다. 탭마다 카운터를 올리고 새 서명을 만든다.
function tap(design, scenario) {
  if (scenario === 'fake') return tagUrl(design, tag.lastCounter + 1, '000000');
  if (scenario === 'replay') {
    if (tag.lastCounter < 0) verify(parseAuthTlv(tagUrl(design, 0, calculateHotp(tag.key, 0).otp6).split('?')[1]));
    return tagUrl(design, tag.lastCounter, calculateHotp(tag.key, tag.lastCounter).otp6);
  }
  const next = tag.lastCounter + 1;
  return tagUrl(design, next, calculateHotp(tag.key, next).otp6);
}

// 판정 순서는 supabase/functions/auth/index.ts와 같다.
function verify({ id, otp, counter }) {
  if (id.toUpperCase() !== tag.uid) return { success: false, resultCode: 'TAG_NOT_FOUND' };
  if (counter <= tag.lastCounter) {
    return { success: false, resultCode: 'COUNTER_REPLAY', productInfo: tag.card };
  }
  if (!verifyHotp(tag.key, counter, otp).isValid) return { success: false, resultCode: 'INVALID_OTP' };
  tag.lastCounter = counter;
  tag.scans += 1;
  tag.firstVerifiedAt ??= new Date().toISOString();
  return {
    success: true, resultCode: 'SUCCESS', authType: 'HOTP', uid: tag.uid,
    totalScans: tag.scans, firstVerifiedAt: tag.firstVerifiedAt, productInfo: tag.card,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  const tapRoute = url.pathname.match(/^\/tap\/(verify|a1|a2|a3|a|b|c)\/(genuine|replay|fake)$/);
  if (tapRoute) {
    res.writeHead(302, { Location: tap(tapRoute[1], tapRoute[2]), 'Cache-Control': 'no-store' });
    return res.end();
  }

  if (url.pathname === '/auth') {
    let body;
    let status = 200;
    try {
      body = verify(parseAuthTlv(url.search.slice(1)));
    } catch {
      status = 400;
      body = { success: false, resultCode: 'BAD_REQUEST' };
    }
    await new Promise((r) => setTimeout(r, 600));
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(body));
  }

  const file = FILES[url.pathname];
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(await readFile(path.join(ROOT, file[0])));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`포토카드 인증 시안: http://localhost:${PORT}`);
  console.log(`시안 ${DESIGNS.length}개, 데이터는 메모리에만 있으며 재시작하면 초기화됩니다.`);
});
