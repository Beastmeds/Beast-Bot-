#!/bin/bash

# BeastBot YouTube Download Diagnostic
# Run this on the SERVER to diagnose why downloads are failing

echo "╭─────────────────────────────────────────╮"
echo "│  BeastBot Download Diagnostic (SERVER)  │"
echo "╰─────────────────────────────────────────╯"
echo ""

TEST_URL="https://youtube.com/watch?v=IxX_QHay02M"
TEST_VIDEO_ID="IxX_QHay02M"

echo "📍 SYSTEM INFO:"
echo "─────────────────────────────────────────"
echo "User: $(whoami)"
echo "Current Dir: $(pwd)"
node --version 2>/dev/null || echo "❌ Node.js not found"
ffmpeg -version 2>/dev/null | head -1 || echo "❌ ffmpeg not found"
which yt-dlp 2>/dev/null || echo "❌ yt-dlp not in PATH"

echo ""
echo "📍 COOKIES:"
echo "─────────────────────────────────────────"
if [ -f "/root/Beast-Bot-/youtube/cookies.txt" ]; then
    COOKIE_COUNT=$(grep -c '^\.youtube\.com' /root/Beast-Bot-/youtube/cookies.txt 2>/dev/null || echo "0")
    echo "✅ Cookies exist ($COOKIE_COUNT cookies)"
    echo "Size: $(ls -lh /root/Beast-Bot-/youtube/cookies.txt | awk '{print $5}')"
    echo "Modified: $(stat -f '%Sm' /root/Beast-Bot-/youtube/cookies.txt 2>/dev/null || date)"
else
    echo "❌ /root/Beast-Bot-/youtube/cookies.txt NOT FOUND"
fi

echo ""
echo "📍 NETWORK TEST:"
echo "─────────────────────────────────────────"

# Test basic connectivity
echo "Testing connectivity to youtube.com..."
if timeout 5 curl -I --max-time 3 https://youtube.com 2>/dev/null | head -1; then
    echo "✅ Can reach youtube.com"
else
    echo "❌ Cannot reach youtube.com"
fi

# Test connectivity to invidious instances
echo "Testing Invidious instances..."
for inst in "yewtu.be" "invidious.io" "invidious.jfoxel.de"; do
    if timeout 5 curl -I --max-time 3 "https://$inst" 2>/dev/null | head -1 | grep -q "HTTP"; then
        echo "✅ $inst is reachable"
    else
        echo "❌ $inst is not reachable"
    fi
done

echo ""
echo "📍 YT-DLP TEST:"
echo "─────────────────────────────────────────"

# Test yt-dlp basic functionality
echo "Testing yt-dlp with test video..."
TEMP_OUT="/tmp/yt-dlp-test-$RANDOM.mp4"

# Try with cookies
if [ -f "/root/Beast-Bot-/youtube/cookies.txt" ]; then
    echo "Attempting: yt-dlp --cookies /root/Beast-Bot-/youtube/cookies.txt -f best -o $TEMP_OUT $TEST_URL"
    timeout 30 yt-dlp --cookies /root/Beast-Bot-/youtube/cookies.txt -f best -o "$TEMP_OUT" "$TEST_URL" 2>&1 | head -10
    
    if [ -f "$TEMP_OUT" ]; then
        SIZE=$(ls -lh "$TEMP_OUT" | awk '{print $5}')
        echo "✅ File created: $SIZE"
        rm -f "$TEMP_OUT"
    else
        echo "❌ No file created"
    fi
else
    echo "⚠️ Cannot test with cookies - file not found"
fi

echo ""
echo "📍 BOT STATUS:"
echo "─────────────────────────────────────────"
if command -v pm2 &>/dev/null; then
    pm2 status BeastBot 2>/dev/null | head -5 || echo "BeastBot not running"
else
    echo "PM2 not available"
fi

echo ""
echo "╭─────────────────────────────────────────╮"
echo "│            ANALYSIS SUMMARY             │"
echo "╰─────────────────────────────────────────╯"
echo ""

if [ ! -f "/root/Beast-Bot-/youtube/cookies.txt" ]; then
    echo "🔴 CRITICAL: Cookies missing on server!"
    echo "   Run on LOCAL machine: bash sync-cookies.sh"
elif grep -q "Cannot reach youtube.com" <<< "❌ Cannot reach youtube.com"; then
    echo "🔴 CRITICAL: Server has no internet connection!"
    echo "   Check firewall, DNS, or ISP blocking"
else
    echo "🟡 YouTube is aggressively blocking bot requests"
    echo "   Even with cookies, yt-dlp signatures fail"
    echo ""
    echo "Possible solutions:"
    echo "  1. Use fresh/new cookies from different browser"
    echo "  2. Try from different server/IP (current IP may be blacklisted)"
    echo "  3. Add request delays between downloads"
    echo "  4. Use VPN or proxy service"
fi

echo ""
