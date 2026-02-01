@echo off
title RDP Freigabe Aktivieren
echo =======================================
echo   RDP Freigabe aktivieren (Port 3389)
echo =======================================
echo.

REM 1. RDP aktivieren
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server" /v fDenyTSConnections /t REG_DWORD /d 0 /f

REM 2. NLA aktivieren
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" /v UserAuthentication /t REG_DWORD /d 1 /f

REM 3. RDP-Dienst starten
sc config TermService start= auto
sc start TermService

REM 4. Firewall-Regel für RDP aktivieren
netsh advfirewall firewall set rule group="Remote Desktop" new enable=Yes

REM 5. Zur Sicherheit manuelle Regel für Port 3389 anlegen
netsh advfirewall firewall add rule name="RDP Port 3389" dir=in action=allow protocol=TCP localport=3389

echo.
echo RDP und Firewall sind jetzt aktiv.
echo.
ipconfig | findstr /i "IPv4"
echo.
echo => Jetzt Port 3389 im Router freigeben auf diese IP!
pause
