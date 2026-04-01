## 🔐 YouTube Downloads & Cookies Setup

### Current Issue
YouTube blocks automated downloads without valid authentication cookies. The server (`/root/Beast-Bot-/`) doesn't have the YouTube cookies file, which is why `/mp4` downloads fail with "Precondition check failed" errors.

### Solution: Sync Cookies to Server

The local machine has valid YouTube cookies in:
```
/Users/nicolloyd/Desktop/BeastBot/youtube/cookies.txt
```

You need to copy these to the server at:
```
/root/Beast-Bot-/youtube/cookies.txt
```

#### Option 1: Using SCP (Recommended)
```bash
# From your local machine:
scp youtube/cookies.txt root@<SERVER_IP>:/root/Beast-Bot-/youtube/

# Or use this helper script:
bash sync-cookies-to-server.sh root@<SERVER_IP>
```

#### Option 2: Manual SSH
```bash
ssh root@<SERVER_IP>
mkdir -p /root/Beast-Bot-/youtube
# Then paste the cookies content from local youtube/cookies.txt
```

#### Option 3: Restart Bot with New Code
The updated code tries multiple strategies:
1. yt-dlp with best format (needs cookies for YouTube)
2. yt-dlp with audio+video merge
3. ytdl-core library
4. play-dl library

Even without cookies, methods 3-4 may work, but are slower.

### How to Get Fresh Cookies
If cookies expire or stop working:
```bash
yt-dlp --cookies-from-browser firefox https://www.youtube.com -o "test.mp4"
# Or Chrome/Chromium
yt-dlp --cookies-from-browser chrome https://www.youtube.com -o "test.mp4"
```

Then copy the generated `cookies.txt` to both local and server:
```bash
cp cookies.txt youtube/cookies.txt
scp youtube/cookies.txt root@<SERVER_IP>:/root/Beast-Bot-/youtube/
```

### Verify Setup
Test with:
```bash
ssh root@<SERVER_IP> "cat /root/Beast-Bot-/youtube/cookies.txt"
```

Should show Netscape-format cookies starting with:
```
# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	...
```

### Testing
Once synced, test `/mp4` command in WhatsApp:
```
/mp4 https://youtube.com/watch?v=<VIDEO_ID>
```

Monitor server logs for success:
```
pm2 logs BeastBot | grep "✅ Download"
```

---
**Last Updated:** 2026-04-01
**Required for:** YouTube video downloads via `/mp4` command
