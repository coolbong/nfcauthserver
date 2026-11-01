# NFC Authentication Server API 명세서 (API.md)

본 문서는 **NFC 스마트카드 및 보안 태그 정품 인증 서버**에서 제공하는 2개의 순수 JSON REST API(`auth`, `nfc`)에 대한 공식 기술 명세서입니다.

> **💡 순수 JSON API 정책**  
> Supabase Edge Function 백엔드는 **View(HTML) 렌더링 코드 없이 100% 순수 JSON API**로만 동작합니다.  
> `GET` 또는 `POST` 요청 시 별도의 헤더나 `format=json` 파라미터 없이도 항상 `Content-Type: application/json; charset=utf-8` 포맷으로 성공/실패 응답을 반환합니다.

---

## 📌 목차
1. [공통 사양 및 표준 JSON 응답 포맷](#1-공통-사양-및-표준-json-응답-포맷)
2. [에러 응답 규격 및 결과 코드 정의](#2-에러-응답-규격-및-결과-코드-정의)
3. [AUTH API (`/functions/v1/auth`) - TLV + RFC 4226 HOTP](#3-auth-api-functionsv1auth---tlv--rfc-4226-hotp)
4. [NFC API (`/functions/v1/nfc`) - NTAG 424 DNA SDM CMAC](#4-nfc-api-functionsv1nfc---ntag-424-dna-sdm-cmac)
5. [두 API 비교 및 요약](#5-두-api-비교-및-요약)

---

## 1. 공통 사양 및 표준 JSON 응답 포맷

### 1.1 기본 정보
* **기본 호스트 (Base URL)**:  
  `https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/`
* **응답 미디어 타입**:  
  `application/json; charset=utf-8` (모든 성공 및 에러 응답 동일)
* **대문자 HEX 표준**:  
  UID, 암호키, OTP, MAC 등 **모든 16진수 문자열은 영문 대문자(`A-F`)**를 기준으로 사용 및 저장됩니다.

---

### 1.2 표준 성공 응답 포맷 (HTTP 200 OK)

인증 성공 시 `success: true`와 함께 검증된 태그/카드 정보 및 등록된 제품 메타데이터가 반환됩니다.

```json
{
  "success": true,
  "resultCode": "SUCCESS",
  "authType": "HOTP",
  "uid": "0102030405060708090A0B0C0D0E0F10",
  "counter": 1,
  "otp": "812658",
  "tagName": "16바이트 UID 스마트카드 정품 태그",
  "totalScans": 2,
  "firstVerifiedAt": "2026-11-01T05:29:39.800005+00:00",
  "productInfo": {
    "brand": "OrcaSmartCard",
    "model": "16B-Card",
    "serialNumber": "NFC-AUTH-0001",
    "description": "공식 디지털 정품 인증 카드입니다."
  }
}
```

#### 성공 응답 필드 정의
| 필드명 | 타입 | 설명 |
| :--- | :---: | :--- |
| `success` | `boolean` | 인증 성공 여부 (항상 `true`) |
| `resultCode` | `string` | 결과 코드 (항상 `"SUCCESS"`) |
| `authType` | `string` | 인증 알고리즘 방식 (`"HOTP"` 또는 `"CMAC"`) |
| `uid` | `string` | 검증된 스마트카드/태그 고유 식별자 (대문자 Hex) |
| `counter` | `number` | 검증 완료된 현재 보안 카운터 정수 값 |
| `otp` | `string` | [auth 전용] 검증된 6자리 일회용 비밀번호 |
| `tagName` | `string` | 데이터베이스에 등록된 태그 명칭/제품명 |
| `totalScans` | `number` | 누적 정품 인증 횟수 (성공 시 1씩 자동 증가) |
| `firstVerifiedAt` | `string` | 최초 정품 인증 일시 (ISO-8601 타임스탬프) |
| `productInfo` | `object` | 제품 상세 메타데이터 (브랜드, 모델, 보증정보 등) |

---

## 2. 에러 응답 규격 및 결과 코드 정의

인증 실패 시 `success: false`와 함께 원인을 명시하는 `resultCode`, 안내 문자열 `message`, 그리고 구조화된 **`error` 객체**가 반환됩니다. 클라이언트 컨텍스트 유지를 위해 전달된 `uid`, `counter` 정보도 함께 반환됩니다.

### 2.1 표준 에러 응답 포맷
```json
{
  "success": false,
  "resultCode": "COUNTER_REPLAY",
  "authType": "HOTP",
  "message": "이전에 이미 사용된 일회용 보안 카운터입니다 (복제 의심).",
  "error": {
    "code": "COUNTER_REPLAY",
    "message": "이전에 이미 사용된 일회용 보안 카운터입니다 (복제 의심)."
  },
  "uid": "0102030405060708090A0B0C0D0E0F10",
  "counter": 1,
  "otp": "812658",
  "tagName": "16바이트 UID 스마트카드 정품 태그",
  "totalScans": 2,
  "firstVerifiedAt": "2026-11-01T05:29:39.800005+00:00",
  "productInfo": { ... }
}
```

### 2.2 결과 코드 (Result Code) 및 에러 정의 일람표

| HTTP 상태 | `resultCode` | `error.code` | 기본 안내 메시지 (`message`) | 발생 원인 및 클라이언트 대응 |
| :---: | :--- | :--- | :--- | :--- |
| **`200`** | **`SUCCESS`** | - | - | **정품 인증 성공**: 정상 화면 표시 및 제품정보 제공 |
| **`400`** | **`BAD_REQUEST`** | `BAD_REQUEST` | 필수 파라미터가 누락되었거나 규격에 맞지 않습니다. | **파라미터 오류**: TLV 포맷 누락, 16진수 규격 오류, 필수 필드 누락 |
| **`401`** | **`INVALID_OTP`** | `INVALID_OTP` | 일회용 비밀번호(HOTP) 검증에 실패했습니다 (위조 의심). | **[auth 전용] OTP 불일치**: 계산된 HOTP와 수신 OTP 불일치 (위조품 차단) |
| **`401`** | **`INVALID_MAC`** | `INVALID_MAC` | NFC 암호화 동적 서명 검증에 실패했습니다 (위조 의심). | **[nfc 전용] 서명 불일치**: CMAC 서명 불일치 (변조/위조품 차단) |
| **`403`** | **`TAG_INACTIVE`** | `TAG_INACTIVE` | 해당 스마트카드 또는 보안 키가 비활성화 상태입니다. | **비활성 상태**: DB에서 태그/키 상태가 `ACTIVE`가 아님 (정지/폐기) |
| **`404`** | **`TAG_NOT_FOUND`** | `TAG_NOT_FOUND` | 등록되지 않은 NFC 스마트카드 식별자(UID)입니다. | **미등록 태그**: DB `nfc_tags`에 존재하지 않는 UID |
| **`409`** | **`COUNTER_REPLAY`**| `COUNTER_REPLAY`| 이전에 이미 사용된 일회용 보안 카운터입니다 (복제 의심). | **복제/재사용 공격 차단**: 이전 카운터 이하의 값이 재전송됨 |
| **`500`** | **`SERVER_ERROR`** | `SERVER_ERROR` | 서버 내부 처리 중 오류가 발생했습니다. | **서버 에러**: 데이터베이스 통신 장애 또는 KEK 복호화 실패 |

---

## 3. AUTH API (`/functions/v1/auth`) - TLV + RFC 4226 HOTP

스마트카드로부터 단 하나의 BER-TLV 파라미터를 수신하여, IETF 표준 **RFC 4226 HOTP (HMAC-SHA-1)** 알고리즘으로 동적 일회용 암호를 검증하고 카운터 리플레이 공격을 방어합니다.

### 3.1 엔드포인트 정보
* **엔드포인트 URL**: `https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/auth`
* **HTTP 메서드**: `GET`, `POST`
* **응답 포맷**: **JSON Only** (`application/json`)
* **비밀키 ($K$)**: DB `nfc_keys`에 보관된 해당 UID 매핑 대칭키 사용 (RFC 4226 표준 20바이트 및 16바이트 모두 지원, KEK 봉투 복호화)
  - `key_index: 1`: NTAG 424 DNA SDM용 16바이트 AES 대칭키
  - `key_index: 2`: 스마트카드 RFC 4226 표준 20바이트 (160비트) HMAC-SHA1 보안 키

### 3.2 단일 파라미터 BER-TLV 규격

`data=` 키나 `format=json` 없이 **물음표(`?`) 뒤에 오직 TLV 페이로드 문자열만 직접 전달**하는 초간결 방식을 기본 지원합니다:

| 태그 (Tag) | 명칭 | 길이 (Length) | 데이터 형식 (Value) | 상세 설명 |
| :---: | :---: | :---: | :---: | :--- |
| **`DF61`** | **id** | **16바이트** (32 Hex)<br/>*(7B/8B 호환)* | Hex 바이트열 | 스마트카드 하드웨어 고유 식별자 (UID, 예: `0102030405060708090A0B0C0D0E0F10`) |
| **`DF62`** | **otp** | **3바이트** (6 Hex) | **Packed BCD** | RFC 4226 HOTP 6자리 일회용 비밀번호 (예: `328482`) |
| **`DF63`** | **count** | **3바이트** (6 Hex)<br/>*(1B~4B 호환)* | Big-Endian 정수 바이트열 | **0부터 시작**하여 탭할 때마다 1씩 증가하는 하드웨어 보안 카운터 |

#### BER-TLV 패킹 구조 예시
```text
DF61 10 0102030405060708090A0B0C0D0E0F10  -> [DF61] 16B 스마트카드 UID
DF62 03 328482                            -> [DF62] 3B Packed BCD OTP ("328482")
DF63 03 000000                            -> [DF63] 3B 카운터 (Counter = 0)
```
$\Rightarrow$ **단일 TLV 페이로드**: `DF61100102030405060708090A0B0C0D0E0F10DF6203328482DF6303000000`

### 3.3 카운터 0 시작 및 리플레이 방어 규칙
1. **카운터 0 허용 (최초 1회)**:  
   신규 카드의 최초 인증(`total_scans = 0`) 시 카운터 0이 정상 승인됩니다.
2. **동일 카운터 재사용 차단 (`COUNTER_REPLAY`)**:  
   이미 사용된 카운터(즉, `counter <= last_counter`) 재전송 시 `409 COUNTER_REPLAY`로 즉시 차단됩니다.

### 3.4 호출 예시

```bash
# 1. 초간결 GET 호출 (data= 없이 TLV 직접 전달)
curl "https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/auth?DF61100102030405060708090A0B0C0D0E0F10DF6203328482DF6303000000"

# 2. 호환 GET 호출 (data= 키 사용)
curl "https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/auth?data=DF61100102030405060708090A0B0C0D0E0F10DF6203328482DF6303000000"

# 3. POST JSON 호출
curl -X POST "https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/auth" \
  -H "Content-Type: application/json" \
  -d '{"data": "DF61100102030405060708090A0B0C0D0E0F10DF6203328482DF6303000000"}'
```

---

## 4. NFC API (`/functions/v1/nfc`) - NTAG 424 DNA SDM CMAC

NXP NTAG 424 DNA 보안 태그의 SDM(Secure Dynamic Messaging) AES-128-CMAC 서명을 검증하는 전용 순수 JSON API입니다.

### 4.1 엔드포인트 정보
* **엔드포인트 URL**: `https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/nfc`
* **HTTP 메서드**: `GET`
* **응답 포맷**: **JSON Only** (`application/json`)
* **암호화 표준**: NIST SP 800-38B (AES-128-CMAC 동적 서명)

### 4.2 쿼리 파라미터 규격

| 파라미터 | 필수 여부 | 형식 / 길이 | 설명 |
| :---: | :---: | :---: | :--- |
| **`uid`** | **필수** | 14자리 Hex (7B) | 태그 하드웨어 고유 식별자 (예: `04DE5F1EACC040`) |
| **`cnt`** | **필수** | **6자리 Hex (3B)** | NTAG 424 DNA 3바이트 Big-Endian 카운터 (예: `00003D`) |
| **`mac`** | **필수** | 16자리 Hex (8B) | 칩 내부에서 계산된 8바이트 Truncated CMAC (`MACt`) |
| **`kid`** | 선택 | 정수 (기본값: 1) | DB `nfc_keys` 테이블의 키 인덱스 번호 |

### 4.3 호출 예시

```bash
# NFC 태그 CMAC 검증 GET 호출
curl "https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/nfc?uid=04DE5F1EACC040&cnt=00003D&mac=94EED9EE65337086&kid=1"
```

#### 성공 응답 (HTTP 200 OK)
```json
{
  "success": true,
  "resultCode": "SUCCESS",
  "authType": "CMAC",
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

#### 서명 불일치 에러 응답 (HTTP 401 Unauthorized)
```json
{
  "success": false,
  "resultCode": "INVALID_MAC",
  "authType": "CMAC",
  "message": "NFC 암호화 동적 서명 검증에 실패했습니다 (위조 의심).",
  "error": {
    "code": "INVALID_MAC",
    "message": "NFC 암호화 동적 서명 검증에 실패했습니다 (위조 의심)."
  },
  "uid": "04DE5F1EACC040",
  "counter": 61,
  "tagName": "NFC 보안 인증 테스트 태그"
}
```

---

## 5. 두 API 비교 및 요약

| 비교 항목 | **AUTH API (`/functions/v1/auth`)** | **NFC API (`/functions/v1/nfc`)** |
| :--- | :--- | :--- |
| **응답 포맷** | **100% 순수 JSON API** | **100% 순수 JSON API** |
| **전송 파라미터** | **단 1개** (초간결 `?DF61...` BER-TLV 포맷) | **4개** (`uid`, `cnt`, `mac`, `kid` 개별 쿼리) |
| **UID 규격** | **16바이트** (32 Hex) *(기본 스마트카드 규격)* | **7바이트** (14 Hex) *(NTAG 424 DNA 규격)* |
| **OTP/MAC 규격** | **3바이트 Packed BCD** (`DF62 03 328482`) | **8바이트 Truncated CMAC** (`16자리 Hex`) |
| **카운터 규격** | **0부터 시작** (3바이트 / 6 Hex) | **1부터 시작** (3바이트 / 6 Hex) |
| **암호화 알고리즘** | **RFC 4226 HOTP** (HMAC-SHA-1) | **NIST SP 800-38B** (AES-128-CMAC SDM) |
| **호환 하드웨어** | 일반 스마트카드, 자바카드, IoT 보안 칩 | NXP NTAG 424 DNA 전용 |
| **에러 응답 규격** | 구조화된 `error` 객체 및 `message` 표준 제공 | 구조화된 `error` 객체 및 `message` 표준 제공 |

---

* **최종 문서 갱신일**: 2026-11-01  
* **저장소**: [https://github.com/coolbong/nfcauthserver](https://github.com/coolbong/nfcauthserver)
