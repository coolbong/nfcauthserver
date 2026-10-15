# NFC 스마트카드 신규 발급 및 설치 가이드 (SmartCard Issuance Guide)

본 문서는 **새로운 JavaCard 스마트카드에 NFC 보안 인증 NDEF Applet을 빌드·설치하고, Supabase 인증 서버 DB에 카드를 등록**하는 전체 절차를 안내합니다.

---

## 📌 목차
1. [시스템 구조 및 동작 원리](#1-시스템-구조-및-동작-원리)
2. [사전 준비물](#2-사전-준비물)
3. [🚀 초간단 빠른 가이드 (기본 테스트 카드를 다시 굽는 경우)](#3--초간단-빠른-가이드)
4. [🛠️ 신규 고유 카드 발급 상세 절차 (새로운 UID로 발급하는 경우)](#4-️-신규-고유-카드-발급-상세-절차)
   - [Step 1: Applet 코드에서 UID 설정](#step-1-applet-코드에서-uid-설정)
   - [Step 2: JavaCard CAP 파일 빌드](#step-2-javacard-cap-파일-빌드)
   - [Step 3: 스마트카드에 Applet 설치](#step-3-스마트카드에-applet-설치)
   - [Step 4: Supabase 인증 서버 DB에 카드 등록](#step-4-supabase-인증-서버-db에-카드-등록)
   - [Step 5: 실물 카드 태깅 검증](#step-5-실물-카드-태깅-검증)
5. [❓ 자주 발생하는 문제 및 해결 (Troubleshooting)](#5--자주-발생하는-문제-및-해결-troubleshooting)
6. [📁 주요 도구 및 파일 위치](#6--주요-도구-및-파일-위치)

---

## 1. 시스템 구조 및 동작 원리

이 시스템은 스마트폰의 기본 카메라/NFC 리더기로 카드를 태깅했을 때, 별도의 전용 앱 설치 없이 웹 브라우저에서 실시간으로 정품 여부를 검증합니다.

```
[스마트카드 (JavaCard 3.0.4+)]
  │
  ├─ 1. NFC 태깅 (Read Binary APDU 수신)
  ├─ 2. 내부 카운터 자동 1 증가 (EEPROM 영구 보존)
  ├─ 3. AES-128 CMAC 실시간 암호화 서명 계산 (UID + Counter + Key)
  └─ 4. 동적 NDEF URL 생성 및 스마트폰으로 전송
        URL 예시: https://coolbong.github.io/nfcauthserver/?uid=04DE5F1EACC040&cnt=000001&mac=EA2BEDD5DDB4F744&kid=1
  │
  ▼
[스마트폰 웹 브라우저 (GitHub Pages / index.html)]
  │
  └─ Supabase 실서버 엔드포인트(/v1/nfc)로 실시간 서명 검증 요청
  │
  ▼
[Supabase 인증 서버 & DB]
  ├─ 1. KEK로 암호화 보관된 마스터 키 일시 복호화 (Envelope Encryption)
  ├─ 2. 암호학적 CMAC 서명(MAC) 일치 여부 검증
  ├─ 3. 이전 카운터(last_counter)보다 큰지 원자적 검증 (복제/재전송 공격 방어)
  └─ 4. 검증 결과 반환 ➔ 스마트폰 화면에 "정품 인증 완료" 및 "디지털 정품 보증서" 표시
```

---

## 2. 사전 준비물

1. **PC/SC 호환 스마트카드 리더기**:
   - 예: `HID Global OMNIKEY 5422 / 5422CL` (접촉/비접촉 듀얼 리더기) 또는 기타 PC/SC 리더기
2. **JavaCard 스마트카드 공카드**:
   - JavaCard 3.0.4 이상 지원 공카드 (JCOP 3/4 등)
3. **PC 개발 환경**:
   - **JDK 11 이상** (JDK 17 권장)
   - **Node.js** (v18 이상 권장, DB 등록 CLI 실행용)
   - 본 저장소의 `ndef-applet/tools/` 폴더 내 도구:
     - `ant`: JavaCard 컴파일 빌드 도구
     - `gp.exe` / `gp.jar`: GlobalPlatform 스마트카드 설치 도구

---

## 3. 🚀 초간단 빠른 가이드

> **기본 테스트 카드(`UID: 04DE5F1EACC040`)로 카드를 새로 굽거나 초기화할 때**는 아래 2단계 명령어로 즉시 완료됩니다.

### 1) 리더기에 카드를 올리고 빌드 & 설치 실행
터미널(CMD 또는 PowerShell)에서 프로젝트 루트로 이동 후 실행:
```cmd
cd ndef-applet
build_and_install.cmd
```
*(기본적으로 `HID Global OMNIKEY 5422CL Smartcard Reader 0` 리더기를 자동으로 사용합니다)*

### 2) 서버 DB 카운터 0으로 초기화
프로젝트 루트 폴더에서 실행:
```bash
node scripts/register_tag.js 04de5f1eacc040 --reset
```

이제 스마트폰으로 카드를 태깅하시면 **정품 인증 완료** 및 **디지털 정품 보증서**가 정상 작동합니다!

---

## 4. 🛠️ 신규 고유 카드 발급 상세 절차

새로운 고유 식별자(UID)를 부여하여 다른 카드를 발급하는 표준 절차입니다.

### Step 1: Applet 코드에서 UID 설정

새 카드의 고유 UID(7바이트)를 지정합니다.

* **수정 파일**: `ndef-applet/src/main/java/org/openjavacard/ndef/advanced/NdefApplet.java`
* **수정 위치**: 약 135번째 줄

```java
    /**
     * NFC Authentication UID (7 bytes, registered in database: 04de5f1eacc040)
     */
    private static final byte[] CARD_UID = {
        (byte)0x04, (byte)0xDE, (byte)0x5F, (byte)0x1E, (byte)0xAC, (byte)0xC0, (byte)0x40
    };
```
👉 `CARD_UID` 배열의 7바이트 값을 새로 부여할 UID로 변경합니다 (예: `0x04, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66`).

> [!TIP]
> **마스터 키(Master Key) 변경이 필요한 경우**:
> 약 211번째 줄 `MASTER_KEY_BYTES`를 변경할 수 있습니다. (기본값은 16바이트 0x00으로 DB Key #1과 동기화되어 있습니다).

---

### Step 2: JavaCard CAP 파일 빌드

지정한 Java 코드를 JavaCard 바이트코드(`.cap`)로 컴파일합니다.

터미널에서 아래 명령을 실행합니다:
```cmd
cd ndef-applet\build
build.cmd
```

**빌드 결과 확인**:
* `ndef-applet\build\bin\ndef-applet.cap` 파일이 최신 시간으로 생성되었는지 확인합니다.

---

### Step 3: 스마트카드에 Applet 설치

리더기에 카드를 올려놓은 후 GlobalPlatformPro를 통해 설치합니다.

#### 1) 연결된 리더기 이름 확인
리더기가 여러 개이거나 이름이 확실하지 않을 때:
```cmd
ndef-applet\tools\gp.exe --reader
```
출력 예시:
```text
Available readers:
- HID Global OMNIKEY 5422 Smartcard Reader 0
- HID Global OMNIKEY 5422CL Smartcard Reader 0
```
*(보통 비접촉식 카드는 `5422CL` 또는 `Contactless`가 붙은 리더기를 사용합니다)*

#### 2) 원클릭 설치 스크립트 실행
```cmd
cd ndef-applet
install_card.cmd
```
*(다른 리더기를 지정하려면 인자로 리더기 이름을 넘겨줍니다: `install_card.cmd "리더기이름"`)*

#### 3) 수동 설치 명령어 (직접 입력할 경우)
```cmd
# 1. 기존 설치된 이전 버전 제거 (선택 사항)
ndef-applet\tools\gp.exe -r "HID Global OMNIKEY 5422CL Smartcard Reader 0" -uninstall ndef-applet\build\bin\ndef-applet.cap

# 2. 신규 CAP 파일 설치
ndef-applet\tools\gp.exe -r "HID Global OMNIKEY 5422CL Smartcard Reader 0" -install ndef-applet\build\bin\ndef-applet.cap
```

설치 완료 시 화면에 `APP: D2760000850101 (SELECTABLE)` 및 성공 메시지가 표시됩니다.

---

### Step 4: Supabase 인증 서버 DB에 카드 등록

새로 발급한 카드가 서버에서 정품으로 인정받으려면 Supabase 데이터베이스의 `nfc_tags` 테이블에 카드의 UID와 정보가 등록되어 있어야 합니다.

프로젝트 루트 디렉토리에서 제공된 CLI 스크립트를 실행합니다:

```bash
# 기본 사용법:
# node scripts/register_tag.js <UID 14자리> [태그명] [모델명] [시리얼번호]

node scripts/register_tag.js 04112233445566 "NFC 정품 인증 카드 #2" "NFC Secure SmartCard" "SN-AUTH-0002"
```

**스크립트 자동 처리 내역**:
1. `nfc_tags` 테이블에 신규 카드 레코드 등록 (Key Index: 1)
2. 보안 카운터(`last_counter`) 및 총 스캔 수(`total_scans`)를 `0`으로 설정
3. 디지털 정품 보증서 메타데이터(`product_info`) 자동 생성
4. 이전 테스트 스캔 기록 초기화

---

### Step 5: 실물 카드 태깅 검증

#### 방법 A: 스마트폰으로 태깅
스마트폰(iPhone 또는 Android)의 NFC 안테나 위치(카메라 옆 또는 중앙)에 카드를 접촉합니다.
1. 상단에 웹 링크 알림 팝업 발생
2. 탭하면 브라우저 열림 (`https://coolbong.github.io/nfcauthserver/?uid=...&cnt=...&mac=...`)
3. **"정품 인증 완료"** 화면 확인
4. **[제품 상세 및 디지털 정품 보증서 확인]** 버튼을 탭하여 골드 테두리의 보증서 팝업 확인

#### 방법 B: PC에서 리더기 APDU로 검증
PC 리더기에서 바로 테스트할 수 있는 Java 테스트 러너 실행:
```cmd
java -cp "ndef-applet\target\test-classes;ndef-applet\target\classes" ReadPhysicalCardTest
```

---

## 5. ❓ 자주 발생하는 문제 및 해결 (Troubleshooting)

### Q1. 카드를 태깅했더니 "복제 의심 경고 (재전송 감지)"가 뜹니다 (`COUNTER_REPLAY`).
* **원인**: 실물 카드의 현재 카운터 값보다 서버 DB의 `last_counter` 값이 같거나 더 큽니다. (카드를 재설치했거나 이전 테스트 기록이 남아있는 경우).
* **해결**: 아래 명령어로 DB의 카운터를 즉시 0으로 초기화하세요:
  ```bash
  node scripts/register_tag.js <UID> --reset
  ```

---

### Q2. `gp.exe` 실행 시 `Card not present` 또는 리더기 오류가 발생합니다.
* **원인 1**: 리더기 위에 카드가 제대로 밀착되지 않았습니다.
* **원인 2**: 접촉식 슬롯과 비접촉식 슬롯의 이름이 다릅니다.
  * OMNIKEY 5422의 경우:
    * 카드를 슬롯에 꽂았다면: `HID Global OMNIKEY 5422 Smartcard Reader 0`
    * 카드를 위에 올려두었다면(RF): `HID Global OMNIKEY 5422CL Smartcard Reader 0`
* **해결**: `ndef-applet\tools\gp.exe --reader` 로 리더기 목록을 확인하고 해당 리더기 명칭을 인자로 전달하세요.

---

### Q3. `gp.exe -install` 실행 시 `6A80` 또는 `6985` 오류가 발생합니다.
* **원인**: 카드에 동일한 AID(`D27600008501`)를 가진 기존 패키지가 이미 로드되어 있어 충돌이 발생한 경우입니다.
* **해결**: 기존 패키지를 강제 삭제한 후 다시 설치합니다:
  ```cmd
  ndef-applet\tools\gp.exe -r "HID Global OMNIKEY 5422CL Smartcard Reader 0" -uninstall ndef-applet\build\bin\ndef-applet.cap
  # 또는 패키지 AID 직접 삭제
  ndef-applet\tools\gp.exe -r "HID Global OMNIKEY 5422CL Smartcard Reader 0" -delete D27600008501 -f
  ```

---

### Q4. JavaCard `build.cmd` 실행 시 컴파일 에러가 발생합니다.
* **해결**: `JAVA_HOME` 환경변수가 JDK 11 또는 17 이상으로 설정되어 있는지 확인하세요:
  ```cmd
  java -version
  javac -version
  ```

---

## 6. 📁 주요 도구 및 파일 위치

| 파일 / 폴더 | 설명 |
| :--- | :--- |
| [`ndef-applet/src/.../NdefApplet.java`](file:///D:/dev/orca/nfcauthserver/ndef-applet/src/main/java/org/openjavacard/ndef/advanced/NdefApplet.java) | NDEF JavaCard 스마트카드 메인 소스코드 (UID, 카운터, CMAC) |
| [`ndef-applet/build/build.cmd`](file:///D:/dev/orca/nfcauthserver/ndef-applet/build/build.cmd) | JavaCard 3.0.4 Target CAP 파일 빌드 스크립트 |
| [`ndef-applet/install_card.cmd`](file:///D:/dev/orca/nfcauthserver/ndef-applet/install_card.cmd) | 리더기에 올려진 실물 카드에 CAP 파일 설치 스크립트 |
| [`ndef-applet/build_and_install.cmd`](file:///D:/dev/orca/nfcauthserver/ndef-applet/build_and_install.cmd) | 빌드 및 카드 설치를 한 번에 실행하는 통합 스크립트 |
| [`ndef-applet/tools/gp.exe`](file:///D:/dev/orca/nfcauthserver/ndef-applet/tools/gp.exe) | GlobalPlatformPro 스마트카드 관리 CLI 도구 |
| [`scripts/register_tag.js`](file:///D:/dev/orca/nfcauthserver/scripts/register_tag.js) | 새 카드를 Supabase DB에 등록하거나 카운터를 초기화하는 Node.js CLI 도구 |
| [`index.html`](file:///D:/dev/orca/nfcauthserver/index.html) | 스마트폰 태깅 시 열리는 실시간 정품 인증 및 보증서 웹앱 |
| [`certificate.html`](file:///D:/dev/orca/nfcauthserver/certificate.html) | 독립형 디지털 정품 보증서 페이지 |
| [`docs/SMARTCARD_ISSUANCE_GUIDE.md`](file:///D:/dev/orca/nfcauthserver/docs/SMARTCARD_ISSUANCE_GUIDE.md) | 본 스마트카드 발급 가이드 문서 |
