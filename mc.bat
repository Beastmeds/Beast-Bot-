@echo off
title Minecraft Server Starter
echo ============================================
echo 🚀 Starte Minecraft Server über PM2...
echo ============================================

cd /d C:\Minecraft-Server
pm2 start start.js --name Minecraft

echo ✅ Minecraft Server gestartet!
pause
