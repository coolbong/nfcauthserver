@ECHO OFF
SETLOCAL ENABLEEXTENSIONS

REM Target smartcard reader name
SET READER=%~1
IF "%READER%"=="" SET READER=HID Global OMNIKEY 5422CL Smartcard Reader 0

ECHO =============================================================================
ECHO   [NFC SmartCard Applet Installer]
ECHO =============================================================================
ECHO Target Reader : %READER%
ECHO.

SET CAP_FILE=%~dp0build\bin\ndef-applet.cap
IF NOT EXIST "%CAP_FILE%" (
    ECHO [INFO] CAP file not found. Running build first...
    PUSHD "%~dp0build"
    CALL build.cmd
    POPD
)

IF NOT EXIST "%CAP_FILE%" (
    ECHO.
    ECHO [ERROR] Failed to find or compile ndef-applet.cap
    EXIT /B 1
)

ECHO [Step 1/2] Removing previous applet package if present...
"%~dp0tools\gp.exe" -r "%READER%" -uninstall "%CAP_FILE%" >nul 2>&1

ECHO [Step 2/2] Installing new ndef-applet.cap to smartcard...
"%~dp0tools\gp.exe" -r "%READER%" -install "%CAP_FILE%"

IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO [ERROR] Card installation failed.
    ECHO   1. Make sure your card is placed firmly on the reader.
    ECHO   2. Check available reader names by running:
    ECHO      tools\gp.exe --reader
    ECHO   3. If using another reader, pass its name:
    ECHO      install_card.cmd "Your Reader Name"
    EXIT /B 1
)

ECHO.
ECHO =============================================================================
ECHO   SUCCESS: NDEF Applet successfully installed on your card!
ECHO =============================================================================
ECHO.
ECHO Next Steps:
ECHO   1. Reset DB counter for this card:
ECHO      node scripts/register_tag.js 04de5f1eacc040 --reset
ECHO.
ECHO   2. Tap your smartcard to your smartphone to verify!
ECHO =============================================================================
