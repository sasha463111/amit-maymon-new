@echo off
rem Tehila scan bridge - one-time install on a PC with a scanner.
rem Needs NAPS2 installed first (https://www.naps2.com, free).
rem Copies the bridge and starts it hidden at every Windows login.
set DEST=%LOCALAPPDATA%\TehilaScanBridge
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%~dp0scan-bridge.ps1" "%DEST%\scan-bridge.ps1" >nul
set DEVICE=%~1
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\TehilaScanBridge.vbs
> "%STARTUP%" echo CreateObject("WScript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%DEST%\scan-bridge.ps1"" -Device ""%DEVICE%""", 0, False
wscript "%STARTUP%"
echo.
echo Installed. The bridge now runs in the background and starts with Windows.
echo Test: open the claim in Tehila - Documents tab - the scan-to-claim button should appear.
pause
