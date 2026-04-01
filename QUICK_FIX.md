# ⚡ Quick Fix: YouTube/TikTok Downloads Not Working

## What's Wrong? 🔴
```
❌ /mp4 command: "Datei zu klein: 0 bytes"
❌ /play command: Also failing (uses same yt-dlp)
⚠️ /tok command: Separate issue - uses external API
```

## Root Cause 🎯
YouTube blocks automated downloads **without valid authentication cookies**.

The server at `/root/Beast-Bot-/` **doesn't have the cookies file**, so all methods fail:
- ❌ yt-dlp attempts
- ❌ ytdl-core library
- ❌ play-dl library

## Fix (3 Steps) ✅

### 1️⃣ Verify Local Cookies Exist
```bash
ls -lh youtube/cookies.txt
```

Should show: `-rw-r--r-- ... youtube/cookies.txt`

❌ **If missing:** Generate fresh cookies:
```bash
yt-dlp --cookies-from-browser firefox https://www.youtube.com
```

### 2️⃣ Run Sync Script
```bash
bash sync-cookies.sh
```

Follow the prompts. It will automatically:
- Test SSH to your server
- Create `/root/Beast-Bot-/youtube/` directory  
- Upload cookies
- Verify success

✨ **That's it!** No manual SCP needed.

### 3️⃣ Restart Bot & Test
```bash
# Restart bot
pm2 restart BeastBot

# Test in WhatsApp
/mp4 https://youtube.com/watch?v=IxX_QHay02M

# Monitor logs
pm2 logs BeastBot | grep -i "strategie\|download"
```

**Expected Output:**
```
🔄 Versuche yt-dlp Strategie 1...
✅ Download erfolgreich via yt-dlp Strategie 1
```

---

## Troubleshooting

### Script says "SSH connection OK" but then fails
The server might need a password or SSH key setup:
```bash
# Test manually:
ssh root@<SERVER_IP> "ls /root/Beast-Bot-/"

# If you see the directory, SSH works ✅
# If it asks for password, set up SSH keys or use manual method below
```

### Manual SCP Method (if script doesn't work)
```bash
scp youtube/cookies.txt root@<SERVER_IP>:/root/Beast-Bot-/youtube/
```

### Verify on Server
```bash
ssh root@<SERVER_IP> "cat /root/Beast-Bot-/youtube/cookies.txt" | head -5
```

Should show:
```
# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	...
```

---

## For IT Support 🛠️

If you need manual help:
1. Run the diagnostic: `bash diagnose-downloads.sh`
2. Share the output
3. Check the full guide: `cat YOUTUBE_COOKIES_SETUP.md`

---

**TL;DR:**
1. `bash sync-cookies.sh` → uploads cookies to server
2. `pm2 restart BeastBot` → restart bot
3. Test with `/mp4 <YouTube_URL>` → should work!

