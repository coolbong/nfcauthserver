-- supabase/migrations/20261101153000_add_20byte_hotp_key.sql
-- 스마트카드 RFC 4226 HOTP 20바이트 (160비트) 보안 키 등록 및 태그 매핑

-- 1. key_index: 2 (20바이트 HOTP 보안 키) 등록
-- 평문 키: 000102030405060708090A0B0C0D0E0F10111213 (20바이트 / 40자리 Hex)
-- Master KEK (0123...CDEF) 기준 AES-256-GCM 암호화
INSERT INTO public.nfc_keys (key_index, key_name, encrypted_key, key_iv, key_tag, status)
VALUES (
    2,
    '스마트카드 HOTP 20바이트 보안 키 (#2)',
    '53AB44A98C99FC44CC179AB64305F64D8F96D00A',
    '854F0F6A2355ED7421966FB3',
    'BD326E486638070CA3C128D324C86226',
    'ACTIVE'
)
ON CONFLICT (key_index) DO UPDATE
SET key_name = EXCLUDED.key_name,
    encrypted_key = EXCLUDED.encrypted_key,
    key_iv = EXCLUDED.key_iv,
    key_tag = EXCLUDED.key_tag,
    status = EXCLUDED.status;

-- 2. 16바이트 UID 스마트카드 태그를 20바이트 키(#2)로 매핑
UPDATE public.nfc_tags
SET key_index = 2,
    last_counter = 0,
    total_scans = 0,
    first_verified_at = NULL
WHERE uid = '0102030405060708090A0B0C0D0E0F10';

-- 3. 7바이트 UID HOTP 테스트 태그도 20바이트 키(#2)로 매핑
UPDATE public.nfc_tags
SET key_index = 2,
    last_counter = 0,
    total_scans = 0,
    first_verified_at = NULL
WHERE uid = '04112233445566';
