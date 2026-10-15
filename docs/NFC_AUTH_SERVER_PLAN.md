# NFC Authentication (uid / cnt / mac / kid) 기반 Supabase 인증 서버 & 웹페이지 개발 계획서

## 1. 개요 및 목적
본 프로젝트는 **동적 보안 메시징(SDM)** 기술을 지원하는 보안 NFC 태그를 활용하여, 스마트폰으로 NFC 태그를 탭했을 때 전달되는 데이터(`uid`, `cnt`, `mac` 및 선택적 `kid`)를 기반으로 **Supabase** 백엔드에서 정품 여부 및 재전송 공격을 실시간 검증하고 모바일 인증 웹페이지를 제공하는 서버를 구축합니다.

- **DB 키 암호화 (Envelope Encryption)**: 데이터베이스가 통째로 탈취/덤프되더라도 공격자가 평문 AES 키를 알아볼 수 없도록 **AES-256-GCM**으로 암호화하여 저장합니다.
- **다중 키 풀 및 키 인덱스 (`kid`) 지원**: 여러 개의 키를 번호(인덱스)별로 관리할 수 있으며, URL 쿼리 파라미터 `&kid=...`를 통해 어떤 키를 사용하는지 지정하거나 태그 레코드에 매핑된 키를 자동으로 사용합니다.
- **모바일 반응형 웹 화면 즉시 렌더링**: 별도 앱 없이 스마트폰 브라우저가 열리며 정품 인증 성공/복제 경고/위조 경고 화면을 표시합니다.

---

## 2. 카드(태그)에서 생성되어 전달되는 데이터 규격

스마트폰으로 태그를 탭했을 때 호출되는 URL 형식:
```text
GET https://xxx.co/v1/nfc?uid=04C767F2066180&cnt=000001&mac=54A45B2C3A558765&kid=1
```

| 파라미터명 | 필수 여부 | 데이터 규격 | 상세 설명 |
| :--- | :---: | :--- | :--- |
| **`uid`** | **필수** | **14자리 Hex** (7 바이트) | NFC 보안 태그 고유 하드웨어 일련번호 (예: `04C767F2066180`) |
| **`cnt`** | **필수** | **6자리 Hex** (3 바이트) | 탭할 때마다 1씩 증가하는 Big-Endian 카운터 (예: `000001`) |
| **`mac`** | **필수** | **16자리 Hex** (8 바이트)<br/>*(32자리 Hex도 호환)* | **SDMMAC (NIST SP 800-38B CMAC)**<br/>칩에서 계산된 8바이트 Truncated CMAC (16자리 Hex 문자) |
| **`kid`** | **선택** | **정수 (Integer)** | 사용할 암호화 키 번호 (예: `1`, `2`). 생략 시 태그 마스터 DB에 매핑된 기본 키 사용 |

---

## 3. DB 키 암호화 (Envelope Encryption) 메커니즘

```mermaid
flowchart TD
    subgraph Supabase Secrets (보안 격리 환경)
        KEK["마스터 키 암호화 키 (NFC_KEK)<br/>256비트 비밀키 (64 Hex chars)"]
    end

    subgraph Supabase Database (public.nfc_keys)
        Row["key_index: 1<br/>encrypted_key: '03F4...'<br/>key_iv: '105A...'<br/>key_tag: '1BBB...'"]
    end

    subgraph Edge Function 런타임 메모리 (RAM)
        Row --> Decrypt["AES-256-GCM 복호화<br/>(KEK + IV + Cipher + Tag)"]
        KEK --> Decrypt
        Decrypt --> PlainKey["임시 복원된 평문 보안 키<br/>(16 바이트 AES-128)"]
        PlainKey --> Verify["CMAC 검증 연산 후<br/>메모리에서 즉시 해제"]
    end
```

1. **DB 저장 시점**: 관리자가 `scripts/manage_keys.js`를 사용해 평문 보안 키를 AES-256-GCM으로 암호화하여 DB에 삽입합니다. (DB에는 암호문, IV, Tag만 저장됨)
2. **검증 시점**: Edge Function이 DB에서 암호화된 키를 읽어온 뒤, 환경변수 `NFC_KEK`로 메모리 상에서만 일시적으로 복호화하여 보안 태그의 CMAC을 검증합니다.
3. **보안 효과**: DB 관리자나 SQL 덤프 파일이 유출되더라도 `NFC_KEK`가 없으면 원본 보안 키를 절대 복원할 수 없습니다.

---

## 4. Supabase 데이터베이스 스키마 설계

