@ECHO OFF
SETLOCAL ENABLEEXTENSIONS
CHCP 65001 > nul

ECHO =============================================================================
ECHO   [1단계] JavaCard NDEF Applet CAP 빌드 시작
ECHO =============================================================================
PUSHD "%~dp0build"
CALL build.cmd
POPD

IF NOT EXIST "%~dp0build\bin\ndef-applet.cap" (
    ECHO.
    ECHO [오류] CAP 파일 빌드에 실패했습니다. 빌드 로그를 확인하세요.
    EXIT /B 1
)

ECHO.
ECHO =============================================================================
ECHO   [2단계] 카드에 애플릿 설치 진행
ECHO =============================================================================
CALL "%~dp0install_card.cmd" %*
