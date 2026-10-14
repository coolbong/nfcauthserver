# Supabase NFC 인증 서버 연동 및 배포 가이드 (DB 키 암호화 및 다중 키 지원)

본 문서는 NTAG 424 DNA 태그의 3가지 데이터(`uid`, `cnt`, `mac`) 및 선택적 키 인덱스(`kid`)를 전달받아 **DB에 안전하게 암호화 보관된 키**를 이용해 정품 인증을 수행하는 **Supabase 백엔드 연동 및 운영 절차**를 설명합니다.

---

## 🔐 1. 보안 핵심: DB 키 암호화 (Envelope Encryption) 구조

> **"DB 데이터가 해커나 내부자에 의해 통째로 유출/덤프되더라도 실제 AES 키를 절대 알아볼 수 없습니다."**

- **NTAG 424 DNA AES 키 (DEK)**:
  - 데이터베이스의 `public.nfc_keys` 테이블에 저장될 때 **AES-256-GCM** 방식으로 강력하게 암호화되어 저장됩니다.
  - 테이블에는 오직 난수 같은 암호문(`encrypted_key`), 초기화 벡터(`key_iv`), 인증 태그(`key_tag`)만 기록됩니다.
- **마스터 키 암호화 키 (KEK, Key Encryption Key)**:
  - DB에 저장되지 않으며, **오직 Supabase Edge Function 환경 변수(`NFC_KEK`)**에만 격리 보관됩니다.
  - 인증 요청이 발생했을 때만 Edge Function의 보안 메모리(RAM) 상에서 1회 복호화하여 CMAC을 검증한 뒤 즉시 소멸합니다.

---

## 2. 사전 준비 (Supabase 프로젝트 및 KEK 설정)

