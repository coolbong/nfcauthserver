-- ==============================================================================
-- NFC Authentication 보안 태그 인증 시스템 데이터베이스 스키마
-- 파일명: supabase/migrations/20261014000000_create_nfc_auth_schema.sql
-- ==============================================================================

-- 1. NFC 암호화 키 관리 테이블 (Envelope Encryption - AES-256-GCM)
CREATE TABLE IF NOT EXISTS public.nfc_keys (
    key_index INTEGER PRIMARY KEY,                      -- 키 식별 번호 (예: 1, 2, 3... URL ?kid=1 로 지정 가능)
    key_name VARCHAR(100) NOT NULL,                     -- 키 용도 명칭 (예: '2026년 공장출하 기본키', '배치 A 전용 키')
    encrypted_key VARCHAR(64) NOT NULL,                 -- KEK(AES-256-GCM)로 암호화된 NFC 보안 키 값
    key_iv VARCHAR(32) NOT NULL,                        -- AES-GCM 초기화 벡터 (IV, 12바이트 hex)
    key_tag VARCHAR(32) NOT NULL,                       -- AES-GCM 무결성 인증 태그 (Auth Tag, 16바이트 hex)
    status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,       -- 'ACTIVE', 'RETIRED', 'REVOKED'
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. NFC 태그 마스터 테이블
CREATE TABLE IF NOT EXISTS public.nfc_tags (
    uid VARCHAR(14) PRIMARY KEY,                         -- 7바이트 UID (14 hex chars, 대문자)
    tag_name VARCHAR(100) NOT NULL,                     -- 제품명 또는 태그 식별 명칭
    key_index INTEGER NOT NULL REFERENCES public.nfc_keys(key_index), -- 사용할 암호화 키 인덱스
    last_counter INTEGER DEFAULT 0 NOT NULL,            -- 마지막 정상 인증 카운터 (리플레이 공격 방지)
    total_scans INTEGER DEFAULT 0 NOT NULL,             -- 총 정상 인증 횟수
    status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,       -- 'ACTIVE', 'SUSPENDED', 'REVOKED'
    product_info JSONB DEFAULT '{}'::jsonb,             -- 제품 메타데이터 (시리얼, 제조사, 이미지URL 등)
    first_verified_at TIMESTAMPTZ,                      -- 최초 정품 인증 일시
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nfc_tags_status ON public.nfc_tags(status);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_key_index ON public.nfc_tags(key_index);

-- 3. 스캔 및 인증 로그 테이블
CREATE TABLE IF NOT EXISTS public.nfc_scan_logs (
    id BIGSERIAL PRIMARY KEY,
    uid VARCHAR(14),
    key_index INTEGER,
    counter INTEGER NOT NULL,
    received_mac VARCHAR(32) NOT NULL,
    is_valid BOOLEAN NOT NULL,
    result_code VARCHAR(50) NOT NULL,                   -- 'SUCCESS', 'COUNTER_REPLAY', 'INVALID_MAC', 'TAG_NOT_FOUND', 'KEY_NOT_FOUND'
    client_ip TEXT,
    user_agent TEXT,
    scanned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nfc_scan_logs_uid ON public.nfc_scan_logs(uid);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_logs_scanned_at ON public.nfc_scan_logs(scanned_at DESC);

-- 4. Row Level Security (RLS) 보안 정책
ALTER TABLE public.nfc_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_scan_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to nfc_keys" ON public.nfc_keys;
CREATE POLICY "Service role has full access to nfc_keys"
    ON public.nfc_keys FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role has full access to nfc_tags" ON public.nfc_tags;
CREATE POLICY "Service role has full access to nfc_tags"
    ON public.nfc_tags FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role has full access to nfc_scan_logs" ON public.nfc_scan_logs;
CREATE POLICY "Service role has full access to nfc_scan_logs"
    ON public.nfc_scan_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. 원자적 검증 및 카운터/로그 기록 Stored Procedure
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
DECLARE
    v_last_counter INTEGER;
    v_status VARCHAR(20);
    v_tag_name VARCHAR(100);
    v_product_info JSONB;
    v_total_scans INTEGER;
    v_first_verified_at TIMESTAMPTZ;
    v_norm_uid VARCHAR(14);
    v_norm_mac VARCHAR(32);
BEGIN
    v_norm_uid := UPPER(TRIM(p_uid));
    v_norm_mac := UPPER(TRIM(p_received_mac));

    IF p_is_valid THEN
        SELECT t.last_counter, t.status, t.tag_name, t.product_info, t.total_scans, t.first_verified_at
        INTO v_last_counter, v_status, v_tag_name, v_product_info, v_total_scans, v_first_verified_at
        FROM public.nfc_tags t
        WHERE UPPER(t.uid) = v_norm_uid
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO public.nfc_scan_logs (uid, key_index, counter, received_mac, is_valid, result_code, client_ip, user_agent)
            VALUES (v_norm_uid, p_key_index, p_counter, v_norm_mac, false, 'TAG_NOT_FOUND', p_client_ip, p_user_agent);

            RETURN QUERY SELECT false, 'TAG_NOT_FOUND'::VARCHAR(50), 0, NULL::TIMESTAMPTZ, NULL::VARCHAR(100), NULL::JSONB;
            RETURN;
        END IF;

        IF v_status <> 'ACTIVE' THEN
            INSERT INTO public.nfc_scan_logs (uid, key_index, counter, received_mac, is_valid, result_code, client_ip, user_agent)
            VALUES (v_norm_uid, p_key_index, p_counter, v_norm_mac, false, 'TAG_INACTIVE', p_client_ip, p_user_agent);

            RETURN QUERY SELECT false, 'TAG_INACTIVE'::VARCHAR(50), v_total_scans, v_first_verified_at, v_tag_name, v_product_info;
            RETURN;
        END IF;

        -- 카운터 검증: 이전 카운터보다 커야 함 (Replay Attack 방어)
        IF p_counter <= v_last_counter THEN
            INSERT INTO public.nfc_scan_logs (uid, key_index, counter, received_mac, is_valid, result_code, client_ip, user_agent)
            VALUES (v_norm_uid, p_key_index, p_counter, v_norm_mac, false, 'COUNTER_REPLAY', p_client_ip, p_user_agent);

            RETURN QUERY SELECT false, 'COUNTER_REPLAY'::VARCHAR(50), v_total_scans, v_first_verified_at, v_tag_name, v_product_info;
            RETURN;
        END IF;

        -- 검증 통과 -> 카운터 및 스캔 수 갱신
        v_first_verified_at := COALESCE(v_first_verified_at, NOW());
        v_total_scans := v_total_scans + 1;

        UPDATE public.nfc_tags
        SET last_counter = p_counter,
            total_scans = v_total_scans,
            first_verified_at = v_first_verified_at,
            updated_at = NOW()
        WHERE UPPER(public.nfc_tags.uid) = v_norm_uid;

        INSERT INTO public.nfc_scan_logs (uid, key_index, counter, received_mac, is_valid, result_code, client_ip, user_agent)
        VALUES (v_norm_uid, p_key_index, p_counter, v_norm_mac, true, 'SUCCESS', p_client_ip, p_user_agent);

        RETURN QUERY SELECT true, 'SUCCESS'::VARCHAR(50), v_total_scans, v_first_verified_at, v_tag_name, v_product_info;
        RETURN;
    ELSE
        INSERT INTO public.nfc_scan_logs (uid, key_index, counter, received_mac, is_valid, result_code, client_ip, user_agent)
        VALUES (v_norm_uid, p_key_index, p_counter, v_norm_mac, false, p_result_code, p_client_ip, p_user_agent);

        RETURN QUERY SELECT false, p_result_code::VARCHAR(50), 0, NULL::TIMESTAMPTZ, NULL::VARCHAR(100), NULL::JSONB;
        RETURN;
    END IF;
END;
$$;

-- 6. 초기 시드 데이터 등록
INSERT INTO public.nfc_keys (key_index, key_name, encrypted_key, key_iv, key_tag, status)
VALUES (
    1,
    '기본 공장출하 테스트 키 (#1)',
    '03F4E329C6BB3972CA879E0BCBCF8995',
    '105A3B69A7E912B7E9CB8D54',
    '1BBBC68E9D227B0D406A513674C6A37F',
    'ACTIVE'
)
ON CONFLICT (key_index) DO UPDATE
SET key_name = EXCLUDED.key_name,
    encrypted_key = EXCLUDED.encrypted_key,
    key_iv = EXCLUDED.key_iv,
    key_tag = EXCLUDED.key_tag,
    status = EXCLUDED.status;

INSERT INTO public.nfc_tags (uid, tag_name, key_index, last_counter, status, product_info)
VALUES (
    '04DE5F1EACC040',
    'NFC 보안 인증 테스트 태그',
    1,
    0,
    'ACTIVE',
    '{
        "brand": "NFC Authentication",
        "model": "NFC-AUTH-PoC",
        "serialNumber": "NFC-AUTH-0001",
        "description": "DB 키 암호화 및 다중 키 관리가 적용된 정품 태그입니다.",
        "supportUrl": "https://example.com/support"
    }'::jsonb
)
ON CONFLICT (uid) DO UPDATE
SET tag_name = EXCLUDED.tag_name,
    key_index = EXCLUDED.key_index,
    product_info = EXCLUDED.product_info;
