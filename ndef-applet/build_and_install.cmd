@ECHO OFF
SETLOCAL ENABLEEXTENSIONS

ECHO =============================================================================
ECHO   [Step 1/2] Compiling JavaCard NDEF Applet CAP
ECHO =============================================================================
PUSHD "%~dp0build"
CALL build.cmd
POPD

IF NOT EXIST "%~dp0build\bin\ndef-applet.cap" (
    ECHO.
    ECHO [ERROR] Failed to compile CAP file. Please check build error above.
    EXIT /B 1
)

ECHO.
ECHO =============================================================================
ECHO   [Step 2/2] Installing Applet to SmartCard
ECHO =============================================================================
CALL "%~dp0install_card.cmd" %*