1. [Supabase](https://supabase.com)에서 새 프로젝트를 생성합니다.
2. 터미널에서 신규 KEK (Master Key)를 무작위로 생성합니다:
   ```powershell
   node scripts/manage_keys.js generate-kek
   ```
   *(출력된 64자리 Hex 키를 복사합니다. 예: `3A9F...`)*
3. Supabase Edge Function 환경변수에 KEK를 등록합니다:
   - **CLI 사용 시**:
     ```powershell
     npx supabase secrets set NFC_KEK=<생성된-64자리-KEK>
     ```
   - **웹 대시보드 사용 시**:
     **Project Settings $\rightarrow$ Edge Functions $\rightarrow$ Secrets** 에서  
     이름: `NFC_KEK`, 값: `<생성된-64자리-KEK>` 등록.

---

## 3. 데이터베이스 스키마 및 저장 프로시저 적용

1. Supabase 대시보드 좌측 메뉴에서 **SQL Editor**를 클릭합니다.
2. **[New query]**를 열고 [supabase/migrations/20261014000000_create_nfc_auth_schema.sql](file:///D:/dev/orca/nfcauthserver/supabase/migrations/20261014000000_create_nfc_auth_schema.sql) 파일의 내용을 복사하여 붙여넣습니다.
3. **[Run]** (`Ctrl + Enter`) 버튼을 클릭하여 실행합니다.

### 생성되는 테이블 및 기능
- **`public.nfc_keys`**: 암호화된 AES 키 저장소 (키 인덱스 번호별 관리)
- **`public.nfc_tags`**: 태그 마스터 (UID, 제품 정보, 참조 키 인덱스)
- **`public.nfc_scan_logs`**: 태그 스캔 및 위변조 탐지 실시간 로그
- **`public.verify_and_log_nfc_scan`**: 동시성 제어(`FOR UPDATE`)가 적용된 원자적 검증 프로시저

---

## 4. Edge Function (`nfc`) 배포 방법

터미널(PowerShell)에서 다음 명령어로 배포합니다:

```powershell
# 1. Supabase CLI 로그인 및 프로젝트 연결
npx supabase login
npx supabase link --project-ref <your-project-ref>

# 2. Function 배포 (스마트폰 브라우저 접근을 위해 JWT 비활성화)
npx supabase functions deploy nfc --no-verify-jwt
```

배포 완료 시 다음과 같은 기본 URL이 생성됩니다:
```text
https://<your-project-ref>.supabase.co/functions/v1/nfc
```

---

## 5. 커스텀 도메인 (`xxx.co/v1/nfc`) 연동 방법

태그의 NDEF 공간 절약 및 브랜드 신뢰도를 위해 커스텀 도메인 `https://xxx.co/v1/nfc`를 매핑할 수 있습니다.

### Cloudflare Worker를 통한 리버스 프록시 (권장)
```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/v1/nfc')) {
      const targetUrl = new URL('https://<your-project-ref>.supabase.co/functions/v1/nfc' + url.search);
      return fetch(targetUrl, request);
    }
    return fetch(request);
  }
};
```

---

## 6. 다중 키(Key Index) 관리 및 새 키 등록 방법

키를 여러 개 운영하거나 정기적으로 교체(Key Rotation)할 수 있습니다.

### 새 NTAG 키를 암호화하여 DB에 등록하기 (`scripts/manage_keys.js`)
예를 들어, 2번 키(`0102030405060708090A0B0C0D0E0F10`)를 신규 발급하여 DB에 등록하고 싶다면:

```powershell
node scripts/manage_keys.js encrypt --index 2 --name "2026년 신제품 배치 전용 키" --key 0102030405060708090A0B0C0D0E0F10
```

터미널에 출력되는 `INSERT INTO public.nfc_keys ...` SQL을 복사하여 Supabase **SQL Editor**에서 실행하기만 하면 끝납니다!

### 태그 및 URL에서의 키 지정 방식
1. **URL에 명시적으로 키 인덱스 지정 (`&kid=2`)**:
   ```text
   https://xxx.co/v1/nfc?uid=...&cnt=...&mac=...&kid=2
   ```
2. **URL에 `kid`가 생략된 경우**:
   - 서버가 `nfc_tags` 테이블을 조회하여 해당 태그 레코드에 등록된 `key_index`의 키를 자동으로 가져와 복호화 후 검증합니다.

---

## 7. 즉시 테스트 및 검증 시나리오

초기 마이그레이션 실행 시 등록된 AN12196 표준 테스트 데이터로 즉시 검증할 수 있습니다.

### 테스트 1: 정품 인증 성공 (SUCCESS)
- 브라우저 주소창에 아래 URL 입력:
```text
https://<your-project-ref>.supabase.co/functions/v1/nfc?uid=04DE5F1EACC040&cnt=3D0000&mac=94EED9EE65337086&kid=1
```
*(참고: `&kid=1`을 생략해도 태그 기본 설정에 따라 키 #1로 자동 인증됩니다.)*

👉 **결과**: 녹색의 **"정품 인증 완료"** 모바일 카드 표시

---

### 테스트 2: 새로고침 시 복제 의심 경고 (COUNTER_REPLAY)
위 화면에서 새로고침(F5)을 누르면 카운터가 증가하지 않았으므로 리플레이 공격으로 탐지됩니다.
👉 **결과**: 주황색의 **"⚠️ 복제 의심 태그 경고 (재전송 감지)"** 화면 표시

---

### 테스트 3: 위조 서명 감지 (INVALID_MAC)
MAC 값을 임의로 변경하여 접속:
```text
https://<your-project-ref>.supabase.co/functions/v1/nfc?uid=04DE5F1EACC040&cnt=3D0001&mac=1122334455667788
```
👉 **결과**: 빨간색의 **"⛔ 위조 의심 경고 (서명 불일치)"** 화면 표시

---

### 테스트 4: JSON 모드 응답 (모바일 앱 연동용)
URL 끝에 `&format=json` 추가:
```bash
curl "https://<your-project-ref>.supabase.co/functions/v1/nfc?uid=04DE5F1EACC040&cnt=3D0002&mac=...&format=json"
```
