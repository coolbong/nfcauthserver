# NFC Authentication Server API 명세서 (API.md)

본 문서는 **NFC 스마트카드 및 보안 태그 정품 인증 서버**에서 제공하는 2개의 핵심 인증 API(`auth`, `nfc`)에 대한 기술 명세서입니다.

---

## 📌 목차
1. [공통 사양 및 규격](#1-공통-사양-및-규격)
2. [1. AUTH API (`/functions/v1/auth`) - TLV + RFC 4226 HOTP](#2-1-auth-api-functionsv1auth---tlv--rfc-4226-hotp)
3. [2. NFC API (`/functions/v1/nfc`) - NTAG 424 DNA SDM CMAC](#3-2-nfc-api-functionsv1nfc---ntag-424-dna-sdm-cmac)
4. [인증 결과 코드 (Result Code) 정의](#4-인증-결과-코드-result-code-정의)
5. [오류 처리 및 예외 상황 가이드](#5-오류-처리-및-예외-상황-가이드)

---

## 1. 공통 사양 및 규격

* **호스트 기본 주소 (Base URL)**:  
  `https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/`
* **로컬 프리뷰 서버 주소**:  
  `http://localhost:3000/`
* **HEX 대문자 표준 정책**:  
  UID, 키, MAC, TLV 등 **모든 HEX 문자열은 영문 대문자(`A-F`)를 기준으로 사용 및 저장**됩니다. (소문자 입력 시 서버에서 자동으로 대문자로 변환하여 처리)
* **응답 포맷 선택**:  
  * **JSON 응답**: 쿼리 파라미터 `format=json` 전달 또는 HTTP 헤더 `Accept: application/json` 설정
  * **HTML 웹 UI 응답**: 모바일 브라우저로 직접 접속 시 사용자 친화적인 정품 인증 모바일 화면 자동 렌더링

---

## 2. 1) AUTH API (`/functions/v1/auth`) - TLV + RFC 4226 HOTP

스마트카드로부터 단 하나의 파라미터(**BER-TLV 포맷**)를 전달받아, IETF 표준 **RFC 4226 HOTP(HMAC-SHA-1)** 알고리즘으로 동적 일회용 암호를 검증하고 카운터 리플레이 공격을 방어합니다.

### 2.1 엔드포인트 정보
* **엔드포인트**: `https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/auth`
* **HTTP 메서드**: `GET`, `POST`
* **인증 방식**: RFC 4226 HOTP (HMAC-SHA-1)
* **비밀키 ($K$)**: DB `nfc_keys`에 보관된 해당 UID 매핑 16바이트(AES-128) 대칭키 사용

### 2.2 단일 파라미터 BER-TLV 규격

요청 시 **오직 1개의 파라미터**만 전달됩니다. 파라미터 내부에는 ISO/IEC 7816-4 규격의 BER-TLV 태그 3개가 포함되어 있습니다:

| 태그 (Tag) | 명칭 | 길이 (Length) | 데이터 형식 (Value) | 설명 |
| :---: | :---: | :---: | :---: | :--- |
| **`DF61`** | **id** | 가변 (일반적으로 7바이트 = 14 Hex) | Hex 문자열 | 스마트카드 하드웨어 고유 식별자 (UID, 예: `04DE5F1EACC040`) |
| **`DF62`** | **otp** | 가변 (6바이트 또는 4바이트) | ASCII 문자열 또는 Binary 정수 | RFC 4226 알고리즘으로 생성된 6자리 일회용 비밀번호 |
| **`DF63`** | **count** | 가변 (1B ~ 4B) | Big-Endian 정수 바이트열 | **0부터 시작**하여 탭할 때마다 1씩 증가하는 보안 카운터 |

#### BER-TLV 패킹 예시
* `DF61` + `07` (길이 7바이트) + `04DE5F1EACC040` (UID)
* `DF62` + `06` (길이 6바이트) + `353236303635` (ASCII "526065")
* `DF63` + `03` (길이 3바이트) + `0007D6` (카운터 2006)
* $\Rightarrow$ **최종 단일 페이로드**: `DF610704DE5F1EACC040DF6206353236303635DF63030007D6`

### 2.3 카운터 0 시작 및 리플레이 공격 방어 규칙
1. **최초 태깅 (Counter = 0)**:  
   해당 UID의 최초 인증(`total_scans = 0` 또는 `first_verified_at IS NULL`)인 경우 카운터 0이 정상 승인됩니다.
2. **카운터 재사용 차단**:  
   이전에 이미 사용된 카운터(즉, `counter <= last_counter`)가 재전송되면 **`COUNTER_REPLAY` (HTTP 409)** 경고와 함께 차단됩니다.
3. **원자적 갱신**:  
   검증 성공 시 PostgreSQL 격리 트랜잭션(`FOR UPDATE`)을 통해 `last_counter`와 `total_scans`가 갱신됩니다.

### 2.4 요청 예시

#### [GET 방식 호출]
```bash
# 쿼리 파라미터 data에 단일 TLV 전달
curl "https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/auth?data=DF610704DE5F1EACC040DF6206353236303635DF63030007D6&format=json"

# 키 이름 없이 직접 ?DF61... 형태로 전달하는 방식도 지원
curl "https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/auth?DF610704DE5F1EACC040DF6206353236303635DF63030007D6&format=json"
```

#### [POST 방식 호출 (JSON Body)]
```bash
curl -X POST "https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/auth?format=json" \
  -H "Content-Type: application/json" \
  -d '{
    "data": "DF610704DE5F1EACC040DF6206353236303635DF63030007D6"
  }'
```

### 2.5 응답 예시

#### 성공 응답 (HTTP 200 OK)
```json
{
  "authType": "HOTP",
  "success": true,
  "resultCode": "SUCCESS",
  "uid": "04DE5F1EACC040",
  "counter": 2006,
  "otp": "526065",
  "tagName": "NFC 보안 인증 테스트 태그",
  "totalScans": 16,
  "firstVerifiedAt": "2026-10-15T09:00:08.772347+00:00",
  "productInfo": {
    "brand": "NFC Authentication",
    "model": "NFC Secure SmartCard",
    "serialNumber": "NFC-AUTH-0001",
    "warranty": "2년 품질 및 보안 무결성 보증",
    "description": "DB 키 암호화 및 실시간 CMAC 검증이 적용된 공식 디지털 정품 인증 태그입니다."
  }
}
```

#### 리플레이 공격 감지 응답 (HTTP 409 Conflict)
```json
{
  "authType": "HOTP",
  "success": false,
  "resultCode": "COUNTER_REPLAY",
  "uid": "04DE5F1EACC040",
  "counter": 2006,
  "otp": "526065",
  "tagName": "NFC 보안 인증 테스트 태그",
  "totalScans": 16,
  "firstVerifiedAt": "2026-10-15T09:00:08.772347+00:00",
  "productInfo": { ... }
}
```

#### OTP 불일치 응답 (HTTP 401 Unauthorized)
```json
{
  "authType": "HOTP",
  "success": false,
  "resultCode": "INVALID_OTP",
  "uid": "04DE5F1EACC040",
  "counter": 2006,
  "otp": "999999",
  "tagName": "NFC 보안 인증 테스트 태그",
  "message": "HOTP 일회용 비밀번호 검증에 실패했습니다. (불일치)"
}
```

---

## 3. 2) NFC API (`/functions/v1/nfc`) - NTAG 424 DNA SDM CMAC

NXP NTAG 424 DNA 보안 칩의 SDM(Secure Dynamic Messaging) 기능을 사용하여, 태깅 시 칩 내부에서 계산된 AES-128-CMAC 동적 서명을 검증합니다.

### 3.1 엔드포인트 정보
* **엔드포인트**: `https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/nfc`
* **HTTP 메서드**: `GET`
* **암호화 표준**: NIST SP 800-38B (AES-128-CMAC)
* **세션키 유도**: SV2 표준 벡터 `3CC300010080` + `UID` + `Counter` 결합 후 CMAC 연산
* **서명 절단(Truncation)**: 계산된 16바이트 CMAC에서 홀수 인덱스 8바이트를 추출하여 16자리 Hex 생성

### 3.2 쿼리 파라미터 규격

| 파라미터 | 필수 여부 | 형식 / 길이 | 설명 |
| :---: | :---: | :---: | :--- |
| **`uid`** | **필수** | 14자리 Hex (7B) | 태그 하드웨어 고유 식별자 (예: `04DE5F1EACC040`) |
| **`cnt`** | **필수** | **6자리 Hex (3B)** | NTAG 424 DNA 3바이트 Big-Endian 트랜잭션 카운터 (예: `00003D`) |
| **`mac`** | **필수** | 16자리 Hex (8B) | 태그가 동적 생성한 AES-128-CMAC 서명 (예: `94EED9EE65337086`) |
| **`kid`** | 선택 | 정수 (기본값: 1) | DB `nfc_keys` 테이블의 키 인덱스 번호 |
| **`format`** | 선택 | 문자열 (`json`) | 생략 시 HTML 웹 UI 반환, `json` 설정 시 JSON 반환 |

### 3.3 요청 예시

```bash
# JSON 응답 요청
curl "https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/nfc?uid=04DE5F1EACC040&cnt=00003D&mac=94EED9EE65337086&kid=1&format=json"

# 모바일 웹 브라우저 태깅 시 (HTML 렌더링)
curl "https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/nfc?uid=04DE5F1EACC040&cnt=00003D&mac=94EED9EE65337086&kid=1"
```

### 3.4 응답 예시

#### 성공 응답 (HTTP 200 OK)
```json
{
  "success": true,
  "resultCode": "SUCCESS",
  "uid": "04DE5F1EACC040",
  "counter": 61,
  "tagName": "NFC 보안 인증 테스트 태그",
  "totalScans": 3,
  "firstVerifiedAt": "2026-10-14T11:00:00.000Z",
  "productInfo": {
    "brand": "NFC Authentication",
    "model": "NFC-AUTH-PoC",
    "serialNumber": "NFC-AUTH-0001",
    "description": "DB 키 암호화 및 다중 키 관리가 적용된 정품 태그입니다."
  }
}
```

#### 서명 불일치 응답 (HTTP 401 Unauthorized)
```json
{
  "success": false,
  "resultCode": "INVALID_MAC",
  "uid": "04DE5F1EACC040",
  "counter": 61,
  "tagName": "NFC 보안 인증 테스트 태그",
  "message": "NFC 보안 서명 검증에 실패했습니다. (위조 의심)"
}
```

---

## 4. 인증 결과 코드 (Result Code) 정의

두 API 모두 동일한 표준 결과 코드를 반환합니다:

| 결과 코드 | HTTP 상태 | 설명 | 대응 조치 |
| :--- | :---: | :--- | :--- |
| **`SUCCESS`** | `200` | 모든 암호화 검증 및 카운터 검증 통과 (정품 확인) | 정품 인증 화면 표시 및 제품 상세정보 제공 |
| **`COUNTER_REPLAY`** | `409` | 이전 카운터와 동일하거나 작은 카운터 재전송 감지 | 복제 의심 경고 표시 (리플레이 공격 차단) |
| **`INVALID_OTP`** | `401` | [auth 전용] RFC 4226 HOTP 일회용 비밀번호 불일치 | 위조 의심 경고 표시 (불법 복제/임의 생성 차단) |
| **`INVALID_MAC`** | `401` | [nfc 전용] AES-128-CMAC 서명 불일치 | 위조 의심 경고 표시 (칩 서명 변조 차단) |
| **`TAG_NOT_FOUND`** | `404` | DB `nfc_tags`에 등록되지 않은 UID | 미등록 태그 경고 표시 |
| **`TAG_INACTIVE`** | `403` | 태그 또는 키의 상태가 `ACTIVE`가 아님 (정지/폐기) | 비활성화 태그 안내 및 고객센터 문의 유도 |
| **`BAD_REQUEST`** | `400` | 필수 파라미터 누락, Hex/TLV 포맷 규격 오류 | 클라이언트 전송 파라미터 규격 점검 |
| **`SERVER_ERROR`** | `500` | 데이터베이스 연결 실패 또는 KEK 복호화 실패 | 시스템 관리자 및 환경변수(KEK) 점검 |

---

## 5. 두 API의 특징 비교 및 선택 가이드

| 비교 항목 | **AUTH API (`/functions/v1/auth`)** | **NFC API (`/functions/v1/nfc`)** |
| :--- | :--- | :--- |
| **전송 파라미터** | **단 1개** (`?data=DF61...` BER-TLV 포맷) | **4개** (`uid`, `cnt`, `mac`, `kid` 개별 쿼리) |
| **보안 알고리즘** | **RFC 4226 HOTP** (HMAC-SHA-1) | **NIST SP 800-38B** (AES-128-CMAC SDM) |
| **카운터 시작** | **0부터 시작** (RFC 4226 표준) | 1부터 시작 (3바이트 Big-Endian Hex) |
| **호환 하드웨어** | 일반 스마트카드, 자바카드, IoT 보안 칩 | NXP NTAG 424 DNA 전용 |
| **키 관리 방식** | DB `nfc_keys` AES-128 대칭키 (KEK 봉투 암호화) | DB `nfc_keys` AES-128 대칭키 (KEK 봉투 암호화) |
| **적합한 사용처** | 스마트카드 앱릿, 간결한 NDEF URL 구성, OTP 인증 | NXP 정품 NTAG 칩 직결 웹 URL 태깅 |

---

* **최종 문서 갱신일**: 2026-11-01  
* **저장소**: [https://github.com/coolbong/nfcauthserver](https://github.com/coolbong/nfcauthserver)
