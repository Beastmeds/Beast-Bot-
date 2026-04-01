#!/bin/bash

# BeastBot YouTube Cookies Sync Script
# This script copies YouTube cookies from local machine to BeastBot server
# Run this from the BeastBot directory

set -e

echo "╭─────────────────────────────────────────╮"
echo "│  BeastBot YouTube Cookies Sync Script   │"
echo "╰─────────────────────────────────────────╯"
echo ""

# Check if cookies exist locally
if [ ! -f "youtube/cookies.txt" ]; then
    echo "❌ ERROR: youtube/cookies.txt not found in current directory"
    echo ""
    echo "To generate cookies, run:"
    echo "  yt-dlp --cookies-from-browser firefox --cookies-from-browser-keyring=chrome https://www.youtube.com"
    echo ""
    exit 1
fi

# Get server info
read -p "Server IP/hostname (e.g., 192.168.1.100 or user@server.com): " SERVER
if [ -z "$SERVER" ]; then
    echo "❌ No server specified. Exiting."
    exit 1
fi

# Check if SSH key works
echo ""
echo "🔐 Testing SSH connection..."
if ! ssh -o ConnectTimeout=5 "$SERVER" "echo 'SSH connection OK'" > /dev/null 2>&1; then
    echo "❌ Cannot connect to $SERVER via SSH"
    echo "Make sure:"
    echo "  1. SSH is enabled on the server"
    echo "  2. You have the correct IP/hostname"
    echo "  3. SSH keys are set up (if no password)"
    echo ""
    exit 1
fi

echo "✅ SSH connection successful"
echo ""

# Create directory on server
echo "📁 Creating youtube directory on server..."
ssh "$SERVER" "mkdir -p /root/Beast-Bot-/youtube"

# Copy cookies
echo "📤 Uploading youtube/cookies.txt..."
scp -p youtube/cookies.txt "$SERVER:/root/Beast-Bot-/youtube/cookies.txt"

# Verify
echo ""
echo "✅ Verifying upload..."
COOKIE_COUNT=$(ssh "$SERVER" "grep -c '^\.youtube\.com' /root/Beast-Bot-/youtube/cookies.txt" 2>/dev/null || echo "0")

if [ "$COOKIE_COUNT" -gt 0 ]; then
    echo "✅ SUCCESS! $COOKIE_COUNT cookies synced to server"
    echo ""
    echo "Next steps:"
    echo "  1. Restart the bot:  pm2 restart BeastBot"
    echo "  2. Test /mp4 command: /mp4 https://youtube.com/watch?v=<VIDEO_ID>"
    echo ""
    echo "Monitor logs: pm2 logs BeastBot | grep 'Download'"
else
    echo "⚠️  WARNING: Cookies may not have synced properly"
    echo "SSH verification failed. Check manually:"
    echo "  ssh $SERVER \"cat /root/Beast-Bot-/youtube/cookies.txt\""
fi

echo ""
