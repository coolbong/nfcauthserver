# NTAG 424 DNA NFC 보안 인증 서버 (Orca NFC Auth)

NXP **NTAG 424 DNA** 태그의 **SDM / SUN (Secure Unique NFC Message)** 프로토콜을 기반으로, 스마트폰 NFC 탭 시 전달되는 데이터(`uid`, `cnt`, `mac`, `kid`)를 실시간 검증하고 모바일 정품 인증 화면을 제공하는 **Supabase 기반 고보안 인증 백엔드 시스템**입니다.

---

## 🔐 1. AES 키 보안 저장 방식 (Envelope Encryption)

> **"데이터베이스가 해커에 의해 통째로 유출/덤프되더라도 실제 AES 키는 절대 알아볼 수 없습니다."**

```
[Supabase Secrets (보안 격리 환경)]
  🔑 마스터 암호화 키 (NFC_KEK, 256비트 AES-GCM 키)
                         │
                         ▼ (인증 요청 시점에만 메모리에서 일시 복호화)
[Supabase PostgreSQL (public.nfc_keys 테이블)]
  📦 key_index: 1
  📦 encrypted_key: "03F4E329C6BB3972CA879E0BCBCF8995"  <-- AES-256-GCM 암호화문
  📦 key_iv:        "105A3B69A7E912B7E9CB8D54"          <-- 초기화 벡터 (12B)
  📦 key_tag:       "1BBBC68E9D227B0D406A513674C6A37F"  <-- 무결성 인증 태그 (16B)
```

1. **이중 암호화 구조 (Envelope Encryption)**:
   - 태그 검증에 사용되는 NTAG AES-128 키는 DB 테이블에 직접 평문으로 저장되지 않고, **AES-256-GCM**으로 암호화되어 저장됩니다.
   - DB에는 난수 형태의 암호문(`encrypted_key`), IV, Auth Tag만 기록됩니다.
2. **보안 메모리 처리**:
   - Edge Function은 DB에서 암호화된 키를 읽어온 뒤, 서버 환경변수(`NFC_KEK`)로 **런타임 메모리(RAM) 상에서만 1회 복호화**하여 CMAC을 검증하고 즉시 파기합니다.
3. **다중 키 풀 (Key Index) 지원**:
   - 제품 배치나 연도별로 여러 개의 키를 발급·운영할 수 있으며, URL 파라미터 `&kid=...` 또는 태그 레코드에 매핑된 키 번호를 통해 유연하게 키 교체(Key Rotation)가 가능합니다.

---

## 📡 2. NFC 태깅 URL 형식 규격

스마트폰으로 태그를 탭했을 때 전송되는 URL 구조:
```text
GET https://xxx.co/v1/nfc?uid=04C767F2066180&cnt=00000000003D&mac=94EED9EE65337086&kid=1
```

| 파라미터 | 필수 여부 | 형식 및 길이 | 상세 설명 |
| :--- | :---: | :--- | :--- |
| **`uid`** | **필수** | **14자리 Hex** (7 Bytes) | NTAG 424 DNA 고유 하드웨어 일련번호 (예: `04de5f1eacc040`) |
| **`cnt`** | **필수** | **12자리 Hex** (6 Bytes)<br/>*(6자리 Hex도 호환)* | 탭할 때마다 1씩 증가하는 카운터 (Big/Little Endian 자동 판별) |
| **`mac`** | **필수** | **16자리 Hex** (8 Bytes)<br/>*(32자리 Hex도 호환)* | 칩 내부에서 계산된 8바이트 Truncated CMAC (`MACt`) |
| **`kid`** | **선택** | **정수 (Integer)** | 사용할 암호화 키 번호 (생략 시 태그 마스터 DB에 매핑된 키 사용) |
| **`format`** | **선택** | `html` (기본값) / `json` | API 호출 시 `&format=json` 추가 시 JSON 결과 반환 |

---

## 💻 3. 로컬에서 테스트하는 방법

### 3.1 단위 테스트 (NXP AN12196 공식 테스트 벡터 검증)
NXP 공식 문서의 테스트 벡터, KEK 암복호화, 3바이트/6바이트 카운터 연산이 모두 일치하는지 로컬에서 즉시 검증합니다:
```bash
node tests/test_runner.js
```
👉 결과: 서브키 생성, SV2 유도, CMAC, 6바이트 카운터 파싱 100% 통과 확인.

