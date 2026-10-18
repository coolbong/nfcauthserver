# NFC Authentication 보안 인증 시스템

동적 보안 메시징(SDM) 프로토콜을 지원하는 보안 NFC 태그를 기반으로, 스마트폰 NFC 탭 시 전달되는 데이터(`uid`, `cnt`, `mac`, `kid`)를 실시간 검증하고 모바일 정품 인증 화면을 제공하는 **Supabase 백엔드 & GitHub Pages 정품 인증 시스템**입니다.

- 🌐 **공식 정품 인증 웹페이지 (GitHub Pages)**: [https://coolbong.github.io/nfcauthserver/](https://coolbong.github.io/nfcauthserver/)
- ⚡ **Supabase Edge Function API 엔드포인트**: `https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/nfc`

---

## 🌟 시스템 구성 및 동작 흐름

```
[스마트폰 NFC 탭]
       │
       ▼
[GitHub Pages 모바일 반응형 SPA (index.html)]
  - URL 파라미터(uid, cnt, mac, kid) 파싱
  - 로딩 애니메이션 및 Supabase Edge Function API 호출 (약 0.1초)
       │
       ▼
[Supabase Edge Function (/v1/nfc)]
  - PostgreSQL DB에서 해당 키 인덱스(kid)의 암호화된 키 조회
  - KEK(Master Key)로 메모리 상에서만 일시 복호화 (AES-256-GCM)
  - 세션키 유도(SV2) 및 CMAC 검증
  - 원자적(Atomic) 카운터 비교 및 리플레이 공격 차단
       │
       ▼
[모바일 브라우저 결과 렌더링]
  - 🟢 SUCCESS: 정품 인증 완료 카드, 제품명, 일련번호, 총 인증 횟수
  - 🟠 COUNTER_REPLAY: 복제 의심 경고 (이전 카운터 재전송 감지)
  - 🔴 INVALID_MAC: 위조 의심 경고 (암호 서명 불일치)
```

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
   - 태그 검증에 사용되는 대칭키(AES-128)는 DB 테이블에 직접 평문으로 저장되지 않고, **AES-256-GCM**으로 암호화되어 저장됩니다.
   - DB에는 난수 형태의 암호문(`encrypted_key`), IV, Auth Tag만 기록됩니다.
2. **보안 메모리 처리**:
   - Edge Function은 DB에서 암호화된 키를 읽어온 뒤, 서버 환경변수(`NFC_KEK`)로 **런타임 메모리(RAM) 상에서만 1회 복호화**하여 CMAC을 검증하고 즉시 파기합니다.
3. **다중 키 풀 (Key Index) 지원**:
   - 제품 배치나 연도별로 여러 개의 키를 발급·운영할 수 있으며, URL 파라미터 `&kid=...` 또는 태그 레코드에 매핑된 키 번호를 통해 유연하게 키 교체(Key Rotation)가 가능합니다.

---

## 📡 2. NFC 태깅 URL 형식 규격

스마트폰으로 태그를 탭했을 때 전송되는 URL 구조:
```text
https://coolbong.github.io/nfcauthserver/?uid=04DE5F1EACC040&cnt=00003D&mac=94EED9EE65337086&kid=1
```

| 파라미터 | 필수 여부 | 형식 및 길이 | 상세 설명 |
| :--- | :---: | :--- | :--- |
| **`uid`** | **필수** | **14자리 Hex** (7 Bytes) | NFC 보안 태그 고유 하드웨어 일련번호 (예: `04DE5F1EACC040`) |
| **`cnt`** | **필수** | **6자리 Hex** (3 Bytes) | 탭할 때마다 1씩 증가하는 Big-Endian 카운터 (예: `000001`, `00003D`) |
| **`mac`** | **필수** | **16자리 Hex** (8 Bytes)<br/>*(32자리 Hex도 호환)* | 칩 내부에서 계산된 8바이트 Truncated CMAC (`MACt`) |
| **`kid`** | **선택** | **정수 (Integer)** | 사용할 암호화 키 번호 (기본값: `1`) |

---

## 💻 3. 테스트 및 실서버 확인 방법

### 3.1 브라우저 실시간 테스트 (GitHub Pages)
1. **정품 인증 성공 화면**:  
   👉 [정품 인증 성공 링크 열기](https://coolbong.github.io/nfcauthserver/?uid=04DE5F1EACC040&cnt=000060&mac=96FAD65E40E02794)
2. **복제 의심 경고 화면 (리플레이 공격 차단)**:  
   👉 위 성공 링크를 연 상태에서 **새로고침(F5)**을 누르면, 동일 카운터 재전송을 감지하여 즉시 복제 경고 표시.
3. **위조품 경고 화면 (암호 서명 불일치)**:  
   👉 [위조품 경고 링크 열기](https://coolbong.github.io/nfcauthserver/?uid=04DE5F1EACC040&cnt=000061&mac=0000000000000000)

### 3.2 로컬 단위 테스트 (표준 암호화 테스트 벡터 검증)
```bash
node tests/test_runner.js
```
👉 공식 암호화 표준 테스트 벡터, KEK 암복호화, 3바이트 카운터 연산 100% 통과 확인.

### 3.3 로컬 프리뷰 서버 실행
```bash
node scripts/preview.js
```
👉 `http://localhost:3000/v1/nfc?...` 로컬 환경에서도 실시간 검증 가능.

---

## 🛠️ 4. 키 관리 CLI 도구 (`scripts/manage_keys.js`)

관리자가 새로운 NFC 보안 키를 발급하여 DB에 안전하게 등록할 수 있는 명령줄 도구입니다:

```bash
# 1. 신규 마스터 KEK 생성
node scripts/manage_keys.js generate-kek

# 2. 신규 보안 키를 KEK로 암호화하여 DB Insert SQL 생성
node scripts/manage_keys.js encrypt --index 2 --name "2026 가을 신상품 배치 키" --key 0102030405060708090A0B0C0D0E0F10
```
👉 터미널에 생성된 `INSERT INTO public.nfc_keys ...` SQL을 복사하여 Supabase **SQL Editor**에 실행하기만 하면 새 키 등록이 완료됩니다.

---

## 📱 5. 안드로이드 정품 인증 데모 앱 (`android/`)

Jetpack Compose 기반의 네이티브 안드로이드 애플리케이션으로, 실제 NFC 태그 탭 시 브라우저 전환 없이 인앱에서 즉시 정품 인증 및 시연을 진행할 수 있습니다.

- **포그라운드 NFC 인터셉트**: `ForegroundDispatch`를 통해 스마트폰에 카드를 태깅하는 즉시 NDEF URL 파라미터 분리 및 검증
- **3단계 햅틱 & 비주얼 연출**:
  - 🟢 **정품 완료 (AUTHENTIC)**: 럭셔리 골드/에메랄드 카드 & 2단 성공 진동
  - 🟠 **복제 경고 (REPLAY)**: 보안 카운터 역전/중복 감지 & 경고 진동
  - 🔴 **위조 차단 (TAMPERED)**: AES-128-CMAC 서명 불일치 & 3단 에러 진동
- **디지털 정품 보증서**: 정품 인증 시 네이티브 골드 홀로그램 보증서 모달 열람
- **기술 인스펙터 시트**: 엔지니어 미팅용 Raw Hex(UID, Counter, CMAC, Key Index) 및 API 응답 지연 시간(ms) 표시
- **원클릭 가상 시뮬레이터 (Mock Tab)**: 실제 카드가 없거나 IR 발표 시 버튼 하나로 정품/복제/위조 시나리오 즉석 재현

### 빌드 및 실행
```bash
cd android
./gradlew assembleDebug
```
- 생성된 APK 위치: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 📁 6. 프로젝트 문서 목차

- 📱 [docs/ANDROID_DEMO_APP_PLAN.md](docs/ANDROID_DEMO_APP_PLAN.md): **안드로이드 정품 인증 데모 앱 기획서 & 아키텍처 설계서**
- 💳 [docs/SMARTCARD_ISSUANCE_GUIDE.md](docs/SMARTCARD_ISSUANCE_GUIDE.md): **NFC 스마트카드 신규 발급, JavaCard 빌드 및 카드 설치 가이드**
- 📘 [docs/NFC_DEVELOPER_GUIDE.md](docs/NFC_DEVELOPER_GUIDE.md): **NFC 개발 및 발급 담당자를 위한 보안 태그 발급 & NDEF 설정 가이드**
- 📗 [docs/SUPABASE_SETUP_GUIDE.md](docs/SUPABASE_SETUP_GUIDE.md): **Supabase 프로젝트 설정, KEK 환경변수, 배포 및 커스텀 도메인 매핑 가이드**
- 📙 [docs/NFC_AUTH_SERVER_PLAN.md](docs/NFC_AUTH_SERVER_PLAN.md): **전체 아키텍처 및 상세 개발 계획서**

---

