// scripts/db_hex_migration.mjs
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'jklfqmbaubvnbrbuhzak';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

async function executeSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  console.log('🔍 [1] 현재 DB 데이터 조회');
  const tags = await executeSql('SELECT uid, tag_name, last_counter FROM public.nfc_tags;');
  console.log('nfc_tags:', tags);

  const keys = await executeSql('SELECT key_index, encrypted_key, key_iv, key_tag FROM public.nfc_keys;');
  console.log('nfc_keys:', keys);

  const logs = await executeSql('SELECT id, uid, received_mac, result_code FROM public.nfc_scan_logs ORDER BY id DESC LIMIT 5;');
  console.log('nfc_scan_logs (최근 5건):', logs);

  console.log('\n🚀 [2] 모든 HEX 컬럼 대문자 변환 및 트리거/함수 갱신 실행');
  const migrationSql = `
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

    -- 2. 태그 테이블 대문자 자동 강제 트리거
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
  `;

  const migrationRes = await executeSql(migrationSql);
  console.log('Migration 결과:', migrationRes);

  console.log('\n✅ [3] 변환 후 DB 데이터 재검증');
  const updatedTags = await executeSql('SELECT uid, tag_name, last_counter FROM public.nfc_tags;');
  console.log('nfc_tags (변환 후):', updatedTags);

  const updatedKeys = await executeSql('SELECT key_index, encrypted_key, key_iv, key_tag FROM public.nfc_keys;');
  console.log('nfc_keys (변환 후):', updatedKeys);

  const updatedLogs = await executeSql('SELECT id, uid, received_mac, result_code FROM public.nfc_scan_logs ORDER BY id DESC LIMIT 5;');
  console.log('nfc_scan_logs (변환 후 최근 5건):', updatedLogs);
}

main().catch(console.error);