### 3.2 로컬 프리뷰 서버로 모바일 브라우저 화면 확인
Supabase 자체 도메인의 HTML 렌더링 제한을 우회하여, 브라우저에서 실제 모바일 UI를 바로 확인하는 로컬 프록시 서버입니다:
```bash
node scripts/preview.js
```
브라우저 주소창에 접속하여 확인:
- **정품 인증 성공 화면 (녹색)**:  
  `http://localhost:3000/v1/nfc?uid=04de5f1eacc040&cnt=000000460000&mac=...`
- **복제 의심 경고 화면 (주황색)**:  
  위 링크에서 **새로고침(F5)** 시 이전 카운터 재전송을 감지하여 즉시 복제 경고 표시.
- **위조품 경고 화면 (빨간색)**:  
  `http://localhost:3000/v1/nfc?uid=04de5f1eacc040&cnt=000000470000&mac=0000000000000000`

### 3.3 실서버 End-to-End 자동화 테스트
배포된 Supabase 실서버와 통신하여 4대 시나리오(성공/리플레이/위조/UI)를 한 번에 검증합니다:
```bash
node scripts/test_live_server.js
```

---

## 🛠️ 4. 키 관리 CLI 도구 (`scripts/manage_keys.js`)

관리자가 새로운 NTAG 키를 발급하여 DB에 안전하게 등록할 수 있는 명령줄 도구입니다:

```bash
# 1. 신규 마스터 KEK 생성
node scripts/manage_keys.js generate-kek

# 2. 신규 NTAG 키를 KEK로 암호화하여 DB Insert SQL 생성
node scripts/manage_keys.js encrypt --index 2 --name "2026 가을 신상품 배치 키" --key 0102030405060708090A0B0C0D0E0F10
```
👉 터미널에 생성된 `INSERT INTO public.nfc_keys ...` SQL을 복사하여 Supabase **SQL Editor**에 실행하기만 하면 새 키 등록이 완료됩니다.

---

## 📁 5. 프로젝트 문서 목차

- 📘 [docs/NFC_DEVELOPER_GUIDE.md](file:///D:/dev/orca/nfcauthserver/docs/NFC_DEVELOPER_GUIDE.md): **NFC 개발 및 발급 담당자를 위한 NTAG 424 DNA 발급 & NDEF 설정 가이드**
- 📗 [docs/SUPABASE_SETUP_GUIDE.md](file:///D:/dev/orca/nfcauthserver/docs/SUPABASE_SETUP_GUIDE.md): **Supabase 프로젝트 설정, KEK 환경변수, 배포 및 커스텀 도메인 매핑 가이드**
- 📙 [docs/NFC_AUTH_SERVER_PLAN.md](file:///D:/dev/orca/nfcauthserver/docs/NFC_AUTH_SERVER_PLAN.md): **전체 아키텍처 및 상세 개발 계획서**
- 📕 [docs/AN12196.pdf](file:///D:/dev/orca/nfcauthserver/docs/AN12196.pdf): **NXP NTAG 424 DNA 공식 기술 백서 (원본)**

---

## 🌐 6. 프로덕션 도메인 (`xxx.co/v1/nfc`) 연동 가이드 (무료)

Supabase Edge Function은 기본적으로 게이트웨이 보안 정책상 자체 도메인(`*.supabase.co`)에서 `text/html` 응답을 차단하므로, **Cloudflare Workers (완전 무료)**를 리버스 프록시로 앞단에 배치하여 서비스합니다:

```javascript
// Cloudflare Worker 스크립트 (15줄)
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/v1/nfc')) {
      const targetUrl = new URL('https://<your-project-ref>.supabase.co/functions/v1/nfc' + url.search);
      const res = await fetch(targetUrl, request);
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }
    return fetch(request);
  }
};
```
👉 이렇게 구성하면 스마트폰 사용자가 `https://xxx.co/v1/nfc?...`로 접속했을 때 모바일 정품 인증 화면이 100% 정상적으로 브라우저에 표시됩니다.
