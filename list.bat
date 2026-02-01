@echo off
chcp 65001 >nul
:: Setzt UTF-8 für Emojis in CMD

echo 🧠 PM2 Prozessstatus Übersicht:
echo ================================

:: Prozesse in JSON auslesen
for /f "delims=" %%i in ('pm2 jlist') do set "json=%%i"

:: Prüfen, ob JSON leer ist
if "%json%"=="" (
    echo ⚠️ Keine PM2-Prozesse gefunden.
    exit /b
)

:: Temporäre Datei für Parsing
set tmpfile=%temp%\pm2tmp.json
echo %json%>%tmpfile%

:: Node.js Skript für Emojis
node -e ^
"const fs = require('fs');" ^
"let data = JSON.parse(fs.readFileSync('%tmpfile%', 'utf8'));" ^
"data.forEach(app => {" ^
"  let icon = app.pm2_env.status==='online'?'✅':app.pm2_env.status==='stopped'?'❌':'💤';" ^
"  let label = app.pm2_env.status==='online'?'aktiv':app.pm2_env.status==='stopped'?'gestoppt':'pausiert';" ^
"  console.log(`${icon} ${app.name} — ${label}`);" ^
"});"

:: Temp-Datei löschen
del %tmpfile%
