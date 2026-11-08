# 카드 관리자 페이지 개발 계획

## 목표

등록된 카드(nfc_tags)를 관리자만 조회하고 수정할 수 있는 웹 페이지를 만든다.
관리자는 로그인 후 카드 정보 수정, 상태 변경, 카운터 리셋, 인증 기록 조회를 할 수 있어야 한다.

## 현재 상태

| 항목 | 현재 | 문제 |
|---|---|---|
| 카운터 리셋 | `/auth?action=reset` | 인증이 없다. 누구나 모든 카드의 카운터를 0으로 되돌리고 스캔 로그를 지울 수 있다 |
| 카드 목록 | `/auth?action=status` | 인증이 없다. 모든 카드의 UID와 카운터가 공개된다 |
| 관리 화면 | `reset.html` (공개) | 위 두 엔드포인트를 호출한다 |
| 카드 정보 수정 | SQL 직접 실행 | 화면이 없고, 누가 무엇을 바꿨는지 기록이 없다 |
| 테이블 권한 | 세 테이블 모두 RLS 사용, `service_role` 전용 정책 | 브라우저에서 직접 접근할 수 없다. 이 상태는 유지한다 |

## 구조

```
admin.html (Vercel)
  │  로그인: Supabase Auth (이메일 + 비밀번호)
  │  요청마다 Authorization: Bearer <사용자 JWT>
  ▼
Edge Function: admin  (verify_jwt = true)
  │  1. JWT 검증 → 2. app_metadata.role === 'admin' 확인
  │  3. 입력 검증 → 4. service_role로 DB 작업 → 5. 감사 로그 기록
  ▼
nfc_tags / nfc_scan_logs / admin_audit_logs (RLS 그대로, service_role 전용)
```

이 구조를 고른 이유는 다음과 같다.

- 테이블에 브라우저용 RLS 정책을 추가하지 않는다. 정책을 잘못 쓰면 키 테이블(`nfc_keys`)까지 노출될 수 있는데, 이 구조에서는 그 위험이 없다.
- 권한 확인, 입력 검증, 감사 기록이 함수 한 곳에 모인다.
- 관리자는 1명이므로 역할 테이블 없이 `app_metadata.role`만 쓴다. `app_metadata`는 사용자가 스스로 바꿀 수 없고 service role만 쓸 수 있다.

## 기능 범위

### 1차 (이번 계획)

| 기능 | 내용 |
|---|---|
| 로그인 | 이메일과 비밀번호. 회원가입은 막고 관리자 계정 1개를 대시보드에서 만든다 |
| 카드 목록 | UID, 카드명, 상태, 카운터, 스캔 횟수, 최초 인증일. 검색과 상태 필터 |
| 카드 상세 | 등록 정보, 최근 스캔 기록 50건(결과 코드, 카운터, 시각) |
| 정보 수정 | `tag_name`, `status`(ACTIVE, SUSPENDED, REVOKED), `product_info`는 항목별 입력란으로 편집하고 항목을 추가하거나 삭제할 수 있다 |
| 카운터 리셋 | 모든 카드에 허용. 카드 한 장 단위이며 UID 끝 6자리를 입력해야 실행된다 |
| 카운터 지정 | 카운터를 특정 값으로 맞춘다 (아래 카운터 정책 참고) |
| 감사 로그 | 누가, 언제, 어떤 카드의 무엇을 바꿨는지, 바꾸기 전과 후의 값 |

### 1차에서 제외

- `uid`와 `key_index` 수정. 바꾸면 이미 발급된 카드가 인증되지 않으므로 읽기 전용으로 둔다.
- 새 카드 등록과 키 관리. 키 원문을 다루므로 별도 계획으로 분리한다.
- 카드 이미지 업로드. Supabase Storage가 필요하므로 2차로 미룬다.

## 카운터 정책

