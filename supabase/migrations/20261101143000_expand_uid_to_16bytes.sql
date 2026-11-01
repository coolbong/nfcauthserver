-- ==============================================================================
-- NFC Authentication UID 16바이트 (32자리 HEX) 및 가변 길이 지원 확장 마이그레이션
-- 파일명: supabase/migrations/20261101143000_expand_uid_to_16bytes.sql
-- ==============================================================================

-- 1. 테이블 컬럼 길이 확장 (기존 7B/14자 -> 16B/32자 및 향후 확장 고려 64자)
ALTER TABLE public.nfc_tags 
  ALTER COLUMN uid TYPE VARCHAR(64);

ALTER TABLE public.nfc_scan_logs 
  ALTER COLUMN uid TYPE VARCHAR(64);

-- 2. Stored Procedure(verify_and_log_nfc_scan) UID 파라미터 및 변수 확장
CREATE OR REPLACE FUNCTION public.verify_and_log_nfc_scan(
    p_uid VARCHAR(64),
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
    v_norm_uid VARCHAR(64);
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

        -- 카운터 검증: 최초 인증(total_scans = 0)인 경우 0 이상 허용, 이후에는 반드시 이전 카운터 초과여야 함 (Replay Attack 방어)
        IF (v_total_scans = 0 AND p_counter < v_last_counter) OR (v_total_scans > 0 AND p_counter <= v_last_counter) THEN
            INSERT INTO public.nfc_scan_logs (uid, key_index, counter, received_mac, is_valid, result_code, client_ip, user_agent)
            VALUES (v_norm_uid, p_key_index, p_counter, v_norm_mac, false, 'COUNTER_REPLAY', p_client_ip, p_user_agent);

            RETURN QUERY SELECT false, 'COUNTER_REPLAY'::VARCHAR(50), v_total_scans, v_first_verified_at, v_tag_name, v_product_info;
            RETURN;
        END IF;

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
