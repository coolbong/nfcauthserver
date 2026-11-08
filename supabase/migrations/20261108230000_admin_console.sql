-- supabase/migrations/20261108230000_admin_console.sql
-- 관리자 페이지용 감사 로그와 카드 관리 함수
--
-- 모든 함수는 service_role 전용이다. 관리자 권한 확인은 Edge Function `admin`이 하고,
-- 이 함수들은 변경과 감사 기록을 한 트랜잭션으로 묶는다.

-- 1. 검증 함수는 SECURITY DEFINER라 anon 키로 직접 호출하면 카운터를 조작할 수 있다.
--    인증 Edge Function은 service_role로 호출하므로 실행 권한을 service_role에만 둔다.
REVOKE EXECUTE ON FUNCTION public.verify_and_log_nfc_scan(VARCHAR, INTEGER, INTEGER, VARCHAR, BOOLEAN, VARCHAR, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_log_nfc_scan(VARCHAR, INTEGER, INTEGER, VARCHAR, BOOLEAN, VARCHAR, TEXT, TEXT) TO service_role;

-- 2. 감사 로그
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID NOT NULL,
    actor_email TEXT NOT NULL,
    action VARCHAR(30) NOT NULL,
    uid VARCHAR(64) NOT NULL,
    before JSONB,
    after JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role has full access to admin_audit_logs" ON public.admin_audit_logs;
CREATE POLICY "Service role has full access to admin_audit_logs"
    ON public.admin_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. 카드 정보 수정 (NULL인 인자는 바꾸지 않는다)
CREATE OR REPLACE FUNCTION public.admin_update_tag(
    p_uid TEXT,
    p_tag_name TEXT,
    p_status TEXT,
    p_product_info JSONB,
    p_actor_id UUID,
    p_actor_email TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_before public.nfc_tags%ROWTYPE;
    v_after public.nfc_tags%ROWTYPE;
BEGIN
    SELECT * INTO v_before FROM public.nfc_tags WHERE uid = UPPER(p_uid) FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TAG_NOT_FOUND';
    END IF;

    UPDATE public.nfc_tags
    SET tag_name = COALESCE(p_tag_name, tag_name),
        status = COALESCE(p_status, status),
        product_info = COALESCE(p_product_info, product_info),
        updated_at = NOW()
    WHERE uid = v_before.uid
    RETURNING * INTO v_after;

    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action, uid, before, after)
    VALUES (
        p_actor_id, p_actor_email, 'UPDATE_TAG', v_before.uid,
        jsonb_build_object('tag_name', v_before.tag_name, 'status', v_before.status, 'product_info', v_before.product_info),
        jsonb_build_object('tag_name', v_after.tag_name, 'status', v_after.status, 'product_info', v_after.product_info)
    );

    RETURN to_jsonb(v_after);
END;
$$;

-- 4. 카운터 리셋 (스캔 로그는 지우지 않고 ADMIN_RESET 기록을 남긴다)
CREATE OR REPLACE FUNCTION public.admin_reset_tag(
    p_uid TEXT,
    p_actor_id UUID,
    p_actor_email TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_before public.nfc_tags%ROWTYPE;
    v_after public.nfc_tags%ROWTYPE;
BEGIN
    SELECT * INTO v_before FROM public.nfc_tags WHERE uid = UPPER(p_uid) FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TAG_NOT_FOUND';
    END IF;

    UPDATE public.nfc_tags
    SET last_counter = 0, total_scans = 0, first_verified_at = NULL, updated_at = NOW()
    WHERE uid = v_before.uid
    RETURNING * INTO v_after;

    INSERT INTO public.nfc_scan_logs (uid, key_index, counter, received_mac, is_valid, result_code, user_agent)
    VALUES (v_before.uid, v_before.key_index, 0, 'ADMIN', false, 'ADMIN_RESET', p_actor_email);

    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action, uid, before, after)
    VALUES (
        p_actor_id, p_actor_email, 'RESET_COUNTER', v_before.uid,
        jsonb_build_object('last_counter', v_before.last_counter, 'total_scans', v_before.total_scans, 'first_verified_at', v_before.first_verified_at),
        jsonb_build_object('last_counter', 0, 'total_scans', 0, 'first_verified_at', NULL)
    );

    RETURN to_jsonb(v_after);
END;
$$;

-- 5. 카운터 지정 (현재 값보다 작게는 바꿀 수 없다. 낮추려면 리셋을 쓴다)
CREATE OR REPLACE FUNCTION public.admin_set_counter(
    p_uid TEXT,
    p_counter INTEGER,
    p_actor_id UUID,
    p_actor_email TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_before public.nfc_tags%ROWTYPE;
    v_after public.nfc_tags%ROWTYPE;
BEGIN
    SELECT * INTO v_before FROM public.nfc_tags WHERE uid = UPPER(p_uid) FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TAG_NOT_FOUND';
    END IF;
    IF p_counter IS NULL OR p_counter < v_before.last_counter OR p_counter > 16777215 THEN
        RAISE EXCEPTION 'COUNTER_OUT_OF_RANGE';
    END IF;

    UPDATE public.nfc_tags
    SET last_counter = p_counter, updated_at = NOW()
    WHERE uid = v_before.uid
    RETURNING * INTO v_after;

    INSERT INTO public.nfc_scan_logs (uid, key_index, counter, received_mac, is_valid, result_code, user_agent)
    VALUES (v_before.uid, v_before.key_index, p_counter, 'ADMIN', false, 'ADMIN_SET_COUNTER', p_actor_email);

    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action, uid, before, after)
    VALUES (
        p_actor_id, p_actor_email, 'SET_COUNTER', v_before.uid,
        jsonb_build_object('last_counter', v_before.last_counter),
        jsonb_build_object('last_counter', p_counter)
    );

    RETURN to_jsonb(v_after);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_tag(TEXT, TEXT, TEXT, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_tag(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_counter(TEXT, INTEGER, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_tag(TEXT, TEXT, TEXT, JSONB, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_tag(TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_counter(TEXT, INTEGER, UUID, TEXT) TO service_role;
