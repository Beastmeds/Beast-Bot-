#!/bin/bash

# Sync YouTube cookies to BeastBot server
# Usage: bash sync-cookies-to-server.sh [server-user@server-host]

SERVER=${1:-"user@192.168.x.x"}
REMOTE_PATH="/root/Beast-Bot-/youtube"

echo "📤 Syncing YouTube cookies to server: $SERVER"

# Create remote youtube directory
ssh "$SERVER" "mkdir -p $REMOTE_PATH" || exit 1

# Copy cookies file
scp youtube/cookies.txt "$SERVER:$REMOTE_PATH/cookies.txt" || exit 1

echo "✅ YouTube cookies synced successfully!"
echo "📝 Verify with: ssh $SERVER 'cat $REMOTE_PATH/cookies.txt'"