카운터를 0으로 리셋하면 이미 사용된 URL 중 카운터가 1 이상인 것이 모두 다시 정품으로 통과한다.
리셋은 복제 방지를 그 순간 해제하는 작업이므로 다음과 같이 다룬다.

- 모든 카드를 리셋할 수 있다. 다만 카드 한 장 단위로만 실행하고, 전체 리셋은 만들지 않는다.
- 리셋해도 스캔 로그는 지우지 않는다. 대신 `ADMIN_RESET` 기록을 남긴다.
- 리셋 확인 창에 "이미 사용된 링크가 다시 정품으로 통과합니다"를 표시한다.
- 복제 방지를 유지하면서 카운터를 맞춰야 할 때를 위해 **카운터 지정**도 둔다. 현재 카운터보다 작은 값은 허용하지 않는다. 낮추려면 리셋을 쓴다.

## API

모든 요청에는 관리자 JWT가 필요하다. 실패하면 401(로그인 안 됨), 403(관리자 아님)을 반환한다.

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/admin/tags` | 카드 목록 |
| GET | `/admin/tags/:uid` | 카드 상세와 최근 스캔 기록 |
| PATCH | `/admin/tags/:uid` | `tag_name`, `status`, `product_info` 수정 |
| POST | `/admin/tags/:uid/reset` | 카운터 0, 스캔 횟수 0, 최초 인증일 초기화 |
| POST | `/admin/tags/:uid/counter` | 카운터를 지정한 값으로 설정 |
| GET | `/admin/audit` | 감사 로그 조회 |

`product_info` 입력 검증 규칙은 다음과 같다.

- 객체만 허용하고 크기는 8KB 이하로 제한한다.
- `imageUrl`은 `assets/king/` 아래 파일이나 `https:` 주소만 허용한다.
- 문자열에 들어간 HTML은 저장은 하되, 화면에서는 항상 텍스트로만 표시한다.

## 데이터 변경

```sql
create table public.admin_audit_logs (
  id bigserial primary key,
  actor_id uuid not null,
  actor_email text not null,
  action text not null,          -- 'UPDATE_TAG', 'RESET_COUNTER', 'SET_COUNTER'
  uid text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
create policy "service role only" on public.admin_audit_logs
  for all to service_role using (true) with check (true);
```

`nfc_scan_logs.result_code`에 `ADMIN_RESET`, `ADMIN_SET_COUNTER` 값을 추가로 쓴다. 이 컬럼은 문자열이라 스키마 변경은 필요 없다.

## 단계별 작업

각 단계는 끝에 적힌 확인을 통과해야 다음 단계로 넘어간다.

### 0단계. 공개 관리 기능 제거
- `auth` 함수에서 `action=reset`과 `action=status` 처리를 삭제한다.
- `reset.html`과 README, SOLUTION_OVERVIEW의 리셋 링크를 지운다. `scripts/reset.mjs`는 3단계에서 새 API로 바꾼다.
- 검증 DB 함수 `verify_and_log_nfc_scan`은 `SECURITY DEFINER`인데 anon과 authenticated에게 실행 권한이 있다. anon 키로 직접 호출해 카운터를 조작할 수 있으므로 service_role 외의 실행 권한을 회수한다. 관리자 페이지가 anon 키를 공개하므로 반드시 함께 처리한다.
- **확인.** `/auth?action=reset`과 `/auth?action=status`가 일반 인증 요청처럼 `BAD_REQUEST`를 반환하고, 어떤 카드의 카운터도 바뀌지 않는다.
- 이 단계는 관리자 페이지와 별개로 바로 배포할 수 있다. 다만 배포하면 3단계 전까지 화면에서 리셋할 방법이 없어지므로, 그동안은 SQL로 리셋한다.

### 1단계. 인증 기반
- Supabase Auth에서 이메일과 비밀번호 로그인을 켜고 회원가입을 끈다.
- 관리자 계정 1개를 만들고 `app_metadata.role = 'admin'`을 지정한다. 비밀번호는 16자 이상으로 하고, Auth 설정의 비밀번호 최소 길이도 맞춘다.
- `admin_audit_logs` 마이그레이션을 적용한다.
- **확인.** 관리자 계정으로 로그인해 받은 JWT의 `app_metadata.role`이 `admin`이다.

### 2단계. admin 함수
- `supabase/functions/admin/index.ts`를 만든다. `config.toml`에 `verify_jwt = true`를 둔다.
- 권한 확인을 하나의 함수로 모으고 모든 경로가 이를 거치게 한다.
- 수정, 리셋, 카운터 지정은 DB 함수 하나로 묶어 변경과 감사 기록이 함께 커밋되게 한다.
- **확인.** 아래 테스트가 모두 통과한다.
  - 토큰 없음 → 401, 만료되거나 변조된 토큰 → 401, 관리자 역할이 없는 사용자 → 403, 관리자 → 200
  - 허용되지 않은 필드나 8KB 초과 `product_info` → 400
  - 리셋 후 해당 카드만 카운터가 0이고, 다른 카드는 그대로이며, 감사 로그 1건이 생긴다
  - 현재 카운터보다 작은 카운터 지정 → 400

### 3단계. admin.html
- 로그인, 카드 목록, 상세, 수정, 리셋 화면을 만든다.
- supabase-js는 CDN 대신 `assets/`에 버전을 고정해 둔다.
- 모든 서버 값은 `textContent`로만 넣는다.
- 리셋은 UID 끝 6자리를 입력해야 버튼이 활성화된다.
- 관리자가 화면에서 비밀번호를 바꿀 수 있게 한다. 로그인 세션은 `sessionStorage`에 두어 탭을 닫으면 끝난다.
- `vercel.json`에 `/admin` 경로용 Content-Security-Policy를 추가하고 `noindex`를 둔다.
- `scripts/reset.mjs`를 새 API와 관리자 토큰을 쓰도록 바꾼다.
- **확인.** 브라우저 자동화로 로그인부터 수정과 리셋까지 진행하고, 결과를 DB 조회로 대조한다. 로그아웃 후 API를 호출하면 401이다.

### 4단계. 배포와 운영 확인
- `admin` 함수와 페이지를 배포한다.
- 데모 카드 한 장으로 정품 탭 → 재확인 → 관리자 리셋 → 정품 탭 순서를 실제로 확인한다.
- **확인.** 감사 로그에 리셋 기록이 남고, 일반 인증(`/auth`, `/nfc`) 응답 형식과 결과가 배포 전과 같다.

## 확정된 결정

| 항목 | 결정 |
|---|---|
| 로그인 방식 | 이메일과 비밀번호 (2단계 인증 없음) |
| 관리자 수 | 1명, `app_metadata.role = 'admin'` |
| 리셋 허용 대상 | 모든 카드 |
| 리셋 시 스캔 로그 | 지우지 않고 `ADMIN_RESET` 기록을 남긴다 (기본값, 변경 가능) |
| 0단계 배포 시점 | 관리자 페이지보다 먼저 공개 리셋을 막는다 (기본값, 변경 가능) |

## 위험

- 2단계 인증이 없으므로 관리자 비밀번호 하나가 유출되면 모든 카드의 상태와 카운터를 바꿀 수 있다. 긴 비밀번호와 감사 로그로 위험을 줄이고, 필요해지면 Supabase Auth의 TOTP를 켜고 함수에 aal2 확인을 추가한다.
- 모든 카드를 리셋할 수 있으므로 운영 카드도 리셋 순간 이미 사용된 링크가 다시 통과한다. 감사 로그로 누가 언제 리셋했는지 추적한다.
- 함수가 `service_role` 키를 쓰므로, 권한 확인을 거치지 않는 경로가 하나라도 있으면 전체가 노출된다. 2단계의 권한 테스트를 모든 경로에 대해 실행한다.
- 함수 배포에는 Supabase CLI나 대시보드 접근이 필요하다. 이 작업 환경에는 CLI가 없다.
