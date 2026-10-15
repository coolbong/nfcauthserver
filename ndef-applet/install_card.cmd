@ECHO OFF
SETLOCAL ENABLEEXTENSIONS
CHCP 65001 > nul

REM 1. 리더기 인자 확인 (없으면 기본 5422CL 지정)
SET READER=%1
IF "%READER%"=="" (
    SET READER="HID Global OMNIKEY 5422CL Smartcard Reader 0"
)

ECHO =============================================================================
ECHO   NFC 스마트카드 NDEF Applet 카드 설치 도구
ECHO =============================================================================
ECHO 대상 리더기: %READER%
ECHO.

REM 2. CAP 파일 존재 확인
IF NOT EXIST "%~dp0build\bin\ndef-applet.cap" (
    ECHO [안내] CAP 파일이 존재하지 않아 자동 빌드를 먼저 진행합니다...
    PUSHD "%~dp0build"
    CALL build.cmd
    POPD
)

IF NOT EXIST "%~dp0build\bin\ndef-applet.cap" (
    ECHO [오류] 빌드에 실패하였거나 CAP 파일이 생성되지 않았습니다.
    EXIT /B 1
)

REM 3. 기존 설치된 NDEF 패키지 제거 시도 (충돌 방지)
ECHO [1/2] 기존 NDEF Applet 제거 시도 (미설치 상태인 경우 무시됨)...
"%~dp0tools\gp.exe" -r %READER% -uninstall "%~dp0build\bin\ndef-applet.cap" 2>nul

REM 4. 새 애플릿 설치
ECHO [2/2] 신규 NDEF Applet 카드에 설치 중...
"%~dp0tools\gp.exe" -r %READER% -install "%~dp0build\bin\ndef-applet.cap"

IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO [오류] 설치에 실패했습니다.
    ECHO 1. 카드가 올바르게 리더기에 접촉/거치되어 있는지 확인하세요.
    ECHO 2. gp.exe --reader 명령어로 정확한 리더기 명칭을 확인하세요.
    EXIT /B 1
)

ECHO.
ECHO =============================================================================
ECHO 🎉 스마트카드에 NDEF Applet 설치가 성공적으로 완료되었습니다!
ECHO =============================================================================
ECHO.
ECHO 다음 단계 안내:
ECHO   1. 새 UID를 사용했다면 DB에 카드를 등록하세요:
ECHO      node scripts/register_tag.js <UID> [제품명]
ECHO.
ECHO   2. 기존 카드를 재설치한 것이라면 카운터를 0으로 초기화하세요:
ECHO      node scripts/register_tag.js <UID> --reset
ECHO =============================================================================
