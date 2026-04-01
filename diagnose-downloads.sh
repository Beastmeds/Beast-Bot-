#!/bin/bash

# BeastBot Download Diagnostic Script
# Shows current download status and what's missing

echo "╭─────────────────────────────────────────╮"
echo "│  BeastBot Download System Diagnostics   │"
echo "╰─────────────────────────────────────────╯"
echo ""

# Check local cookies
echo "📍 LOCAL MACHINE:"
echo "─────────────────────────────────────────"
if [ -f "youtube/cookies.txt" ]; then
    COOKIE_COUNT=$(grep -c '^\.youtube\.com' youtube/cookies.txt 2>/dev/null || echo "?")
    echo "✅ youtube/cookies.txt exists ($COOKIE_COUNT cookies)"
else
    echo "❌ youtube/cookies.txt NOT FOUND"
fi

if command -v yt-dlp &> /dev/null; then
    YT_VERSION=$(yt-dlp --version 2>/dev/null | head -1)
    echo "✅ yt-dlp installed: $YT_VERSION"
else
    echo "❌ yt-dlp NOT installed"
fi

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js installed: $NODE_VERSION"
else
    echo "❌ Node.js NOT installed"
fi

echo ""
echo "📍 SERVER STATUS:"
echo "─────────────────────────────────────────"

# Try to get server IP from user or config
read -p "Enter server IP/hostname (or press Enter to skip server check): " SERVER

if [ -n "$SERVER" ]; then
    # Test SSH connection
    if timeout 5 ssh -o ConnectTimeout=3 "$SERVER" "echo 'OK'" > /dev/null 2>&1; then
        echo "✅ SSH connection successful"
        
        # Check cookies on server
        if ssh "$SERVER" "test -f /root/Beast-Bot-/youtube/cookies.txt" 2>/dev/null; then
            SERVER_COOKIE_COUNT=$(ssh "$SERVER" "grep -c '^\.youtube\.com' /root/Beast-Bot-/youtube/cookies.txt" 2>/dev/null || echo "?")
            echo "✅ /root/Beast-Bot-/youtube/cookies.txt exists ($SERVER_COOKIE_COUNT cookies)"
        else
            echo "❌ /root/Beast-Bot-/youtube/cookies.txt NOT FOUND on server"
            echo "   👉 Run: bash sync-cookies.sh"
        fi
        
        # Check bot status
        if ssh "$SERVER" "command -v pm2 &>/dev/null && pm2 status BeastBot" 2>/dev/null | grep -q "online\|running"; then
            echo "✅ BeastBot is running"
            echo ""
            echo "📊 Recent Bot Logs (last 5 lines):"
            echo "─────────────────────────────────────────"
            ssh "$SERVER" "pm2 logs BeastBot --lines 5 --nostream" 2>/dev/null || echo "   (Could not fetch logs)"
        else
            echo "⚠️  BeastBot not running or PM2 not available"
        fi
    else
        echo "❌ Cannot connect to $SERVER via SSH"
        echo "   Check: SSH enabled, firewall, correct hostname/IP"
    fi
else
    echo "⏭️  Skipped server check"
fi

echo ""
echo "╭─────────────────────────────────────────╮"
echo "│          SUMMARY & NEXT STEPS           │"
echo "╰─────────────────────────────────────────╯"
echo ""

if [ -f "youtube/cookies.txt" ]; then
    echo "✅ Local cookies: OK"
    echo "❌ Server cookies: MISSING (if not found above)"
    echo ""
    echo "👉 ACTION: Run this to sync cookies:"
    echo "   bash sync-cookies.sh"
else
    echo "❌ Local cookies: MISSING"
    echo ""
    echo "👉 ACTION: Generate fresh cookies:"
    echo "   yt-dlp --cookies-from-browser firefox https://www.youtube.com"
    echo ""
    echo "   Then sync to server:"
    echo "   bash sync-cookies.sh"
fi

echo ""
echo "📚 Full Setup Guide: cat YOUTUBE_COOKIES_SETUP.md"
echo ""
