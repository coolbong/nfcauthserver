# NTAG 424 DNA NFC 보안 인증 서버 (Orca NFC Auth)

NXP **NTAG 424 DNA** 태그의 **SDM / SUN (Secure Unique NFC Message)** 프로토콜을 기반으로 스마트폰 태깅 데이터(`uid`, `cnt`, `mac`, `kid`)를 실시간 검증하고 모바일 정품 인증 화면을 제공하는 **Supabase 백엔드 시스템**입니다.

---

## 🌟 주요 기능 및 보안 특징

1. **복제 및 재전송 공격 차단 (Anti-Replay Attack)**:
   - 태그를 탭할 때마다 증가하는 보안 카운터(`cnt`)를 PostgreSQL Stored Procedure의 `FOR UPDATE` Row Lock으로 원자적(Atomic) 검증.
   - 브라우저 새로고침이나 URL 복사 재접속 시 즉시 **"복제 의심 경고"** 차단.
2. **DB 키 암호화 (Envelope Encryption - AES-256-GCM)**:
   - 데이터베이스(`public.nfc_keys`)가 통째로 탈취/덤프되더라도 공격자가 평문 AES 키를 절대 알아볼 수 없도록 암호화 보관.
   - 마스터 암호화 키(`NFC_KEK`)는 오직 Supabase Edge Function 격리 환경에서만 관리.
3. **다중 키 풀 및 키 인덱스 (`kid`) 지원**:
   - URL의 `&kid=...` 파라미터 또는 태그별 지정 키를 통해 여러 개의 키를 손쉽게 관리 및 교체(Key Rotation) 가능.
4. **모바일 반응형 웹 UI 내장**:
   - 별도 앱 설치 없이 스마트폰 기본 브라우저에서 **정품 인증 완료**, **복제 의심 경고**, **위조품 경고** 화면을 렌더링.
5. **NXP AN12196 공식 규격 100% 호환**:
   - AES-128-CMAC, SV2 세션키 유도, 8바이트 Truncated MAC(`MACt`) 표준 준수.

---

## 📁 프로젝트 구조

```text
nfcauthserver/
├── docs/
│   ├── AN12196.pdf                         # NXP 공식 기술 문서
│   ├── NFC_AUTH_SERVER_PLAN.md             # 상세 개발 계획서 및 아키텍처
│   └── SUPABASE_SETUP_GUIDE.md             # Supabase 연동 및 배포 매뉴얼
├── scripts/
│   ├── manage_keys.js                      # NTAG 키 암호화 및 DB SQL 생성 CLI
│   ├── preview.js                          # 모바일 브라우저 화면 로컬 프리뷰 서버
│   ├── test_live_server.js                 # 배포된 Supabase 실서버 E2E 테스트
│   ├── deploy_db.js                        # DB 스키마 자동 배포 스크립트
│   └── set_secrets.js                      # Supabase Secrets 등록 스크립트
├── supabase/
│   ├── config.toml                         # Supabase 설정 (JWT 비활성화)
│   ├── migrations/
│   │   └── 20261014000000_create_nfc_auth_schema.sql  # DB 스키마, RLS, 함수
│   └── functions/
│       └── nfc/                            # Edge Function 엔드포인트 (/v1/nfc)
│           ├── index.ts                    # 라우팅 및 검증 파이프라인
│           ├── crypto.ts                   # AES-CMAC, SV2, 키 복호화 모듈
│           └── views.ts                    # 모바일 반응형 HTML UI 템플릿
└── tests/
    ├── crypto.js                           # 단위 테스트용 암호화 유틸
    └── test_runner.js                      # AN12196 공식 테스트 벡터 검증 러너
```

---

## 🚀 빠른 시작 (Quick Start)

### 1. 단위 테스트 실행 (테스트 벡터 검증)
```bash
node tests/test_runner.js
```

### 2. 새 AES 키 암호화 및 DB 등록용 SQL 생성
```bash
node scripts/manage_keys.js encrypt --index 1 --name "기본 키" --key 00000000000000000000000000000000
```

### 3. 로컬 프리뷰 서버 실행 (모바일 화면 확인)
```bash
node scripts/preview.js
# 브라우저 접속: http://localhost:3000/v1/nfc?uid=04de5f1eacc040&cnt=440000&mac=77FE3ED1FAEE038E
```

---

## 📄 라이선스
MIT License
