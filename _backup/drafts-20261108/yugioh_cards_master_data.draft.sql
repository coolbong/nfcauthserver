-- ==============================================================================
-- 유희왕 카드 5종 마스터 데이터 등록 마이그레이션 (독립 UID 적용)
-- 파일명: supabase/migrations/20261108200000_yugioh_cards_master_data.sql
-- 중요: 기존 포토카드 데모(배현성 포토카드 등)와의 충돌을 방지하기 위해
--      기존 UID를 일절 수정하지 않고, 유희왕 전용 독립 UID만 등록합니다.
-- ==============================================================================

-- 1. 유희왕 카드 5종 전용 NTAG UID 등록 (7바이트, Key Index 1: AES-128 CMAC)
INSERT INTO public.nfc_tags (uid, tag_name, key_index, last_counter, total_scans, status, product_info)
VALUES
  -- 1) 라의 익신룡 (The Winged Dragon of Ra)
  (
    '04100000100001',
    '라의 익신룡 (The Winged Dragon of Ra)',
    1,
    0,
    0,
    'ACTIVE',
    '{
      "category": "TCG",
      "game": "Yu-Gi-Oh! OCG/TCG",
      "brand": "Yu-Gi-Oh! OCG",
      "model": "라의 익신룡 (The Winged Dragon of Ra)",
      "cardName": "라의 익신룡",
      "cardNameEn": "The Winged Dragon of Ra",
      "passcode": "10000010",
      "attribute": "신(DIVINE)",
      "type": "환신야수족 / 효과",
      "level": 10,
      "atk": "?",
      "def": "?",
      "rarity": "Prismatic Secret Rare",
      "edition": "1st Edition",
      "cardNumber": "PGB1-KR001",
      "serialNumber": "YGO-2026-RA001",
      "issuer": "KONAMI",
      "imageUrl": "assets/king/10000010.jpg",
      "description": "이 카드는 특수 소환할 수 없다. 이 카드를 통상 소환할 경우, 3장을 릴리스하고 일반 소환해야 한다. 이 카드의 일반 소환은 무효화되지 않는다."
    }'::jsonb
  ),
  -- 2) 라의 익신룡-불사조 (The Winged Dragon of Ra - Immortal Phoenix)
  (
    '04100000900002',
    '라의 익신룡-불사조 (Immortal Phoenix)',
    1,
    0,
    0,
    'ACTIVE',
    '{
      "category": "TCG",
      "game": "Yu-Gi-Oh! OCG/TCG",
      "brand": "Yu-Gi-Oh! OCG",
      "model": "라의 익신룡-불사조 (Immortal Phoenix)",
      "cardName": "라의 익신룡-불사조",
      "cardNameEn": "The Winged Dragon of Ra - Immortal Phoenix",
      "passcode": "10000090",
      "attribute": "신(DIVINE)",
      "type": "환신야수족 / 특수 소환 / 효과",
      "level": 10,
      "atk": "4000",
      "def": "4000",
      "rarity": "Secret Rare",
      "edition": "1st Edition",
      "cardNumber": "DP24-KR002",
      "serialNumber": "YGO-2026-PH002",
      "issuer": "KONAMI",
      "imageUrl": "assets/king/10000090.jpg",
      "description": "이 카드는 통상 소환할 수 없으며, 이 카드의 효과로만 특수 소환할 수 있다. 이 카드는 다른 카드의 효과를 받지 않는다."
    }'::jsonb
  ),
  -- 3) 태양신의 영창자 - 헬포에머 (Helpoemer)
  (
    '04829511450003',
    '헬포에머 (Helpoemer - Chanter of the Sun God)',
    1,
    0,
    0,
    'ACTIVE',
    '{
      "category": "TCG",
      "game": "Yu-Gi-Oh! OCG/TCG",
      "brand": "Yu-Gi-Oh! OCG",
      "model": "헬포에머 (Helpoemer)",
      "cardName": "헬포에머",
      "cardNameEn": "Helpoemer - Chanter of the Sun God",
      "passcode": "82951145",
      "attribute": "어둠(DARK)",
      "type": "악마족 / 효과",
      "level": 5,
      "atk": "2000",
      "def": "1400",
      "rarity": "Ultra Rare",
      "edition": "1st Edition",
      "cardNumber": "DP24-KR003",
      "serialNumber": "YGO-2026-HP003",
      "issuer": "KONAMI",
      "imageUrl": "assets/king/82951145.jpg",
      "description": "이 카드가 전투에 의해 파괴되어 묘지로 보내졌을 때 발동한다. 상대 턴의 배틀 페이즈 종료시마다 상대 패를 무작위로 1장 버린다."
    }'::jsonb
  ),
  -- 4) 처형인-마큐라 (Makyura the Destructor)
  (
    '04184468590004',
    '처형인-마큐라 (Makyura the Destructor)',
    1,
    0,
    0,
    'ACTIVE',
    '{
      "category": "TCG",
      "game": "Yu-Gi-Oh! OCG/TCG",
      "brand": "Yu-Gi-Oh! OCG",
      "model": "처형인-마큐라 (Makyura the Destructor)",
      "cardName": "처형인-마큐라",
      "cardNameEn": "Makyura the Destructor of the Sun God",
      "passcode": "18446859",
      "attribute": "어둠(DARK)",
      "type": "전사족 / 효과",
      "level": 4,
      "atk": "1600",
      "def": "1200",
      "rarity": "Super Rare",
      "edition": "1st Edition",
      "cardNumber": "DP24-KR004",
      "serialNumber": "YGO-2026-MK004",
      "issuer": "KONAMI",
      "imageUrl": "assets/king/18446859.jpg",
      "description": "이 카드명의 효과는 1턴에 1번밖에 사용할 수 없다. 이 카드가 몬스터 존에서 묘지로 보내졌을 경우에 발동할 수 있다. 이 턴에 1번만, 자신은 패에서 함정 카드를 발동할 수 있다."
    }'::jsonb
  ),
  -- 5) 태양신의 박멸자 - 길 가스 (Gil Garth)
  (
    '04454305580005',
    '길 가스 (Gil Garth - Exterminator of the Sun God)',
    1,
    0,
    0,
    'ACTIVE',
    '{
      "category": "TCG",
      "game": "Yu-Gi-Oh! OCG/TCG",
      "brand": "Yu-Gi-Oh! OCG",
      "model": "길 가스 (Gil Garth)",
      "cardName": "길 가스",
      "cardNameEn": "Gil Garth - Exterminator of the Sun God",
      "passcode": "45430558",
      "attribute": "어둠(DARK)",
      "type": "악마족 / 일반",
      "level": 4,
      "atk": "1800",
      "def": "1200",
      "rarity": "Super Rare",
      "edition": "1st Edition",
      "cardNumber": "DP24-KR005",
      "serialNumber": "YGO-2026-GG005",
      "issuer": "KONAMI",
      "imageUrl": "assets/king/45430558.jpg",
      "description": "수많은 악행을 일삼는 데 전력을 다하는 강철의 거인. 그가 휘두르는 갑옷은 피로 물들어 있다."
    }'::jsonb
  )
