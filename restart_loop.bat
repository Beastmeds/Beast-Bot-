@echo off
:loop
echo Starte BeastBot...
pm2 start stormbot.js --name beastbot

echo BeastBot beendet. Neustart in 3 Sekunden...
timeout /t 3 /nobreak >nul
goto loop
