-- supabase/migrations/20261105000000_photocard_actor_info.sql
-- 정품 인증 화면 하단 정보: 배우 이름과 카드 번호 설정
--   actor      → 화면에 "배우" 항목으로 표시
--   cardNumber → 화면에 "카드 번호 #001"로 표시 (정품일 때만)
-- 기존 product_info의 다른 항목(시리얼, 발행처 등)은 그대로 유지합니다.

UPDATE public.nfc_tags
SET product_info = COALESCE(product_info, '{}'::jsonb)
                   || jsonb_build_object('actor', '배현성', 'cardNumber', '001'),
    updated_at = NOW()
WHERE uid = '0102030405060708090A0B0C0D0E0F10';

SELECT uid, tag_name, product_info
FROM public.nfc_tags
WHERE uid = '0102030405060708090A0B0C0D0E0F10';