ON CONFLICT (uid) DO UPDATE
SET tag_name = EXCLUDED.tag_name,
    key_index = EXCLUDED.key_index,
    status = EXCLUDED.status,
    product_info = EXCLUDED.product_info,
    updated_at = NOW();

-- 2. 유희왕 카드 5종 전용 스마트카드 UID 등록 (16바이트, Key Index 2: 20B HOTP)
-- 스마트카드 발급 시 사용할 수 있도록 16바이트 고유 UID 할당
INSERT INTO public.nfc_tags (uid, tag_name, key_index, last_counter, total_scans, status, product_info)
VALUES
  -- 1) 라의 익신룡 (스마트카드용)
  (
    '10000010000000000000000000000001',
    '라의 익신룡 (The Winged Dragon of Ra - 스마트카드)',
    2,
    0,
    0,
    'ACTIVE',
    '{
      "category": "TCG",
      "game": "Yu-Gi-Oh! OCG/TCG",
      "brand": "Yu-Gi-Oh! OCG",
      "model": "라의 익신룡 (스마트카드 에디션)",
      "cardName": "라의 익신룡",
      "cardNameEn": "The Winged Dragon of Ra",
      "passcode": "10000010",
      "attribute": "신(DIVINE)",
      "type": "환신야수족 / 효과",
      "level": 10,
      "atk": "?",
      "def": "?",
      "rarity": "Prismatic Secret Rare",
      "edition": "1st Edition",
      "cardNumber": "PGB1-KR001",
      "serialNumber": "YGO-2026-SC-RA01",
      "issuer": "KONAMI",
      "imageUrl": "assets/king/10000010.jpg",
      "description": "이 카드는 특수 소환할 수 없다. 이 카드를 통상 소환할 경우, 3장을 릴리스하고 일반 소환해야 한다."
    }'::jsonb
  ),
  -- 2) 라의 익신룡-불사조 (스마트카드용)
  (
    '10000090000000000000000000000002',
    '라의 익신룡-불사조 (Immortal Phoenix - 스마트카드)',
    2,
    0,
    0,
    'ACTIVE',
    '{
      "category": "TCG",
      "game": "Yu-Gi-Oh! OCG/TCG",
      "brand": "Yu-Gi-Oh! OCG",
      "model": "라의 익신룡-불사조 (스마트카드 에디션)",
      "cardName": "라의 익신룡-불사조",
      "cardNameEn": "The Winged Dragon of Ra - Immortal Phoenix",
      "passcode": "10000090",
      "attribute": "신(DIVINE)",
      "type": "환신야수족 / 특수 소환 / 효과",
      "level": 10,
      "atk": "4000",
      "def": "4000",
      "rarity": "Secret Rare",
      "edition": "1st Edition",
      "cardNumber": "DP24-KR002",
      "serialNumber": "YGO-2026-SC-PH02",
      "issuer": "KONAMI",
      "imageUrl": "assets/king/10000090.jpg",
      "description": "이 카드는 통상 소환할 수 없으며, 이 카드의 효과로만 특수 소환할 수 있다."
    }'::jsonb
  ),
  -- 3) 헬포에머 (스마트카드용)
  (
    '82951145000000000000000000000003',
    '헬포에머 (Helpoemer - 스마트카드)',
    2,
    0,
    0,
    'ACTIVE',
    '{
      "category": "TCG",
      "game": "Yu-Gi-Oh! OCG/TCG",
      "brand": "Yu-Gi-Oh! OCG",
      "model": "헬포에머 (스마트카드 에디션)",
      "cardName": "헬포에머",
      "cardNameEn": "Helpoemer - Chanter of the Sun God",
      "passcode": "82951145",
      "attribute": "어둠(DARK)",
      "type": "악마족 / 효과",
      "level": 5,
      "atk": "2000",
      "def": "1400",
      "rarity": "Ultra Rare",
      "edition": "1st Edition",
      "cardNumber": "DP24-KR003",
      "serialNumber": "YGO-2026-SC-HP03",
      "issuer": "KONAMI",
      "imageUrl": "assets/king/82951145.jpg",
      "description": "이 카드가 전투에 의해 파괴되어 묘지로 보내졌을 때 발동한다."
    }'::jsonb
  ),
  -- 4) 처형인-마큐라 (스마트카드용)
  (
    '18446859000000000000000000000004',
    '처형인-마큐라 (Makyura - 스마트카드)',
    2,
    0,
    0,
    'ACTIVE',
    '{
      "category": "TCG",
      "game": "Yu-Gi-Oh! OCG/TCG",
      "brand": "Yu-Gi-Oh! OCG",
      "model": "처형인-마큐라 (스마트카드 에디션)",
      "cardName": "처형인-마큐라",
      "cardNameEn": "Makyura the Destructor of the Sun God",
      "passcode": "18446859",
      "attribute": "어둠(DARK)",
      "type": "전사족 / 효과",
      "level": 4,
      "atk": "1600",
      "def": "1200",
      "rarity": "Super Rare",
      "edition": "1st Edition",
      "cardNumber": "DP24-KR004",
      "serialNumber": "YGO-2026-SC-MK04",
      "issuer": "KONAMI",
      "imageUrl": "assets/king/18446859.jpg",
      "description": "이 카드명의 효과는 1턴에 1번밖에 사용할 수 없다."
    }'::jsonb
  ),
  -- 5) 길 가스 (스마트카드용)
  (
    '45430558000000000000000000000005',
    '길 가스 (Gil Garth - 스마트카드)',
    2,
    0,
    0,
    'ACTIVE',
    '{
      "category": "TCG",
      "game": "Yu-Gi-Oh! OCG/TCG",
      "brand": "Yu-Gi-Oh! OCG",
      "model": "길 가스 (스마트카드 에디션)",
      "cardName": "길 가스",
      "cardNameEn": "Gil Garth - Exterminator of the Sun God",
      "passcode": "45430558",
      "attribute": "어둠(DARK)",
      "type": "악마족 / 일반",
      "level": 4,
      "atk": "1800",
      "def": "1200",
      "rarity": "Super Rare",
      "edition": "1st Edition",
      "cardNumber": "DP24-KR005",
      "serialNumber": "YGO-2026-SC-GG05",
      "issuer": "KONAMI",
      "imageUrl": "assets/king/45430558.jpg",
      "description": "수많은 악행을 일삼는 데 전력을 다하는 강철의 거인."
    }'::jsonb
  )
ON CONFLICT (uid) DO UPDATE
SET tag_name = EXCLUDED.tag_name,
    key_index = EXCLUDED.key_index,
    status = EXCLUDED.status,
    product_info = EXCLUDED.product_info,
    updated_at = NOW();
