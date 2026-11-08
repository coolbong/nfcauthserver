-- supabase/migrations/20261108200000_yugioh_cards_master_data.sql
-- 유희왕 카드 5종 데모 태그 등록 (16바이트 UID, Key Index 2: 20바이트 HOTP 스마트카드)
--
-- 카드 정보는 YGOPRODeck(assets/king/link.txt)에서 확인한 값만 넣는다.
-- 레어도, 에디션, 세트 번호, 효과 문구는 실물 카드에서 확인되기 전까지 넣지 않는다.
-- 신규 카드 3종은 공식 한국어명을 확인하지 못해 cardName에 영문명을 쓴다.
-- serialNumber와 issuer는 이 데모가 발급하는 값이며, 코나미 공식 인증이 아니다.

INSERT INTO public.nfc_tags (uid, tag_name, key_index, last_counter, total_scans, status, product_info)
VALUES
  (
    '10000010000000000000000000000001',
    '라의 익신룡 (The Winged Dragon of Ra)',
    2, 0, 0, 'ACTIVE',
    '{
      "game": "Yu-Gi-Oh!",
      "brand": "Yu-Gi-Oh!",
      "model": "라의 익신룡",
      "cardName": "라의 익신룡",
      "cardNameEn": "The Winged Dragon of Ra",
      "passcode": "10000010",
      "attribute": "신(DIVINE)",
      "race": "환신야수족",
      "cardType": "효과 몬스터",
      "level": 10,
      "atk": "?",
      "def": "?",
      "serialNumber": "YGO-DEMO-RA01",
      "issuer": "NFC Authentication 데모",
      "imageUrl": "assets/king/10000010.jpg"
    }'::jsonb
  ),
  (
    '10000090000000000000000000000002',
    '라의 익신룡-불사조 (The Winged Dragon of Ra - Immortal Phoenix)',
    2, 0, 0, 'ACTIVE',
    '{
      "game": "Yu-Gi-Oh!",
      "brand": "Yu-Gi-Oh!",
      "model": "라의 익신룡-불사조",
      "cardName": "라의 익신룡-불사조",
      "cardNameEn": "The Winged Dragon of Ra - Immortal Phoenix",
      "passcode": "10000090",
      "attribute": "신(DIVINE)",
      "race": "환신야수족",
      "cardType": "효과 몬스터",
      "level": 10,
      "atk": "4000",
      "def": "4000",
      "serialNumber": "YGO-DEMO-PH02",
      "issuer": "NFC Authentication 데모",
      "imageUrl": "assets/king/10000090.jpg"
    }'::jsonb
  ),
  (
    '82951145000000000000000000000003',
    'Helpoemer, Chanter of the Sun God',
    2, 0, 0, 'ACTIVE',
    '{
      "game": "Yu-Gi-Oh!",
      "brand": "Yu-Gi-Oh!",
      "model": "Helpoemer, Chanter of the Sun God",
      "cardName": "Helpoemer, Chanter of the Sun God",
      "cardNameEn": "Helpoemer, Chanter of the Sun God",
      "passcode": "82951145",
      "attribute": "어둠(DARK)",
      "race": "악마족",
      "cardType": "효과 몬스터",
      "level": 5,
      "atk": "2000",
      "def": "1400",
      "serialNumber": "YGO-DEMO-HP03",
      "issuer": "NFC Authentication 데모",
      "imageUrl": "assets/king/82951145.jpg"
    }'::jsonb
  ),
  (
    '18446859000000000000000000000004',
    'Makyura, Destructor of the Sun God',
    2, 0, 0, 'ACTIVE',
    '{
      "game": "Yu-Gi-Oh!",
      "brand": "Yu-Gi-Oh!",
      "model": "Makyura, Destructor of the Sun God",
      "cardName": "Makyura, Destructor of the Sun God",
      "cardNameEn": "Makyura, Destructor of the Sun God",
      "passcode": "18446859",
      "attribute": "어둠(DARK)",
      "race": "전사족",
      "cardType": "효과 몬스터",
      "level": 4,
      "atk": "1600",
      "def": "1200",
      "serialNumber": "YGO-DEMO-MK04",
      "issuer": "NFC Authentication 데모",
      "imageUrl": "assets/king/18446859.jpg"
    }'::jsonb
  ),
  (
    '45430558000000000000000000000005',
    'Gil Garth, Exterminator of the Sun God',
    2, 0, 0, 'ACTIVE',
    '{
      "game": "Yu-Gi-Oh!",
      "brand": "Yu-Gi-Oh!",
      "model": "Gil Garth, Exterminator of the Sun God",
      "cardName": "Gil Garth, Exterminator of the Sun God",
      "cardNameEn": "Gil Garth, Exterminator of the Sun God",
      "passcode": "45430558",
      "attribute": "어둠(DARK)",
      "race": "악마족",
      "cardType": "효과 몬스터",
      "level": 4,
      "atk": "1800",
      "def": "1200",
      "serialNumber": "YGO-DEMO-GG05",
      "issuer": "NFC Authentication 데모",
      "imageUrl": "assets/king/45430558.jpg"
    }'::jsonb
  )
ON CONFLICT (uid) DO UPDATE
SET tag_name = EXCLUDED.tag_name,
    key_index = EXCLUDED.key_index,
    status = EXCLUDED.status,
    product_info = EXCLUDED.product_info,
    updated_at = NOW();
