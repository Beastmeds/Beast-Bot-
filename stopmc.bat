@echo off
title Minecraft Server Stopper
echo ============================================
echo 🟥 Stoppe Minecraft Server über PM2...
echo ============================================

cd /d C:\minecraft
pm2 delete Minecraft

echo ✅ Minecraft Server gestoppt und aus PM2 entfernt!
pause
