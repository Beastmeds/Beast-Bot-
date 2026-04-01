# 🎬 YouTube Download - Updated Strategy (2026-04-01)

## What Changed

Enhanced download function with **stronger YouTube blocking workarounds**:

### New Strategies (6 total):
1. **yt-dlp skip-hls** - Skip HLS streams, use web player
2. **yt-dlp web-player** - Alternative player + JS bypass  
3. **yt-dlp any-format** - Accept any available format
4. **ytdl-core** - Node.js library with full headers
5. **play-dl** - Discord music library
6. **Invidious** - Alternative YouTube frontend (last resort)

### Better Headers
- Added `Accept-Encoding: gzip, deflate`
- Added `Accept: text/html,application/xhtml+xml,...`
- Increased socket timeout to 60 seconds

## Test Now

**Restart bot:**
```bash
pm2 restart BeastBot
```

**Test download:**
```
/mp4 https://youtube.com/watch?v=IxX_QHay02M
```

**Watch logs:**
```bash
pm2 logs BeastBot | grep -E "Strategie|erfolgreich|fehlgeschlagen"
```

## Expected Output

### If it works:
```
✅ 10 Cookies geladen
🔄 Versuche yt-dlp Strategie 1 (skip-hls)...
✅ Download erfolgreich via yt-dlp Strategie 1
```

### If it still fails (all strategies):
```
🔄 Versuche yt-dlp Strategie 1 (skip-hls)...
⚠️ yt-dlp Strategie 1 fehlgeschlagen: ...
🔄 Versuche yt-dlp Strategie 2 (web player)...
⚠️ yt-dlp Strategie 2 fehlgeschlagen: ...
[... strategies 3-5 fail ...]
🔄 Versuche Invidious (YouTube-Alternative)...
✅ Download erfolgreich via Invidious
```

## Troubleshooting

### YouTube still blocking (Precondition check failed)?
This means YouTube detects all requests as bots, even with:
- ✅ Valid cookies
- ✅ Real user agents  
- ✅ Real headers
- ✅ Multiple player/extractor options

**Root cause:** YouTube's 2026 bot detection is extremely aggressive.

**Solutions:**
1. **Wait 1-2 hours** - YouTube bans might be temporary
2. **Refresh cookies** - Current ones might be detected as bots:
   ```bash
   yt-dlp --cookies-from-browser firefox https://www.youtube.com
   bash sync-cookies.sh  # Re-upload fresh cookies
   ```
3. **Use a different browser** for cookie generation:
   ```bash
   yt-dlp --cookies-from-browser chrome https://www.youtube.com
   # or
   yt-dlp --cookies-from-browser edge https://www.youtube.com
   ```

### Invidious instance blocked?
YouTube blocks Invidious too. Try different instances or wait a few hours.

### /play also broken?
Yes - same fix applies since `/play` also uses yt-dlp

### /tok (TikTok) broken?
Different issue - uses external API `tikwm.com`. Check internet connection.

## Technical Details

**Why YouTube blocks so aggressively:**
- YouTube detects yt-dlp fingerprints
- Cookies alone aren't enough for bot detection
- Multiple simultaneous downloads = IP ban
- Browser automation is blocked

**Why Invidious is a fallback:**
- Invidious scrapes YouTube without using its API
- Harder to detect and block
- But slower and also frequently blocked

**Why this is hard in 2026:**
- YouTube's anti-scraping is industry-leading
- No "perfect" solution exists
- Best approach: human-like requests with rate limiting

---

**Status:** Enhanced with 6 strategies including Invidious fallback  
**Last Updated:** 2026-04-01 13:30 UTC
