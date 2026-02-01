const https = require('https');
const fs = require('fs');
const path = require('path');

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest, { mode: 0o755 });
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirect
        return resolve(download(res.headers.location, dest));
      }
      if (res.statusCode !== 200) {
        return reject(new Error('Download failed: ' + res.statusCode));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

(async () => {
  try {
    const platform = process.platform; // 'linux', 'darwin', 'win32'
    let url;
    let outName = 'yt-dlp';
    if (platform === 'linux') {
      url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
      outName = 'yt-dlp';
    } else if (platform === 'darwin') {
      url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
      outName = 'yt-dlp';
    } else if (platform === 'win32') {
      url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
      outName = 'yt-dlp.exe';
    } else {
      console.log('[install-yt-dlp] Unsupported platform:', platform);
      process.exit(0);
    }

    const dest = path.join(__dirname, '..', outName);
    if (fs.existsSync(dest)) {
      console.log('[install-yt-dlp] yt-dlp already present at', dest);
      return;
    }

    console.log('[install-yt-dlp] Downloading yt-dlp from', url);
    await download(url, dest);
    try { fs.chmodSync(dest, 0o755); } catch (e) {}
    console.log('[install-yt-dlp] Saved to', dest);
  } catch (err) {
    console.error('[install-yt-dlp] Failed to download yt-dlp:', err.message || err);
    process.exit(0);
  }
})();