```sql
-- 1. NFC 암호화 키 관리 테이블 (AES-256-GCM 암호화 보관)
CREATE TABLE IF NOT EXISTS public.nfc_keys (
    key_index INTEGER PRIMARY KEY,                      -- 키 번호 (1, 2, 3...)
    key_name VARCHAR(100) NOT NULL,                     -- 키 명칭 (예: '2026 Q1 배치 전용 키')
    encrypted_key VARCHAR(64) NOT NULL,                 -- KEK로 암호화된 보안 키
    key_iv VARCHAR(32) NOT NULL,                        -- AES-GCM IV (12바이트 hex)
    key_tag VARCHAR(32) NOT NULL,                       -- AES-GCM Auth Tag (16바이트 hex)
    status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,       -- 'ACTIVE', 'RETIRED', 'REVOKED'
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. NFC 태그 마스터 테이블
CREATE TABLE IF NOT EXISTS public.nfc_tags (
    uid VARCHAR(14) PRIMARY KEY,                         -- 7바이트 UID
    tag_name VARCHAR(100) NOT NULL,                     -- 제품명 또는 태그 식별 명칭
    key_index INTEGER NOT NULL REFERENCES public.nfc_keys(key_index),
    last_counter INTEGER DEFAULT 0 NOT NULL,            -- 마지막 정상 인증 카운터
    total_scans INTEGER DEFAULT 0 NOT NULL,             -- 총 정상 인증 횟수
    status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,       -- 'ACTIVE', 'SUSPENDED', 'REVOKED'
    product_info JSONB DEFAULT '{}'::jsonb,             -- 제품 메타데이터
    first_verified_at TIMESTAMPTZ,                      -- 최초 정품 인증 일시
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. 스캔 및 인증 로그 테이블
CREATE TABLE IF NOT EXISTS public.nfc_scan_logs (
    id BIGSERIAL PRIMARY KEY,
    uid VARCHAR(14),
    key_index INTEGER,
    counter INTEGER NOT NULL,
    received_mac VARCHAR(32) NOT NULL,
    is_valid BOOLEAN NOT NULL,
    result_code VARCHAR(50) NOT NULL,                   -- 'SUCCESS', 'COUNTER_REPLAY', 'INVALID_MAC', 'TAG_NOT_FOUND'
    client_ip TEXT,
    user_agent TEXT,
    scanned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. 원자적 검증 및 카운터/로그 갱신 Stored Procedure
CREATE OR REPLACE FUNCTION public.verify_and_log_nfc_scan(
    p_uid VARCHAR(14),
    p_key_index INTEGER,
    p_counter INTEGER,
    p_received_mac VARCHAR(32),
    p_is_valid BOOLEAN,
    p_result_code VARCHAR(50),
    p_client_ip TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    result_code VARCHAR(50),
    total_scans INTEGER,
    first_verified_at TIMESTAMPTZ,
    tag_name VARCHAR(100),
    product_info JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
-- (동시성 제어 FOR UPDATE 및 카운터/로그 원자적 갱신 로직)
...
$$;
```

---

## 5. 사용자 모바일 인증 웹페이지(HTML UI) 설계

| 화면 구분 | 테마 색상 | 주요 표시 정보 및 사용자 안내 |
| :--- | :--- | :--- |
| **정품 인증 성공 (SUCCESS)** | 🟢 Emerald Green | • "정품 인증이 완료되었습니다" 배지<br/>• 제품명, 고유 시리얼 번호, 최초 인증 일시<br/>• "고객님이 N번째로 정품 인증하셨습니다"<br/>• 제품 상세 설명 및 공식 웹사이트 이동 링크 |
| **복제 의심 경고 (COUNTER_REPLAY)** | 🟠 Amber Warning | • "⚠️ 복제 의심 태그 경고"<br/>• 이전에 이미 사용된 보안 카운터임을 안내<br/>• 브라우저 새로고침이 아닌 경우 불법 복제된 태그일 가능성 고지 |
| **위조 태그 경고 (INVALID_MAC)** | 🔴 Crimson Danger | • "⛔ 위조품 의심 경고"<br/>• 태그의 암호화 서명(CMAC)이 일치하지 않음<br/>• 비정상 제품이므로 고객센터 문의 안내 |
| **미등록 태그 (TAG_NOT_FOUND)** | ⚪ Neutral Slate | • "등록되지 않은 태그입니다"<br/>• 관리자 문의 안내 |

---

## 6. 키 관리 CLI 도구 (`scripts/manage_keys.js`)

관리자가 새로운 보안 키를 KEK로 암호화하여 DB에 등록할 수 있는 도구를 제공합니다:

```powershell
# 1. 신규 마스터 KEK 생성
node scripts/manage_keys.js generate-kek

# 2. 신규 보안 키 암호화 및 DB 등록용 SQL 생성
node scripts/manage_keys.js encrypt --index 2 --name "2026 봄 컬렉션 전용 키" --key 0102030405060708090A0B0C0D0E0F10
```
