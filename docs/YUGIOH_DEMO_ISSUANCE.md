# 유희왕 카드 데모 발급 데이터

NFC 개발자에게 전달하는 유희왕 카드 5종의 스마트카드 발급 데이터입니다.
카드마다 아래 UID와 키를 넣고, 탭할 때 아래 형식의 URL을 내보내도록 설정해 주세요.

## 공통 설정

| 항목 | 값 |
|---|---|
| 방식 | RFC 4226 HOTP (HMAC-SHA1), 6자리 |
| 키 (key index 2) | 20바이트 `0000000000000000000000000000000000000000` (데모용 공개 키) |
| UID | 16바이트, 카드별 값 (아래 표) |
| 카운터 | 3바이트 Big-Endian, 첫 탭 값은 0 이상, 탭마다 1 증가 |
| URL 접두어 | `https://coolbong.github.io/nfcauthserver/yugioh.html?` |
| URL 쿼리 | BER-TLV 한 개, `DF61 10 <UID>` + `DF62 03 <OTP 6자리 Packed BCD>` + `DF63 03 <카운터>` |

예를 들어 카운터가 1이고 OTP가 `812658`이면 쿼리는 `DF6110<UID>DF6203812658DF6303000001`입니다.

## 카드별 UID

| # | 카드 | 패스코드 | 16바이트 UID | 이미지 |
|---|---|---|---|---|
| 1 | 라의 익신룡 | 10000010 | `10000010000000000000000000000001` | `assets/king/10000010.jpg` |
| 2 | 라의 익신룡-불사조 | 10000090 | `10000090000000000000000000000002` | `assets/king/10000090.jpg` |
| 3 | Helpoemer, Chanter of the Sun God | 82951145 | `82951145000000000000000000000003` | `assets/king/82951145.jpg` |
| 4 | Makyura, Destructor of the Sun God | 18446859 | `18446859000000000000000000000004` | `assets/king/18446859.jpg` |
| 5 | Gil Garth, Exterminator of the Sun God | 45430558 | `45430558000000000000000000000005` | `assets/king/45430558.jpg` |

## 검증용 OTP

키가 다섯 장 모두 같고 HOTP 계산에 UID가 들어가지 않으므로, 같은 카운터의 OTP는 카드와 관계없이 같습니다.

| 카운터 | DF63 값 | OTP (DF62 값) |
|---|---|---|
| 0 | `000000` | `328482` |
| 1 | `000001` | `812658` |
| 2 | `000002` | `073348` |
| 3 | `000003` | `887919` |
| 4 | `000004` | `320986` |

카드가 만든 URL을 아래 예시와 비교해 형식을 확인할 수 있습니다. 예시는 각 카드의 카운터 0 URL입니다.

1. 라의 익신룡
   `https://coolbong.github.io/nfcauthserver/yugioh.html?DF611010000010000000000000000000000001DF6203328482DF6303000000`
2. 라의 익신룡-불사조
   `https://coolbong.github.io/nfcauthserver/yugioh.html?DF611010000090000000000000000000000002DF6203328482DF6303000000`
3. Helpoemer, Chanter of the Sun God
   `https://coolbong.github.io/nfcauthserver/yugioh.html?DF611082951145000000000000000000000003DF6203328482DF6303000000`
4. Makyura, Destructor of the Sun God
   `https://coolbong.github.io/nfcauthserver/yugioh.html?DF611018446859000000000000000000000004DF6203328482DF6303000000`
5. Gil Garth, Exterminator of the Sun God
   `https://coolbong.github.io/nfcauthserver/yugioh.html?DF611045430558000000000000000000000005DF6203328482DF6303000000`

**주의.** 위 URL을 실제로 열면 운영 서버가 그 카운터를 사용한 것으로 기록합니다. 실물 카드의 첫 탭보다 먼저 열면 같은 카운터의 탭이 재사용으로 판정되니, 형식 비교에만 쓰고 열지 마세요.

## 발급 후 확인

1. 카드를 스마트폰에 탭하면 `정품으로 확인되었습니다`와 해당 카드 이미지가 나와야 합니다.
2. 같은 화면을 새로고침하면 `카드를 다시 탭해 주세요`로 바뀌어야 합니다.
3. 다시 탭하면 카운터가 1 늘어난 URL로 정품이 나와야 합니다.

## 데모 한계

- 키가 공개된 0x00 키이고 다섯 장이 같은 키를 쓰므로, 누구나 정품 URL을 만들 수 있습니다. 실제 서비스에는 카드별 비공개 키가 필요합니다.
- 카드 정보는 YGOPRODeck에서 확인한 값만 등록했습니다. 신규 카드 3종은 공식 한국어명을 확인하지 못해 영문명을 표시합니다.
- 화면의 발행처는 `NFC Authentication 데모`이며, 코나미 공식 인증이 아닙니다.

이 문서의 OTP와 URL은 `tests/crypto.js`의 `calculateHotp`로 마이그레이션 `supabase/migrations/20261108200000_yugioh_cards_master_data.sql`의 UID에서 계산했습니다.
