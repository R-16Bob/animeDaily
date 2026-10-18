@echo off
setlocal
set RULE=AnimeDaily 8787

net session >nul 2>&1
if errorlevel 1 goto elevate
goto apply

:elevate
echo.
echo   Administrator rights are required to open the firewall port.
echo   Clicking YES on the UAC prompt...
echo.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
exit /b

:apply
netsh advfirewall firewall delete rule name="%RULE%" >nul 2>&1
netsh advfirewall firewall add rule name="%RULE%" dir=in action=allow protocol=TCP localport=8787 profile=private,domain >nul
if errorlevel 1 goto failed

echo.
echo   [OK] TCP 8787 is now allowed on Private and Domain networks.
echo.
echo   Open the address printed in the AnimeDaily window on your phone,
echo   for example:  http://192.168.x.x:8787
echo.
echo   Still timing out? Set the current Wi-Fi profile to Private:
echo   Settings - Network and Internet - Wi-Fi - your network - Private.
echo.
pause
exit /b

:failed
echo.
echo   [FAILED] Could not add the firewall rule.
echo   Try running this in an Administrator PowerShell instead:
echo   netsh advfirewall firewall add rule name="AnimeDaily 8787" dir=in action=allow protocol=TCP localport=8787 profile=private,domain
echo.
pause
exit /b
