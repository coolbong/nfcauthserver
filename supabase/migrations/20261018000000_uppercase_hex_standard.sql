-- ==============================================================================
-- NFC Authentication 모든 HEX 값 대문자 표준화 마이그레이션
-- 파일명: supabase/migrations/20261018000000_uppercase_hex_standard.sql
-- ==============================================================================

-- 1. 기존 데이터 대문자 변환
UPDATE public.nfc_tags
SET uid = UPPER(uid);

UPDATE public.nfc_keys
SET encrypted_key = UPPER(encrypted_key),
    key_iv = UPPER(key_iv),
    key_tag = UPPER(key_tag);

UPDATE public.nfc_scan_logs
SET uid = UPPER(uid),
    received_mac = UPPER(received_mac);

UPDATE public.nfc_tags
SET product_info = jsonb_set(
  product_info,
  '{supportUrl}',
  to_jsonb('https://coolbong.github.io/nfcauthserver/certificate.html?uid=' || UPPER(uid))
)
WHERE product_info ? 'supportUrl';

-- 2. 모든 테이블 HEX 컬럼 대문자 강제 트리거 함수
CREATE OR REPLACE FUNCTION public.trg_uppercase_nfc_hex()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'nfc_tags' THEN
    NEW.uid := UPPER(TRIM(NEW.uid));
  ELSIF TG_TABLE_NAME = 'nfc_keys' THEN
    NEW.encrypted_key := UPPER(TRIM(NEW.encrypted_key));
    NEW.key_iv := UPPER(TRIM(NEW.key_iv));
    NEW.key_tag := UPPER(TRIM(NEW.key_tag));
  ELSIF TG_TABLE_NAME = 'nfc_scan_logs' THEN
    IF NEW.uid IS NOT NULL THEN
      NEW.uid := UPPER(TRIM(NEW.uid));
    END IF;
    IF NEW.received_mac IS NOT NULL THEN
      NEW.received_mac := UPPER(TRIM(NEW.received_mac));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nfc_tags_uppercase ON public.nfc_tags;
CREATE TRIGGER trg_nfc_tags_uppercase
  BEFORE INSERT OR UPDATE ON public.nfc_tags
  FOR EACH ROW EXECUTE FUNCTION public.trg_uppercase_nfc_hex();

DROP TRIGGER IF EXISTS trg_nfc_keys_uppercase ON public.nfc_keys;
CREATE TRIGGER trg_nfc_keys_uppercase
  BEFORE INSERT OR UPDATE ON public.nfc_keys
  FOR EACH ROW EXECUTE FUNCTION public.trg_uppercase_nfc_hex();

DROP TRIGGER IF EXISTS trg_nfc_scan_logs_uppercase ON public.nfc_scan_logs;
CREATE TRIGGER trg_nfc_scan_logs_uppercase
  BEFORE INSERT OR UPDATE ON public.nfc_scan_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_uppercase_nfc_hex();

-- 3. Stored Procedure(verify_and_log_nfc_scan) 대문자 표준화 갱신
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

        IF p_counter <= v_last_counter THEN
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
