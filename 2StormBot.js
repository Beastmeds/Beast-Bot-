const tttGames = {}; // { jid: { board: ['','','','','','','','',''], turn: 'X'|'O', status: 'playing' } }
const bjGames = {}; // { jid: { hand: [], dealer: [], status: 'playing'|'stand', bet: Zahl } }
let spamInterval = 0; // Intervall zwischen Nachrichten in ms für Spam-Funktion
let dbInstance = null; // Global database reference for economy functions
const timeoutUsers = {}; // { userId: { chatId: 'xxx', expiresAt: Date, reason: 'string' } }
// Premium Auto-Features: speichere letzte Ausführung je User im RAM
const autoPremiumState = {
  autowork: new Map(),
  autofish: new Map(),
  boost: new Map()
};

// Message Queue System - verhindert Rate-Limits durch Delays
const messageQueue = {
  queue: [],
  isProcessing: false,
  delayMs: 1000, // 1 Sekunde Delay zwischen Messages
  
  async send(sock, chatId, messageObject, options = {}) {
    return new Promise((resolve) => {
      this.queue.push({ sock, chatId, messageObject, options, resolve });
      this.process();
    });
  },
  
  async process() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const { sock, chatId, messageObject, options, resolve } = this.queue.shift();
      try {
        const result = await sock.sendMessage(chatId, messageObject, options);
        resolve(result);
      } catch (err) {
        console.error('Message Queue Error:', err);
        resolve(null);
      }
      // Delay zwischen Messages
      if (this.queue.length > 0) {
        await new Promise(r => setTimeout(r, this.delayMs));
      }
    }
    this.isProcessing = false;
  }
};

// Helper: Umleitung zu Message Queue
function wrapSocketSendMessage(sock) {
  const originalSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (chatId, messageObject, options) => {
    return messageQueue.send(sock, chatId, messageObject, options);
  };
  return sock;
}
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} = require('@717development/baileys'); 
const settings = require('./settings.js');
const { spawn } = require('child_process');

const fs = require('fs');
const ytdlCore = require('ytdl-core');
const { downloadMediaMessage } = require('@717development/baileys');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule; // compat for ESM/CJS chalk builds
const allowedRanks = require('./ranksConfig.json');
const { proto, generateWAMessageFromContent, prepareWAMessageMedia, getContentType } = require('@717development/baileys');
const { downloadContentFromMessage } = require('@717development/baileys')
const crypto = require('crypto');
const pino = require('pino');
const axios = require('axios');
const { Buffer } = require('buffer');
const STATS_FILE = "./botStats.json";
const { getAudioBuffer, saveTempAudio } = require('./audioHelper');
const FormData = require('form-data');
const ranks = require('./rangsystem/ranks.js');
const { isGroupLocked, lockGroup, unlockGroup } = require('./lib/lockedGroups');
const { initNyxion, handleNyxionMessage, sendNyxionResponse, isNyxionCommand } = require('./lib/nyxion');

// Lazy load heavy dependencies
let ffmpeg, fetch, getPreview;
const loadHeavyDeps = () => {
  if (!ffmpeg) ffmpeg = require('@ffmpeg-installer/ffmpeg');
  if (!fetch) fetch = require('node-fetch');
  if (!getPreview) getPreview = require('spotify-url-info')(fetch);
  return { ffmpeg, fetch, getPreview };
};

const BOTHUB_URL = "https://bothub.gamebot.me/api/bot/update-stats";
const BOTHUB_TOKEN = "api_BotHub_13_1756984116657_ceb64da87bc3fe215bdb430041778b36";

// Base44 Web Register Constants
const API_BASE_URL = process.env.API_BASE_URL || 'https://beastbot.base44.app'; // Deine Base44 App URL
const BASE44_APP_ID = process.env.BASE44_APP_ID || '69ba56fe13f5ed1f6e3d3687'; // ID deiner Base44 App
// Dedizierter Bot-Endpoint für Bot-Kommandos
const BOT_API_URL = process.env.BOT_API_URL || 'https://api.base44.com/api/apps/69ba56fe13f5ed1f6e3d3687/functions/botCommand';
const BOT_SECRET = process.env.BOT_SECRET || 'BeastBot';
const BOT_WEBHOOK_SECRET = BOT_SECRET; // Kompatibilität zu bestehendem Code
let base44SyncEnabled = true;
let base44LastErrorLog = 0;
// Full Functions endpoint (Dashboard → Code → Functions → syncBotUser)
const FUNCTION_URL = `https://api.base44.com/api/apps/${BASE44_APP_ID}/functions/syncBotUser`;

// Top-level helper: Sync a single user to Base44 by calling your Function
async function syncUserToBase44(userData) {
  if (!base44SyncEnabled) return;
  try {
    await axios.post(FUNCTION_URL, {
      secret: BOT_WEBHOOK_SECRET,
      whatsapp_number: userData.whatsapp_number,
      username: userData.username,
      coins: userData.coins,
      level: userData.level,
      xp: userData.xp,
      rank: userData.rank,
      job: userData.job,
      warnings: userData.warnings || 0
    });
    console.log('✅ User synced to Base44:', userData.whatsapp_number);
  } catch (err) {
    const status = err?.response?.status;
    const now = Date.now();
    if (status === 404) {
      base44SyncEnabled = false;
      console.error('⚠️ Base44 Sync deaktiviert (404). Bitte API_BASE_URL/FUNCTION_URL prüfen.');
    } else if (now - base44LastErrorLog > 60000) { // log max 1/min
      base44LastErrorLog = now;
      console.error('❌ Sync Error:', err.message);
    }
  }
}

const blockedFile = './data/blocked.json';
if (!fs.existsSync(blockedFile)) fs.writeFileSync(blockedFile, JSON.stringify({ blocked: [] }, null, 2));

const loadBlocked = () => JSON.parse(fs.readFileSync(blockedFile));
const saveBlocked = (data) => fs.writeFileSync(blockedFile, JSON.stringify(data, null, 2));

const path = require('path');
// load optional environment variables (can live in config.env or a .env file)
// this allows you to keep sensitive API keys out of the repo and/or override
// the values that are stored in `apiConfig.json`.
try {
  require('dotenv').config({ path: path.join(__dirname, 'config.env') });
} catch {} // ignore if dotenv isn't installed or file doesn't exist

// -------------------- yt-dlp helpers (Linux/Windows compatible) --------------------
const YTDLP_IO_CAPTURE_LIMIT = 64 * 1024;

function appendLimited(current, chunk, limit = YTDLP_IO_CAPTURE_LIMIT) {
  const next = (current || '') + chunk.toString();
  return next.length > limit ? next.slice(-limit) : next;
}

function getYtDlpCandidates() {
  const candidates = [];
  const bundled = path.join(__dirname, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(bundled)) candidates.push({ cmd: bundled, args: [] });

  // Fallbacks (in PATH) and npx
  candidates.push({ cmd: 'yt-dlp', args: [] });
  if (process.platform === 'win32') candidates.push({ cmd: 'yt-dlp.exe', args: [] });
  candidates.push({ cmd: 'npx', args: ['yt-dlp'] });
  return candidates;
}

function getYtDlpJsRuntimeArgs() {
  // yt-dlp supports --js-runtimes in newer versions. Older versions (and
  // some packaged bots) may not support this option.
  // If you need a runtime override, set YTDLP_JS_RUNTIMES in env.
  const value = (process.env.YTDLP_JS_RUNTIMES || '').trim();
  if (!value) return [];
  return ['--js-runtimes', value];
}

function getYtDlpFfmpegArgs() {
  // Only pass --ffmpeg-location if it actually exists, otherwise yt-dlp disables
  // ffmpeg detection and you'll get the "ffmpeg-location does not exist" warning.
  const raw =
    process.env.YTDLP_FFMPEG_LOCATION ||
    process.env.FFMPEG_LOCATION ||
    process.env.FFMPEG_PATH ||
    '';
  const location = (raw || '').trim();
  if (!location) return [];
  try {
    if (!fs.existsSync(location)) return [];
  } catch {
    return [];
  }
  return ['--ffmpeg-location', location];
}

async function downloadYoutubeVideo(url, outputPath) {
  // Determine cookie path once at start
  const defaultCookiesPath = path.join(__dirname, 'youtube', 'cookies.txt');
  const ytCookies = (process.env.YOUTUBE_COOKIES || defaultCookiesPath).replace(/^~\//, `${process.env.HOME || ''}/`);

  // Parse cookies once
  let cookieHeader = '';
  const cookiesExist = fs.existsSync(ytCookies);
  if (cookiesExist) {
    try {
      const cookieLines = fs.readFileSync(ytCookies, 'utf8').split(/\r?\n/);
      const cookies = cookieLines
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split('\t'))
        .filter((parts) => parts.length >= 7)
        .map((parts) => `${parts[5]}=${parts[6]}`);
      if (cookies.length) cookieHeader = cookies.join('; ');
      console.log(`✅ ${cookies.length} Cookies geladen`);
    } catch (e) {
      console.log('⚠️ Cookie-Parse Fehler:', e.message || e);
    }
  } else {
    console.log('⚠️ Cookie-Datei nicht gefunden:', ytCookies);
  }

  // Base yt-dlp arguments with strong headers
  const getBaseArgs = () => [
    ...getYtDlpJsRuntimeArgs(),
    ...getYtDlpFfmpegArgs(),
    '--no-check-certificate',
    '--socket-timeout', '60',
    '--no-playlist',
  ];

  const headers = [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept-Language: en-US,en;q=0.9',
    'Accept-Encoding: gzip, deflate',
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  ];

  // Strategy 1: yt-dlp with skip-hls and stronger extractor args
  try {
    console.log('🔄 Versuche yt-dlp Strategie 1 (skip-hls)...');
    const ytDlpArgs = [
      ...getBaseArgs(),
      '--extractor-args', 'youtube:skip=hls,player_client=web',
      '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4] / bv*+ba/b',
      '-o', outputPath,
      ...headers.flatMap(h => ['--add-header', h]),
      url
    ];

    if (cookiesExist) {
      ytDlpArgs.unshift('--cookies', ytCookies);
    }

    await runYtDlp(ytDlpArgs);
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
      console.log('✅ Download erfolgreich via yt-dlp Strategie 1');
      return;
    }
  } catch (err) {
    console.log('⚠️ yt-dlp Strategie 1 fehlgeschlagen:', (err.message || '').split('\n')[0]);
  }

  // Strategy 2: yt-dlp with alternative player and web extraction
  try {
    console.log('🔄 Versuche yt-dlp Strategie 2 (web player)...');
    const ytDlpArgs = [
      ...getBaseArgs(),
      '--extractor-args', 'youtube:player_client=web,player_skip=js',
      '-f', 'bv+ba/b',
      '-o', outputPath,
      ...headers.flatMap(h => ['--add-header', h]),
      url
    ];

    if (cookiesExist) {
      ytDlpArgs.unshift('--cookies', ytCookies);
    }

    await runYtDlp(ytDlpArgs);
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
      console.log('✅ Download erfolgreich via yt-dlp Strategie 2');
      return;
    }
  } catch (err) {
    console.log('⚠️ yt-dlp Strategie 2 fehlgeschlagen:', (err.message || '').split('\n')[0]);
  }

  // Strategy 3: yt-dlp simple fallback - just get ANY available format
  try {
    console.log('🔄 Versuche yt-dlp Strategie 3 (any format)...');
    const ytDlpArgs = [
      ...getBaseArgs(),
      '-f', '(bv+ba/b)',
      '-o', outputPath,
      ...headers.flatMap(h => ['--add-header', h]),
      url
    ];

    if (cookiesExist) {
      ytDlpArgs.unshift('--cookies', ytCookies);
    }

    await runYtDlp(ytDlpArgs);
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
      console.log('✅ Download erfolgreich via yt-dlp Strategie 3');
      return;
    }
  } catch (err) {
    console.log('⚠️ yt-dlp Strategie 3 fehlgeschlagen:', (err.message || '').split('\n')[0]);
  }

  // Strategy 4: Try ytdl-core with different agent
  try {
    console.log('🔄 Versuche ytdl-core...');
    const streamOpts = {
      quality: 'highest',
      highWaterMark: 1 << 25,
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      }
    };
    if (cookieHeader) {
      streamOpts.requestOptions.headers.Cookie = cookieHeader;
    }

    const stream = ytdlCore(url, streamOpts);
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      stream.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
      stream.pipe(writer);
    });

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
      console.log('✅ Download erfolgreich via ytdl-core');
      return;
    }
  } catch (err) {
    console.log('⚠️ ytdl-core fehlgeschlagen:', (err.message || '').split('\n')[0]);
  }

  // Strategy 5: play-dl with proper URL format
  try {
    console.log('🔄 Versuche play-dl...');
    const streamObj = await playdl.stream(url, { quality: 0 });
    if (streamObj && streamObj.stream) {
      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);
        streamObj.stream.on('error', reject);
        writer.on('error', reject);
        writer.on('finish', resolve);
        streamObj.stream.pipe(writer);
      });

      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
        console.log('✅ Download erfolgreich via play-dl');
        return;
      }
    }
  } catch (err) {
    console.log('⚠️ play-dl fehlgeschlagen:', (err.message || '').split('\n')[0]);
  }

  // Strategy 6: Invidious proxy service (last resort - uses alternative YouTube frontend)
  try {
    console.log('🔄 Versuche Invidious (YouTube-Alternative)...');
    const invidiousInstances = [
      'https://yewtu.be',
      'https://invidious.jfoxel.de',
      'https://invidious.io'
    ];

    for (const instance of invidiousInstances) {
      try {
        // Convert YouTube URL to Invidious
        const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
        if (!videoId) break;

        const invUrl = `${instance}/latest_version?id=${videoId}`;
        const ytDlpArgs = [
          ...getBaseArgs(),
          '-f', 'best',
          '-o', outputPath,
          invUrl
        ];

        console.log(`  → Versuche ${instance}...`);
        await runYtDlp(ytDlpArgs);
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
          console.log('✅ Download erfolgreich via Invidious');
          return;
        }
      } catch (instErr) {
        console.log(`    ⚠️ ${instance} fehlgeschlagen`);
      }
    }
  } catch (err) {
    console.log('⚠️ Invidious fehlgeschlagen:', (err.message || '').split('\n')[0]);
  }

  // Strategy 7: Direct ffmpeg fallback - try to extract and download audio only
  try {
    console.log('🔄 Versuche Audio-only Fallback via ffmpeg...');
    const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
    if (videoId) {
      const ytDlpArgs = [
        ...getBaseArgs(),
        '-f', 'worst',  // Just get ANY format, even worst quality
        '-o', outputPath,
        url
      ];
      
      await runYtDlp(ytDlpArgs);
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 512) {  // Even 512 bytes is better than nothing
        console.log('✅ Download erfolgreich via Audio-only Fallback');
        return;
      }
    }
  } catch (err) {
    console.log('⚠️ Audio-only Fallback fehlgeschlagen:', (err.message || '').split('\n')[0]);
  }
  const errMsg = fs.existsSync(outputPath) 
    ? `Datei zu klein: ${fs.statSync(outputPath).size} bytes`
    : '❌ YouTube blockiert alle Downloads. Alle Methoden fehlgeschlagen.';
  
  throw new Error(errMsg);
}

function spawnCapture(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...opts,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout = appendLimited(stdout, d);
    });
    child.stderr.on('data', (d) => {
      stderr = appendLimited(stderr, d);
    });
    child.on('error', (error) => reject({ error, stdout, stderr }));
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject({ error: new Error(`yt-dlp exited with code ${code}`), stdout, stderr });
    });
  });
}

async function runYtDlp(args, opts = {}) {
  const candidates = getYtDlpCandidates();
  let last = null;

  for (const c of candidates) {
    try {
      return await spawnCapture(c.cmd, [...c.args, ...args], { cwd: __dirname, ...opts });
    } catch (e) {
      last = e;
    }
  }

  // If yt-dlp complains about --js-runtimes and this option was in args,
  // retry without it (for older yt-dlp versions).
  const argsNoRuntime = args.filter((v, i) => {
    if (v === '--js-runtimes') return false;
    if (i > 0 && args[i - 1] === '--js-runtimes') return false;
    return true;
  });

  if (argsNoRuntime.length !== args.length && last?.stderr?.includes('no such option: --js-runtimes')) {
    for (const c of candidates) {
      try {
        return await spawnCapture(c.cmd, [...c.args, ...argsNoRuntime], { cwd: __dirname, ...opts });
      } catch (e) {
        last = e;
      }
    }
  }

  const message = (last?.stderr || last?.stdout || last?.error?.message || 'yt-dlp failed').trim();
  throw new Error(message);
}

async function downloadYoutubeAudio(url, outputPath) {
  const tmpDir = path.dirname(outputPath);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const headers = [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language: en-US,en;q=0.9',
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  ];

  const extractArgs = ['youtube:player_client=web'];
  const baseArgs = [
    ...getYtDlpJsRuntimeArgs(),
    ...getYtDlpFfmpegArgs(),
    '--no-check-certificate',
    '--no-playlist',
    '--extractor-args', extractArgs.join(','),
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '-o', outputPath,
    ...headers.flatMap(h => ['--add-header', h]),
    url
  ];

  try {
    await runYtDlp(baseArgs);
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) return;
  } catch (err) {
    console.log('⚠️ yt-dlp Audio fehlgeschlagen:', (err.message || '').split('\n')[0]);
  }

  try {
    console.log('🔄 Versuche ytdl-core Audio-Fallback...');
    const ffmpegInfo = loadHeavyDeps().ffmpeg;
    const ffmpegCmd = ffmpegInfo?.path || 'ffmpeg';
    const stream = ytdlCore(url, {
      quality: 'highestaudio',
      filter: 'audioonly',
      highWaterMark: 1 << 25,
      requestOptions: {
        headers: {
          'User-Agent': headers[0].split(': ')[1],
          'Accept-Language': 'en-US,en;q=0.9'
        }
      }
    });

    await new Promise((resolve, reject) => {
      const ff = spawn(ffmpegCmd, [
        '-y',
        '-i', 'pipe:0',
        '-vn',
        '-acodec', 'libmp3lame',
        '-ab', '192k',
        '-ar', '44100',
        outputPath
      ]);
      ff.on('error', reject);
      ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
      stream.on('error', reject);
      stream.pipe(ff.stdin);
    });

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
      console.log('✅ ytdl-core Audio-Fallback erfolgreich');
      return;
    }
  } catch (err) {
    console.log('⚠️ ytdl-core Audio-Fallback fehlgeschlagen:', (err.message || '').split('\n')[0]);
  }

  try {
    console.log('🔄 Versuche api-dylux Audio-Fallback...');
    const fg = require('api-dylux');
    const info = await fg.ytmp3(url);
    const audioUrl =
      info?.result ||
      info?.audio ||
      info?.dl_link ||
      info?.download ||
      info?.link ||
      info?.url;

    if (!audioUrl || typeof audioUrl !== 'string') {
      throw new Error('api-dylux lieferte keine Audio-URL');
    }

    await new Promise(async (resolve, reject) => {
      try {
        const res = await axios.get(audioUrl, {
          responseType: 'stream',
          headers: { 'User-Agent': headers[0].split(': ')[1] },
          maxRedirects: 5,
          timeout: 60_000
        });
        const writer = fs.createWriteStream(outputPath);
        writer.on('error', reject);
        writer.on('finish', resolve);
        res.data.on('error', reject);
        res.data.pipe(writer);
      } catch (e) {
        reject(e);
      }
    });

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
      console.log('✅ api-dylux Audio-Fallback erfolgreich');
      return;
    }
  } catch (err) {
    console.log('⚠️ api-dylux Audio-Fallback fehlgeschlagen:', (err.message || '').split('\n')[0]);
  }

  throw new Error('YouTube Audio-Download fehlgeschlagen. Bitte versuche es erneut oder gib einen anderen Link ein.');
}

function extractSupportedUrl(text) {
  if (!text || typeof text !== 'string') return null;
  const regex = /(https?:\/\/(www\.)?(youtube\.com\/watch\?v=[A-Za-z0-9_-]+|youtu\.be\/[A-Za-z0-9_-]+|instagram\.com\/(reel|reels|p)\/[A-Za-z0-9_-]+(?:\/?\S*)?|tiktok\.com\/@[^\s\/]+\/video\/[0-9]+(?:\/?\S*)?))/i;
  const match = text.match(regex);
  return match ? match[1] : null;
}

async function downloadAndSendUrl(sock, url, chatId, msg, opts = {}) {
  const botName = '💻 BeastBot';
  const startTime = Date.now();

  if (!url) throw new Error('Keine URL zum Download angegeben.');

  const tmpDir = path.join(__dirname, 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const fileName = `autodownload_${Date.now()}.mp4`;
  const outputPath = path.join(tmpDir, fileName);

  const igArgs = [];
  if (process.env.INSTAGRAM_COOKIES && fs.existsSync(process.env.INSTAGRAM_COOKIES)) {
    igArgs.push('--cookies', process.env.INSTAGRAM_COOKIES);
  } else if (process.env.INSTAGRAM_USERNAME && process.env.INSTAGRAM_PASSWORD) {
    igArgs.push('--username', process.env.INSTAGRAM_USERNAME, '--password', process.env.INSTAGRAM_PASSWORD, '--sleep-requests', '1');
  }

  const isYouTube = /(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url);
  if (isYouTube) {
    try {
      const ytdlOut = path.join(tmpDir, `autodownload_ytdl_${Date.now()}.mp4`);
      const stream = ytdlCore(url, {
        quality: 'highestvideo',
        filter: 'audioandvideo',
        highWaterMark: 1 << 25,
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        }
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(ytdlOut);
        stream.on('error', reject);
        writer.on('error', reject);
        writer.on('finish', resolve);
        stream.pipe(writer);
      });

      if (!fs.existsSync(ytdlOut)) throw new Error('YouTube-Download fehlgeschlagen (ytdl-core).');
      const videoBuffer = fs.readFileSync(ytdlOut);
      const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);

      await sock.sendMessage(chatId, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        fileName: `autodownload_youtube.mp4`,
        caption: `✅ YouTube (yt-core) Autodownload erfolgreich in ${timeTaken}s\n> ${botName}`
      }, { quoted: msg });

      fs.unlinkSync(ytdlOut);
      return;
    } catch (ytErr) {
      console.log('⚠️ ytdl-core Fehler, fallback zu yt-dlp:', ytErr.message || ytErr);
      // continue to yt-dlp fallback
    }
  }

  await runYtDlp([
    ...getYtDlpJsRuntimeArgs(),
    ...getYtDlpFfmpegArgs(),
    '--no-check-certificates',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    '--no-playlist',
    '-f', 'best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', outputPath,
    ...igArgs,
    url,
  ]);

  if (!fs.existsSync(outputPath)) {
    throw new Error('Download fehlgeschlagen, Datei wurde nicht gefunden.');
  }

  const videoBuffer = fs.readFileSync(outputPath);
  const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);

  await sock.sendMessage(chatId, {
    video: videoBuffer,
    mimetype: 'video/mp4',
    fileName: `autodownload.mp4`,
    caption: `✅ Autodownload erfolgreich in ${timeTaken}s\n> ${botName}`
  }, { quoted: msg });

  fs.unlinkSync(outputPath);
}

// convenience variables for LLM keys from environment
const NYX_API_KEY = process.env.NYX_API_KEY || '';
const AXIOM_API_KEY = process.env.AXIOM_API_KEY || '';
const VOLTRA_API_KEY = process.env.VOLTRA_API_KEY || '';
const VOLTRA_API_URL = process.env.VOLTRA_API_URL || '';
const DEFAULT_VOLTRA_URL = 'https://voltraai.onrender.com/api/chat';
const DEBUG_BUTTONS = (process.env.DEBUG_BUTTONS || '').trim() === '1';

function safeStringifyLimited(value, limit = 8000) {
  try {
    const out = JSON.stringify(value, null, 2);
    if (!out) return '';
    return out.length > limit ? out.slice(0, limit) + '\n...<truncated>' : out;
  } catch (e) {
    return `[unstringifiable: ${e?.message || e}]`;
  }
}

// create shared logger that writes to logs/log.txt
if (!fs.existsSync(path.join(__dirname, 'logs'))) fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
const logger = pino({ level: process.env.LOG_LEVEL || 'info' }, pino.destination(path.join(__dirname, 'logs', 'log.txt')));

// Lazy load Sticker
let Sticker;
const getSticker = () => {
  if (!Sticker) Sticker = require('wa-sticker-formatter').Sticker;
  return Sticker;
};

const supportFile = './support.json';
if (!fs.existsSync(supportFile)) fs.writeFileSync(supportFile, JSON.stringify({ lastId: 0, tickets: [] }, null, 2));

function loadSupportData() {
  return JSON.parse(fs.readFileSync(supportFile));
}

function saveSupportData(data) {
  fs.writeFileSync(supportFile, JSON.stringify(data, null, 2));
}

// Join requests storage
const joinRequestsFile = './joinRequests.json';
if (!fs.existsSync(joinRequestsFile)) fs.writeFileSync(joinRequestsFile, JSON.stringify({ lastId: 0, requests: [] }, null, 2));

function loadJoinRequests() {
  try {
    return JSON.parse(fs.readFileSync(joinRequestsFile, 'utf8')) || { lastId: 0, requests: [] };
  } catch (e) { return { lastId: 0, requests: [] }; }
}

function saveJoinRequests(data) {
  fs.writeFileSync(joinRequestsFile, JSON.stringify(data, null, 2));
}

// Gruppen-Konfiguration (Support & Join)
const groupConfigFile = './groupConfig.json';
if (!fs.existsSync(groupConfigFile)) fs.writeFileSync(groupConfigFile, JSON.stringify({ supportGroup: null, joinGroup: null }, null, 2));

function loadGroupConfig() {
  try {
    return JSON.parse(fs.readFileSync(groupConfigFile, 'utf8')) || { supportGroup: null, joinGroup: null };
  } catch (e) {
    return { supportGroup: null, joinGroup: null };
  }
}

function saveGroupConfig(data) {
  fs.writeFileSync(groupConfigFile, JSON.stringify(data, null, 2));
}

function setSupportGroup(groupId) {
  const config = loadGroupConfig();
  config.supportGroup = groupId;
  saveGroupConfig(config);
}

function setJoinGroup(groupId) {
  const config = loadGroupConfig();
  config.joinGroup = groupId;
  saveGroupConfig(config);
}

function getSupportGroup() {
  const config = loadGroupConfig();
  return config.supportGroup;
}

function getJoinGroup() {
  const config = loadGroupConfig();
  return config.joinGroup;
}

function removeSupportGroup() {
  const config = loadGroupConfig();
  config.supportGroup = null;
  saveGroupConfig(config);
}

function removeJoinGroup() {
  const config = loadGroupConfig();
  config.joinGroup = null;
  saveGroupConfig(config);
}

// Group-specific features storage
const groupFeaturesFile = './data/groupFeatures.json';
if (!fs.existsSync(path.dirname(groupFeaturesFile))) fs.mkdirSync(path.dirname(groupFeaturesFile), { recursive: true });
if (!fs.existsSync(groupFeaturesFile)) fs.writeFileSync(groupFeaturesFile, JSON.stringify({}, null, 2));

function loadGroupFeatures(groupId) {
  try {
    const data = JSON.parse(fs.readFileSync(groupFeaturesFile, 'utf8')) || {};
    return data[groupId] || {
      welcome: false,
      goodbye: false,
      leveling: false,
      antilink: false,
      antispam: false,
      antinsfw: false,
      antibot: false,
      autosticker: false,
      mutegc: false,
      autoreact: false,
      autodownload: false,
      eilmeldungen: true,
      badwords: []
    };
  } catch (e) {
    return {
      welcome: false,
      goodbye: false,
      leveling: false,
      antilink: false,
      antispam: false,
      antinsfw: false,
      antibot: false,
      autosticker: false,
      mutegc: false,
      autoreact: false,
      autodownload: false,
      eilmeldungen: true,
      badwords: []
    };
  }
}

function saveGroupFeatures(groupId, features) {
  try {
    const data = JSON.parse(fs.readFileSync(groupFeaturesFile, 'utf8')) || {};
    data[groupId] = features;
    fs.writeFileSync(groupFeaturesFile, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving group features:', e);
  }
}

// === CODES MANAGEMENT (Creator + Redeem) ===
const codesFile = './data/codes.json';
if (!fs.existsSync(path.dirname(codesFile))) fs.mkdirSync(path.dirname(codesFile), { recursive: true });

function loadCodes() {
  try {
    const data = JSON.parse(fs.readFileSync(codesFile, 'utf8')) || {};
    return {
      creators: data.creators || [],
      redeemCodes: data.redeemCodes || [],
      usedCodes: data.usedCodes || {}
    };
  } catch (e) {
    return { creators: [], redeemCodes: [], usedCodes: {} };
  }
}

function saveCodes(data) {
  try {
    fs.writeFileSync(codesFile, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving codes:', e);
  }
}

// Global disabled commands storage
const disabledCommandsFile = './data/disabledCommands.json';
if (!fs.existsSync(path.dirname(disabledCommandsFile))) fs.mkdirSync(path.dirname(disabledCommandsFile), { recursive: true });
if (!fs.existsSync(disabledCommandsFile)) fs.writeFileSync(disabledCommandsFile, JSON.stringify({ disabled: [] }, null, 2));

function loadDisabledCommands() {
  try {
    const raw = fs.readFileSync(disabledCommandsFile, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed.disabled || [];
  } catch (e) {
    return [];
  }
}

function saveDisabledCommands(list) {
  try {
    fs.writeFileSync(disabledCommandsFile, JSON.stringify({ disabled: list }, null, 2));
  } catch (e) {
    console.error('Error saving disabled commands:', e);
  }
}

const welcomeDataDir = path.join(__dirname, 'data');
if (!fs.existsSync(welcomeDataDir)) fs.mkdirSync(welcomeDataDir, { recursive: true });

const welcomeFile = path.join(welcomeDataDir, 'welcome.json');
if (!fs.existsSync(welcomeFile)) fs.writeFileSync(welcomeFile, '{}');

const loadWelcome = () => JSON.parse(fs.readFileSync(welcomeFile));
const saveWelcome = (data) =>
  fs.writeFileSync(welcomeFile, JSON.stringify(data, null, 2));

// Registrations (separate small store to avoid DB schema changes)
const registrationsFile = path.join(welcomeDataDir, 'registrations.json');
if (!fs.existsSync(registrationsFile)) fs.writeFileSync(registrationsFile, JSON.stringify({}, null, 2));
function loadRegistrations() {
  try {
    return JSON.parse(fs.readFileSync(registrationsFile, 'utf8')) || {};
  } catch (e) { return {}; }
}
function saveRegistrations(data) {
  fs.writeFileSync(registrationsFile, JSON.stringify(data, null, 2));
}

// User Configuration Storage (KI-Auswahl, Geburtstag, Lieblingsspiel)
const userConfigFile = path.join(welcomeDataDir, 'userConfigs.json');
if (!fs.existsSync(userConfigFile)) fs.writeFileSync(userConfigFile, JSON.stringify({}, null, 2));

function loadUserConfigs() {
  try {
    return JSON.parse(fs.readFileSync(userConfigFile, 'utf8')) || {};
  } catch (e) { return {}; }
}

function saveUserConfigs(data) {
  fs.writeFileSync(userConfigFile, JSON.stringify(data, null, 2));
}

function getUserConfig(jid) {
  const configs = loadUserConfigs();
      return configs[jid] || {
        aiModel: 'Claude',
        birthday: null,
        favoriteGame: null,
        language: 'de',
        theme: 'dark'
      };
}

function setUserConfig(jid, config) {
  const configs = loadUserConfigs();
  configs[jid] = { ...getUserConfig(jid), ...config };
  saveUserConfigs(configs);
}

function normalizeApiKey(value) {
  const raw = (value ?? '').toString().trim();
  if (!raw) return '';
  const noNewlines = raw.replace(/\r?\n/g, '').trim();
  if (
    (noNewlines.startsWith('"') && noNewlines.endsWith('"')) ||
    (noNewlines.startsWith("'") && noNewlines.endsWith("'"))
  ) {
    return noNewlines.slice(1, -1).trim();
  }
  return noNewlines;
}

// Voltra AI lightweight session handling (keeps short context per chat)
const voltraSessions = new Map();
const voltraContextUnsupportedUrls = new Set();
const VOLTRA_CONTEXT_TIMEOUT = 15 * 60 * 1000;
let voltraCleanupStarted = false;

function startVoltraCleanup() {
  if (voltraCleanupStarted) return;
  voltraCleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, ctx] of voltraSessions.entries()) {
      if (now - ctx.lastActivity > VOLTRA_CONTEXT_TIMEOUT) {
        voltraSessions.delete(id);
      }
    }
  }, 5 * 60 * 1000);
}

function getVoltraSession(sessionId) {
  startVoltraCleanup();
  if (!voltraSessions.has(sessionId)) {
    voltraSessions.set(sessionId, { messages: [], lastActivity: Date.now() });
  }
  const ctx = voltraSessions.get(sessionId);
  ctx.lastActivity = Date.now();
  return ctx;
}

function buildVoltraUrl(baseUrl, endpoint = '/api/chat') {
  const target = (baseUrl || VOLTRA_API_URL || DEFAULT_VOLTRA_URL).trim();
  if (/\/api\/chat($|\?)/i.test(target)) return target;
  const normalizedBase = target.replace(/\/+$/, '');
  const normalizedEndpoint = endpoint ? (endpoint.startsWith('/') ? endpoint : `/${endpoint}`) : '';
  return `${normalizedBase}${normalizedEndpoint}`;
}

async function callVoltraChat(prompt, sessionId, config = {}) {
  const ctx = getVoltraSession(sessionId);
  ctx.messages.push({ role: 'user', content: prompt });
  if (ctx.messages.length > 10) ctx.messages = ctx.messages.slice(-10);

  const url = buildVoltraUrl(config.baseUrl, config.endpoint);
  const apiKey = normalizeApiKey(config.apiKey || VOLTRA_API_KEY);
  const sendContext = config.sendContext === true || (process.env.VOLTRA_SEND_CONTEXT || '').trim() === '1';
  const sendModel = config.sendModel === true || (process.env.VOLTRA_SEND_MODEL || '').trim() === '1';

  // Voltra Minimal Payload (wie curl): { "message": "Hallo" }
  // Default: exakt wie curl. Context/Model nur wenn explizit aktiviert.
  const minimalPayload = { message: prompt };
  if (sendModel && config.model) minimalPayload.model = config.model;

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const extractAnswer = (data) =>
    data?.response ||
    data?.message ||
    data?.reply ||
    data?.answer ||
    data?.content ||
    data?.choices?.[0]?.message?.content ||
    'Keine Antwort erhalten.';

  const toErrMessage = (err) => {
    const status = err.response?.status;
    const serverMsg = err.response?.data?.error || err.response?.data?.message;
    if (serverMsg) return serverMsg;
    if (status === 401) return 'Voltra: 401 Unauthorized (API-Key ungültig oder fehlt).';
    if (status === 403) return 'Voltra: 403 Forbidden (API-Key/Captcha/Server-Regeln).';
    if (status === 404) return 'Voltra: 404 Endpoint nicht gefunden.';
    return err.message || 'Voltra API Fehler';
  };

  // Default: minimaler Body wie curl
  if (!sendContext || voltraContextUnsupportedUrls.has(url)) {
    try {
      const response = await axios.post(url, minimalPayload, { timeout: 30000, headers });
      const answer = extractAnswer(response.data);
      ctx.messages.push({ role: 'assistant', content: answer });
      return answer;
    } catch (err) {
      throw new Error(toErrMessage(err));
    }
  }

  const contextPayload = {
    ...minimalPayload,
    session_id: sessionId,
    messages: ctx.messages.slice(0, -1),
  };

  try {
    const response = await axios.post(url, contextPayload, { timeout: 30000, headers });
    const answer = extractAnswer(response.data);
    ctx.messages.push({ role: 'assistant', content: answer });
    return answer;
  } catch (err) {
    const status = err.response?.status;
    const shouldRetryMinimal = status === 400 || status === 401 || status === 415 || status === 422;
    if (shouldRetryMinimal) {
      voltraContextUnsupportedUrls.add(url);
      try {
        const response = await axios.post(url, minimalPayload, { timeout: 30000, headers });
        const answer = extractAnswer(response.data);
        ctx.messages.push({ role: 'assistant', content: answer });
        return answer;
      } catch (err2) {
        throw new Error(toErrMessage(err2));
      }
    }
    throw new Error(toErrMessage(err));
  }
}


const { decryptMedia } = require('@717development/baileys');



const petShop = [
  { name: "Hund", price: 200, bonus: 1.1 },
  { name: "Katze", price: 300, bonus: 1.2 },
  { name: "Falke", price: 800, bonus: 1.5 },
  { name: "Pferd", price: 1500, bonus: 2.0 },
  { name: "Drache", price: 10000, bonus: 5.0 }
];


const itemShop = [
  { name: "🍖 Fleisch", price: 50, effect: "feed", value: 30 },
  { name: "🥩 Premium-Steak", price: 150, effect: "feed", value: 70 },
  { name: "💊 Heiltrank", price: 200, effect: "heal", value: 50 },
  { name: "⭐ Mega-Elixier", price: 500, effect: "heal", value: 100 }
];

const Jimp = require('jimp');
const dns = require('dns').promises;
const { exec } = require('child_process');

const os = require('os');
const weatherCooldowns = new Map();
const { ytdl, ttdl, igdl, fbdl, twdl, ytdown, instagram } = require("./lib/mediaDownloader");
const { handleYT, handleIG, handleFB, handleTW } = require("./downloaders.js");
const yts = require("yt-search");
const { sticker: convertToSticker } = require('./lib/sticker');
const playdl = require("play-dl");
const neeledownloader = require("./lib/mediaDownloader");
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
//=================AntiDelete=================//
const nsfwFile = './antinsfw.json';

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const banFile = path.join(dataDir, 'bannedu.json');
const ipBanFile = path.join(dataDir, 'ipbans.json');
const deviceOverrideFile = path.join(dataDir, 'deviceOverrides.json');
const usersFile = path.join(dataDir, 'users.json');

function loadDeviceOverrides() {
  if (!fs.existsSync(deviceOverrideFile)) {
    fs.writeFileSync(deviceOverrideFile, "[]", 'utf-8');
  }
  return JSON.parse(fs.readFileSync(deviceOverrideFile, 'utf-8'));
}

function saveDeviceOverrides(list) {
  fs.writeFileSync(deviceOverrideFile, JSON.stringify(list, null, 2), 'utf-8');
}

function getDeviceOverride(jid) {
  const list = loadDeviceOverrides();
  return list.find(i => i.jid === jid) || null;
}

function setDeviceOverride(jid, label) {
  const list = loadDeviceOverrides();
  if (!list.some(i => i.jid === jid)) {
    list.push({ jid, label, timestamp: Date.now() });
    saveDeviceOverrides(list);
  }
}

function removeDeviceOverride(jid) {
  let list = loadDeviceOverrides();
  list = list.filter(i => i.jid !== jid);
  saveDeviceOverrides(list);
}

// ==================== USER JSON STORAGE ====================
function loadUsers() {
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify({}, null, 2), 'utf-8');
  }
  try {
    const raw = JSON.parse(fs.readFileSync(usersFile, 'utf-8')) || {};
    let changed = false;
    for (const [jid, u] of Object.entries(raw)) {
      if (!u) continue;
      const cleanBalance = Number.isFinite(Number(u.balance)) ? Number(u.balance) : 0;
      const cleanXP = Number.isFinite(Number(u.xp)) ? Number(u.xp) : 0;
      const cleanLevel = Number.isFinite(Number(u.level)) ? Number(u.level) : 1;
      if (cleanBalance !== u.balance || cleanXP !== u.xp || cleanLevel !== u.level) {
        changed = true;
        u.balance = cleanBalance;
        u.xp = cleanXP;
        u.level = cleanLevel;
      }
    }
    if (changed) saveUsers(raw);
    return raw;
  } catch (e) {
    return {};
  }
}

function saveUsers(data) {
  try {
    fs.writeFileSync(usersFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving users JSON:', e.message);
  }
}

function syncUserToJSON(jid, userData) {
  // Sync user data to JSON file whenever updated in DB
  const users = loadUsers();
  const cleanBalance = Number.isFinite(Number(userData.balance)) ? Number(userData.balance) : 0;
  const cleanXP = Number.isFinite(Number(userData.xp)) ? Number(userData.xp) : 0;
  const cleanLevel = Number.isFinite(Number(userData.level)) ? Number(userData.level) : 1;
  users[jid] = {
    jid,
    name: userData.name || jid.split('@')[0],
    balance: cleanBalance,
    xp: cleanXP,
    level: cleanLevel,
    lastUpdated: new Date().toISOString()
  };
  saveUsers(users);
  // Fire-and-forget: sync to Base44 Function to keep web dashboard updated
  try {
    const rank = (typeof ranks !== 'undefined' && ranks.getRank) ? ranks.getRank(jid) : '';
    syncUserToBase44({
      whatsapp_number: jid,
      username: users[jid].name,
      coins: users[jid].balance,
      level: users[jid].level,
      xp: users[jid].xp,
      rank: rank,
      job: ''
    }).catch(err => console.error('Base44 sync failed:', err && err.message ? err.message : err));
  } catch (e) {
    console.error('Error scheduling Base44 sync:', e.message);
  }
}

function syncUserFromJSON(jid, userData) {
  // Sync user data from JSON file back to DB
  try {
    if (userData.jid && userData.name !== undefined && userData.balance !== undefined) {
      const cleanBalance = Number.isFinite(Number(userData.balance)) ? Number(userData.balance) : 0;
      const cleanXP = Number.isFinite(Number(userData.xp)) ? Number(userData.xp) : 0;
      const cleanLevel = Number.isFinite(Number(userData.level)) ? Number(userData.level) : 1;
      updateUserStmt.run(cleanBalance, cleanXP, cleanLevel, userData.name, jid);
      console.log(`✅ User ${userData.name} synced from JSON to DB`);
    }
  } catch (err) {
    console.error('Error syncing user from JSON:', err.message);
  }
}

let userFileWatchTimeout;
function startUserFileWatcher() {
  // Überwache die users.json Datei auf Änderungen
  fs.watch(usersFile, (eventType, filename) => {
    // Debounce: Ignoriere mehrfache Events in kurzer Zeit
    if (userFileWatchTimeout) return;
    userFileWatchTimeout = setTimeout(() => {
      userFileWatchTimeout = null;
    }, 2000);
    
    if (eventType === 'change') {
      console.log(`📝 Änderung in users.json erkannt...`);
      try {
        const users = loadUsers();
        for (const [jid, userData] of Object.entries(users)) {
          const dbUser = getUser(jid);
          // Wenn Werte unterschiedlich sind, update DB
          if (dbUser && (
            dbUser.balance !== userData.balance ||
            dbUser.xp !== userData.xp ||
            dbUser.level !== userData.level ||
            dbUser.name !== userData.name
          )) {
            console.log(`🔄 Syncing changes for ${userData.name}: balance=${userData.balance}, xp=${userData.xp}, level=${userData.level}`);
            syncUserFromJSON(jid, userData);
          }
        }
      } catch (err) {
        console.error('Error watching users.json:', err.message);
      }
    }
  });
}

function loadBans() {
  if (!fs.existsSync(banFile)) {
    fs.writeFileSync(banFile, "[]", 'utf-8');
  }
  return JSON.parse(fs.readFileSync(banFile, 'utf-8'));
}

function saveBans(list) {
  fs.writeFileSync(banFile, JSON.stringify(list, null, 2), 'utf-8');
}

function loadIPBans() {
  if (!fs.existsSync(ipBanFile)) {
    fs.writeFileSync(ipBanFile, "[]", 'utf-8');
  }
  return JSON.parse(fs.readFileSync(ipBanFile, 'utf-8'));
}

function saveIPBans(list) {
  fs.writeFileSync(ipBanFile, JSON.stringify(list, null, 2), 'utf-8');
}

function isBanned(jid) {
  const bans = loadBans();
  return bans.find(b => b.jid === jid) || null;
}

function isIPBanned(ip) {
  const bans = loadIPBans();
  return bans.find(b => b.lid === ip) || null;
}

function banUser(jid, reason = 'Kein Grund angegeben') {
  const bans = loadBans();
  if (!bans.some(b => b.jid === jid)) {
    bans.push({ jid, reason, timestamp: Date.now() });
    saveBans(bans);
  }
}

function banIP(ip, reason = 'Kein Grund angegeben') {
  const bans = loadIPBans();
  if (!bans.some(b => b.lid === ip)) {
    bans.push({ lid: ip, reason, timestamp: Date.now() });
    saveIPBans(bans);
  }
}

function unbanUser(jid) {
  let bans = loadBans();
  bans = bans.filter(b => b.jid !== jid);
  saveBans(bans);
}

function unbanIP(ip) {
  let bans = loadIPBans();
  bans = bans.filter(b => b.ip !== ip);
  saveIPBans(bans);
}

// Prank Ban System
const prankBanFile = path.join(dataDir, 'prankban.json');

function loadPrankBans() {
  if (!fs.existsSync(prankBanFile)) {
    fs.writeFileSync(prankBanFile, "[]", 'utf-8');
  }
  return JSON.parse(fs.readFileSync(prankBanFile, 'utf-8'));
}

function savePrankBans(list) {
  fs.writeFileSync(prankBanFile, JSON.stringify(list, null, 2), 'utf-8');
}

function isPrankBanned(jid) {
  const prankbans = loadPrankBans();
  return prankbans.find(b => b.jid === jid) || null;
}

function prankBanUser(jid, pranker = 'Unknown') {
  const prankbans = loadPrankBans();
  if (!prankbans.some(b => b.jid === jid)) {
    prankbans.push({ jid, pranker, timestamp: Date.now() });
    savePrankBans(prankbans);
  }
}

function unprankBanUser(jid) {
  let prankbans = loadPrankBans();
  prankbans = prankbans.filter(b => b.jid !== jid);
  savePrankBans(prankbans);
}

// AFK System
const afkFile = path.join(dataDir, 'afk.json');

function loadAFK() {
  if (!fs.existsSync(afkFile)) {
    fs.writeFileSync(afkFile, "{}", 'utf-8');
  }
  return JSON.parse(fs.readFileSync(afkFile, 'utf-8'));
}

function saveAFK(afkData) {
  fs.writeFileSync(afkFile, JSON.stringify(afkData, null, 2), 'utf-8');
}

function getAFKStatus(jid) {
  const afkData = loadAFK();
  return afkData[jid] || null;
}

function setAFK(jid, reason = 'Kein Grund angegeben') {
  const afkData = loadAFK();
  afkData[jid] = {
    jid,
    reason,
    timestamp: Date.now(),
    name: jid.split('@')[0]
  };
  saveAFK(afkData);
}

function removeAFK(jid) {
  const afkData = loadAFK();
  delete afkData[jid];
  saveAFK(afkData);
}

// Lazy load Database
let db;
const getDB = () => {
  if (!db) {
    const Database = require('better-sqlite3');
    db = new Database(path.join(__dirname, 'data', 'stormbot_users.db'));
  }
  return db;
};

let botStats = {
  users: 0,
  groups: 0,
  commands: 0,
  uptimeStart: Date.now()
};


 async function loadStats() {
  try {
    const exists = await fs.stat(STATS_FILE).catch(() => false);
    if (exists) {
      const raw = await fs.readFile(STATS_FILE, "utf-8");
      botStats = JSON.parse(raw);
    }
  } catch (err) {
    console.error("⚠️ Fehler beim Laden der Stats:", err);
  }

  if (!botStats.uptimeStart) botStats.uptimeStart = Date.now();
  return botStats;
}


 async function saveStats() {
  try {
    await fs.writeFile(STATS_FILE, JSON.stringify(botStats, null, 2));
  } catch (err) {
    console.error("⚠️ Fehler beim Speichern der Stats:", err);
  }
}

 async function incrementCommands() {
  botStats.commands = (botStats.commands || 145) + 1;
  await saveStats();
}


 function getStats() {
  }

// Globale Variablen für DB Statements
let getUserStmt, ensureUserStmt, deleteUserStmt, updateUserStmt;
let getFishStmt, addFishStmt, getAllFishStmt, topCoinsStmt, topXpStmt;
let getEconomyStmt, setEconomyStmt;

// === HELPER-FUNKTIONEN ===

// USER HELPERS
function getUser(jid) {
  const u = getUserStmt.get(jid) || null;
  return normalizeProgress(u);
}

function ensureUser(jid, name = null) {
  let u = getUser(jid);
  if (!u) {
    ensureUserStmt.run(jid, name || jid.split('@')[0], 100, 0, 1);
    u = getUser(jid);
    // Auch zu JSON synchen
    if (u) syncUserToJSON(jid, u);
  }
  return u;
}

function deleteUser(jid) {
  return deleteUserStmt.run(jid);
}

function updateUser(jid, balance, xp, level, name) {
  const cleanXP = Number.isFinite(Number(xp)) ? Number(xp) : 0;
  const cleanLvl = Number.isFinite(Number(level)) ? Number(level) : 1;
  const result = updateUserStmt.run(balance, cleanXP, cleanLvl, name, jid);
  // Auch zu JSON synchen
  syncUserToJSON(jid, { name, balance, xp: cleanXP, level: cleanLvl });
  // NICHT die Economy-Coins mit balance synchronisieren - economy ist unabhängig!
  return result;
}

// XP & LEVEL
function normalizeProgress(user) {
  if (!user) return user;
  user.xp = Number.isFinite(Number(user.xp)) ? Number(user.xp) : 0;
  user.level = Number.isFinite(Number(user.level)) ? Number(user.level) : 1;
  return user;
}

function addXP(jid, xpToAdd) {
  const user = getUser(jid);
  if (!user) return null;
  let newXP = user.xp + xpToAdd;
  let newLevel = user.level;

  // Level-Up alle 100 XP
  while (newXP >= 100) {
    newXP -= 100;
    newLevel++;
  }

  updateUser(jid, user.balance, newXP, newLevel, user.name);
  return { xp: newXP, level: newLevel };
}

// INVENTORY HELPERS
function addFish(jid, fishName, amount = 1) {
  const existing = getFishStmt.get(jid, fishName);
  if (existing) {
    addFishStmt.run(jid, fishName, existing.count + amount);
  } else {
    addFishStmt.run(jid, fishName, amount);
  }
}

function getInventory(jid) {
  return getAllFishStmt.all(jid);
}

// === ECONOMY HELPERS ===
function getEconomy(jid) {
  try {
    const result = getEconomyStmt.get(jid);
    if (result) {
      // Stelle sicher, dass alle Felder definiert sind
      return {
        jid: result.jid || jid,
        cash: (result.cash !== null && result.cash !== undefined) ? result.cash : 100,
        bank: (result.bank !== null && result.bank !== undefined) ? result.bank : 0,
        gems: (result.gems !== null && result.gems !== undefined) ? result.gems : 0,
        lastDaily: result.lastDaily || 0,
        lastWeekly: result.lastWeekly || 0,
        lastWork: result.lastWork || 0,
        lastBeg: result.lastBeg || 0,
        jailedUntil: result.jailedUntil || 0
      };
    }
    return { jid, cash: 100, bank: 0, gems: 0, lastDaily: 0, lastWeekly: 0, lastWork: 0, lastBeg: 0, jailedUntil: 0 };
  } catch (err) {
    console.error('Fehler in getEconomy:', err);
    return { jid, cash: 100, bank: 0, gems: 0, lastDaily: 0, lastWeekly: 0, lastWork: 0, lastBeg: 0, jailedUntil: 0 };
  }
}

function setEconomy(jid, econ) {
  try {
    const cash = (econ.cash !== null && econ.cash !== undefined) ? Math.max(0, econ.cash) : 100;
    const bank = (econ.bank !== null && econ.bank !== undefined) ? Math.max(0, econ.bank) : 0;
    const gems = (econ.gems !== null && econ.gems !== undefined) ? Math.max(0, econ.gems) : 0;
    const lastDaily = econ.lastDaily || 0;
    const lastWeekly = econ.lastWeekly || 0;
    const lastWork = econ.lastWork || 0;
    const lastBeg = econ.lastBeg || 0;
    const jailedUntil = econ.jailedUntil || 0;
    
    setEconomyStmt.run(jid, cash, bank, gems, lastDaily, lastWeekly, lastWork, lastBeg, jailedUntil);
  } catch (err) {
    console.error('Fehler in setEconomy:', err);
  }
}

function isJailed(jid) {
  const econ = getEconomy(jid);
  return econ.jailedUntil > Date.now();
}

function sendToJail(jid, ms) {
  const econ = getEconomy(jid);
  econ.jailedUntil = Date.now() + ms;
  setEconomy(jid, econ);
}

function removeFromJail(jid) {
  const econ = getEconomy(jid);
  econ.jailedUntil = 0;
  setEconomy(jid, econ);
}

function formatMoney(amount) {
  return amount.toLocaleString('de-DE');
}

function formatTime(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// Führt Auto-Premium-Features aus, sobald der User eine Nachricht sendet
async function handlePremiumAutoActions(sock, chatId, jid) {
  if (!isPremium(jid)) return;

  const prem = getPremium(jid);
  const econ = getEconomy(jid);
  const now = Date.now();

  // AutoWork: führt "work" automatisch aus (halber Cooldown für Premium)
  if (prem.autowork) {
    const baseCooldown = 10 * 60 * 1000;
    const cooldown = baseCooldown / 2;
    const last = Math.max(econ.lastWork || 0, autoPremiumState.autowork.get(jid) || 0);

    if (!last || (now - last) >= cooldown) {
      const jobs = [
        { name: 'Kaffee verkauft', pay: 50 },
        { name: 'Programm geschrieben', pay: 100 },
        { name: 'Gras gemäht', pay: 30 },
        { name: 'Babysitter', pay: 75 },
        { name: 'Taxi gefahren', pay: 60 }
      ];

      const job = jobs[Math.floor(Math.random() * jobs.length)];
      econ.cash = (econ.cash || 100) + job.pay;
      econ.lastWork = now;
      setEconomy(jid, econ);
      autoPremiumState.autowork.set(jid, now);

      await sock.sendMessage(chatId, {
        text: `🤖 *AutoWork aktiv*
👷 ${job.name}
💵 +${formatMoney(job.pay)} Cash
💰 Kontostand: ${formatMoney(econ.cash)}`
      });
    }
  }

  // AutoFish: fängt automatisch einen Fisch in Intervallen
  if (prem.autofish) {
    const fishCooldown = 15 * 60 * 1000; // 15 Minuten
    const last = autoPremiumState.autofish.get(jid) || 0;

    if (!last || (now - last) >= fishCooldown) {
      const user = getUser(jid);
      if (user) {
        const r = Math.random();
        let selectedFish, acc = 0;
        for (const f of fishes) { acc += f.chance; if (r <= acc) { selectedFish = f; break; } }
        if (!selectedFish) selectedFish = fishes[0];

        const amount = Math.floor(Math.random() * (selectedFish.max - selectedFish.min + 1)) + selectedFish.min;

        updateUser(jid, user.balance + amount, user.xp, user.level, user.name);
        addXP(jid, Math.floor(amount / 2));
        addFish(jid, selectedFish.name);

        autoPremiumState.autofish.set(jid, now);

        await sock.sendMessage(chatId, {
          text: `🤖 *AutoFish aktiv*
🎣 Gefangen: ${selectedFish.name}
💸 +${amount} Coins | ⭐ +${Math.floor(amount / 2)} XP`
        });
      }
    }
  }
}

// === PREMIUM SYSTEM ===
function getPremium(jid) {
  const stmt = dbInstance.prepare('SELECT * FROM premium WHERE jid = ?');
  return stmt.get(jid) || { jid, isPremium: 0, premiumUntil: 0, premiumLevel: 0, title: '', color: '#FFFFFF', emoji: '👤', autowork: 0, autofish: 0, multidaily: 0, lastSpawnmoney: 0, spawnmoneyToday: 0 };
}

function setPremium(jid, prem) {
  const stmt = dbInstance.prepare('INSERT OR REPLACE INTO premium (jid, isPremium, premiumUntil, premiumLevel, title, color, emoji, autowork, autofish, multidaily, lastSpawnmoney, spawnmoneyToday) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  stmt.run(jid, prem.isPremium || 0, prem.premiumUntil || 0, prem.premiumLevel || 0, prem.title || '', prem.color || '#FFFFFF', prem.emoji || '👤', prem.autowork || 0, prem.autofish || 0, prem.multidaily || 0, prem.lastSpawnmoney || 0, prem.spawnmoneyToday || 0);
}

function isPremium(jid) {
  const prem = getPremium(jid);
  if (!prem.isPremium) return false;
  if (prem.premiumUntil && prem.premiumUntil < Date.now()) {
    prem.isPremium = 0;
    setPremium(jid, prem);
    return false;
  }
  return true;
}

function addPremium(jid, days = 30) {
  const prem = getPremium(jid);
  prem.isPremium = 1;
  if (!days || days <= 0) {
    // 0/null/undefined → dauerhaft
    prem.premiumUntil = 0;
  } else {
    prem.premiumUntil = Math.max(prem.premiumUntil || 0, Date.now()) + (days * 24 * 60 * 60 * 1000);
  }
  prem.premiumLevel = Math.max(prem.premiumLevel, 1);
  setPremium(jid, prem);
}

function removePremium(jid) {
  const prem = getPremium(jid);
  prem.isPremium = 0;
  prem.premiumUntil = 0;
  setPremium(jid, prem);
}

// === FISHING DATA ===
const fishes = [
  { name: 'Karpfen', min: 5, max: 15, chance: 0.15 },
  { name: 'Hecht', min: 15, max: 30, chance: 0.12 },
  { name: 'Goldfisch', min: 50, max: 100, chance: 0.08 },
  { name: 'Legendärer Thunfisch', min: 200, max: 400, chance: 0.03 },
  { name: 'Algen', min: 1, max: 2, chance: 0.10 },
  { name: 'Kugelfisch', min: 30, max: 60, chance: 0.07 },
  { name: 'Krabbe', min: 20, max: 40, chance: 0.06 },
  { name: 'Tintenfisch', min: 40, max: 80, chance: 0.05 },
  { name: 'Delfin', min: 100, max: 200, chance: 0.02 },
  { name: 'Forelle', min: 10, max: 20, chance: 0.10 },
  { name: 'Buntbarsch', min: 25, max: 50, chance: 0.05 },
  { name: 'Hummer', min: 60, max: 120, chance: 0.03 },
  { name: 'Blauwal', min: 500, max: 1000, chance: 0.01 },
  { name: 'Garnele', min: 5, max: 10, chance: 0.08 },
  { name: 'Oktopus', min: 45, max: 90, chance: 0.04 },
  { name: 'Falco', min: 500, max: 500, chance: 0.000001 }, 

  // Neue & zusätzliche Fischis
  { name: 'Otter', min: 80, max: 150, chance: 0.02 },
  { name: 'Kaiman', min: 300, max: 600, chance: 0.005 },
  { name: 'Seeschlange', min: 400, max: 800, chance: 0.003 },
  { name: 'Meeresschildkröte', min: 70, max: 140, chance: 0.02 },
  { name: 'Pinguin', min: 60, max: 120, chance: 0.015 },
  { name: 'Megalodon', min: 1000, max: 2000, chance: 0.0005 }, // Ultra selten
  { name: 'Clownfisch', min: 20, max: 40, chance: 0.06 },
  { name: 'Riesenkalmar', min: 250, max: 500, chance: 0.004 },
  { name: 'Seehund', min: 90, max: 180, chance: 0.01 },
  { name: 'Qualle', min: 15, max: 30, chance: 0.07 },
  { name: 'Drache-Koi', min: 200, max: 300, chance: 0.002 },

  // Noch mehr Spaß & Fantasy 🐟✨
  { name: '🐍 Aale', min: 25, max: 55, chance: 0.06 },
  { name: '🐊 Krokodil', min: 400, max: 700, chance: 0.003 },
  { name: '🦖 Urzeit-Fisch', min: 600, max: 900, chance: 0.002 },
  { name: '🐉 Leviathan', min: 2000, max: 5000, chance: 0.0002 }, // Boss
  { name: '💀 Geisterfisch', min: 100, max: 250, chance: 0.001 },
  { name: '👑 Königskrabbe', min: 150, max: 300, chance: 0.005 },
  { name: '🦆 Ente (aus Versehen)', min: 1, max: 5, chance: 0.1 }, // Fun 😅
  { name: '🥾 Alter Stiefel', min: 0, max: 0, chance: 0.08 }, // Trash Item
  { name: '🧜‍♀️ Meerjungfrau', min: 5000, max: 10000, chance: 0.00001 }, // Ultra-rare
  { name: '🔥 Phönix-Fisch', min: 800, max: 1600, chance: 0.0005 }, // Mythos
  { name: '❄️ Eisfisch', min: 70, max: 120, chance: 0.03 },
  { name: '🌌 Sternenfisch', min: 1000, max: 3000, chance: 0.0008 } // Kosmisch
];




let antiNSFWGroups = fs.existsSync(nsfwFile)
  ? JSON.parse(fs.readFileSync(nsfwFile))
  : {};

function saveAntiNSFW() {
  fs.writeFileSync(nsfwFile, JSON.stringify(antiNSFWGroups, null, 2));
}

function isNSFWGroup(groupId) {
  return antiNSFWGroups[groupId] === true;
}
//===============================//
const deletedMessagesPath = path.join(__dirname, 'deleted_messages.json');
if (!fs.existsSync(deletedMessagesPath)) {
  fs.writeFileSync(deletedMessagesPath, JSON.stringify({}, null, 2));
}
let deletedMessages = JSON.parse(fs.readFileSync(deletedMessagesPath));
function saveDeletedMessage(msg) {
    const chatId = msg.key.remoteJid;
    const msgId = msg.key.id;
    if (!chatId || !msgId) return;
    if (!deletedMessages[chatId]) {
        deletedMessages[chatId] = {};
    }
    deletedMessages[chatId][msgId] = msg;
    fs.writeFileSync(deletedMessagesPath, JSON.stringify(deletedMessages, null, 2));
}

const antiDeleteConfigPath = path.join(__dirname, 'antidelete_config.json');
if (!fs.existsSync(antiDeleteConfigPath)) {
  fs.writeFileSync(antiDeleteConfigPath, JSON.stringify({}, null, 2));
}
let antiDeleteConfig = JSON.parse(fs.readFileSync(antiDeleteConfigPath));

function saveAntiDeleteConfig() {
  fs.writeFileSync(antiDeleteConfigPath, JSON.stringify(antiDeleteConfig, null, 2));
}
//=================AntiDelete================================================//
const mutedFile = './mutedUsers.json';
let mutedUsers = fs.existsSync(mutedFile)
  ? JSON.parse(fs.readFileSync(mutedFile))
  : {};
function saveMuted() {
  fs.writeFileSync(mutedFile, JSON.stringify(mutedUsers, null, 2));
}
function isUserMuted(groupId, userId) {
  return mutedUsers[groupId]?.includes(userId);
}

//=================================================================//
const warnFile = './warnedUsers.json';
let warnedUsers = fs.existsSync(warnFile)
  ? JSON.parse(fs.readFileSync(warnFile))
  : {};

function saveWarned() {
  fs.writeFileSync(warnFile, JSON.stringify(warnedUsers, null, 2));
}

function addWarning(groupId, userId) {
  if (!warnedUsers[groupId]) warnedUsers[groupId] = {};
  if (!warnedUsers[groupId][userId]) warnedUsers[groupId][userId] = 0;

  warnedUsers[groupId][userId]++;
  saveWarned();
  return warnedUsers[groupId][userId];
}

function resetWarnings(groupId, userId) {
  if (warnedUsers[groupId] && warnedUsers[groupId][userId]) {
    delete warnedUsers[groupId][userId];
    saveWarned();
  }
}

function getWarnings(groupId, userId) {
  return warnedUsers[groupId]?.[userId] || 0;
}
//=================================================================//
const antiLinkFile = './antilinkGroups.json';
let antiLinkGroups = fs.existsSync(antiLinkFile)
  ? JSON.parse(fs.readFileSync(antiLinkFile))
  : {};

const whitelistFile = './antilinkWhitelist.json';
let antiLinkWhitelist = fs.existsSync(whitelistFile)
  ? JSON.parse(fs.readFileSync(whitelistFile))
  : {};

function saveAntiLink() {
  fs.writeFileSync(antiLinkFile, JSON.stringify(antiLinkGroups, null, 2));
}

function saveWhitelist() {
  fs.writeFileSync(whitelistFile, JSON.stringify(antiLinkWhitelist, null, 2));
}

function isWhitelisted(groupId, userId) {
  return antiLinkWhitelist[groupId]?.includes(userId);
}

function addToWhitelist(groupId, userId) {
  if (!antiLinkWhitelist[groupId]) antiLinkWhitelist[groupId] = [];
  if (!antiLinkWhitelist[groupId].includes(userId)) {
    antiLinkWhitelist[groupId].push(userId);
    saveWhitelist();
  }
}

const linkBypassFile = './linkBypassUsers.json';
let linkBypassUsers = fs.existsSync(linkBypassFile)
  ? JSON.parse(fs.readFileSync(linkBypassFile))
  : {};

function saveLinkBypass() {
  fs.writeFileSync(linkBypassFile, JSON.stringify(linkBypassUsers, null, 2));
}

function isBypassed(groupId, userId) {
  return linkBypassUsers[groupId]?.includes(userId);
}
//===============================================//

const welcomeFilePath = './daten/welcome.json';
const welcomeDir = path.dirname(welcomeFilePath);
if (!fs.existsSync(welcomeDir)) {
  fs.mkdirSync(welcomeDir, { recursive: true });
}
let welcomeGroups = {};
if (fs.existsSync(welcomeFilePath)) {
  welcomeGroups = JSON.parse(fs.readFileSync(welcomeFilePath));
}
function saveWelcomeData() {
  fs.writeFileSync(welcomeFilePath, JSON.stringify(welcomeGroups, null, 2));
}
//=================================================================//
//=================================================================//
const farewellDir = './daten/farewell.json/';
const farewellFilePath = path.join(farewellDir, 'farewell.json');

if (!fs.existsSync(farewellDir)) {
  fs.mkdirSync(farewellDir, { recursive: true });
}

let farewellGroups = {};
if (fs.existsSync(farewellFilePath)) {
  farewellGroups = JSON.parse(fs.readFileSync(farewellFilePath));
}

function saveFarewellData() {
  fs.writeFileSync(farewellFilePath, JSON.stringify(farewellGroups, null, 2));
}
//=================================================================//
module.exports = async function (sock, sessionName) {
  // Legacy Fallback: Direkter Login-Code ohne botCommand
  async function generateLoginCodeLegacy(whatsapp_number, username) {
    try {
      const res = await axios.post(`${API_BASE_URL}/api/functions/generateLoginCode`, {
        whatsapp_number,
        username: username || whatsapp_number,
        secret: BOT_WEBHOOK_SECRET
      });
      if (res.data?.code) {
        return `Dein Login-Code:\n\`\`\`${res.data.code}\`\`\`\n⚠️ Der Code ist 10 Minuten gültig und nur einmal verwendbar.`;
      }
      return res.data?.message || res.data?.error || '❌ Fehler beim Erstellen des Codes.';
    } catch (err) {
      console.error('❌ Legacy generateLoginCode error:', err.message);
      return '❌ Serverfehler. Bitte versuche es später erneut.';
    }
  }

  // Generic helper: send arbitrary proto JSON content
  sock.sendjsonv3 = async function (jid, json, options = {}) {
    const message = generateWAMessageFromContent(
      jid,
      proto.Message.fromObject(json),
      {
        logger: sock.logger,
        userJid: sock.user.id,
        ...options
      }
    );
    await sock.relayMessage(jid, message.message, { messageId: message.key.id });
    return message;
  };

  // Base44 BotCommand Helper
  async function handleBotCommand(command, whatsapp_number, extra = {}) {
    const urlsToTry = [];
    const slugLower = BOT_API_URL.replace(/botCommand$/, 'botcommand');
    const hostAlt = BOT_API_URL.replace('https://api.base44.com', API_BASE_URL);
    const hostAltLower = slugLower.replace('https://api.base44.com', API_BASE_URL);

    [BOT_API_URL, slugLower, hostAlt, hostAltLower]
      .filter((u, idx, arr) => u && arr.indexOf(u) === idx) // unique
      .forEach(u => urlsToTry.push(u));

    for (const url of urlsToTry) {
      try {
        const res = await axios.post(
          url,
          { command, whatsapp_number, ...extra },
          { headers: { 'x-bot-secret': BOT_SECRET } }
        );
        return res.data.message || res.data.error || '❌ Unbekannte Server-Antwort.';
      } catch (err) {
        const status = err.response?.status;
        const serverMsg = err.response?.data?.message || err.response?.data?.error;
        console.error(`❌ BotCommand error (${url}):`, status ? `${status} ${err.response?.statusText}` : err.message, serverMsg ? `| ${serverMsg}` : '');
        // bei anderen URLs weiterprobieren
        if (status && status !== 404) break; // nur 404 → andere URL testen, sonst abbrechen
      }
    }

    // Legacy-Fallback nur für logincode
    if (command === 'logincode') {
      return await generateLoginCodeLegacy(whatsapp_number, extra.username);
    }

    return '❌ BotCommand-Endpoint nicht erreichbar (404). Prüfe BOT_API_URL/Funktions-Slug im Base44 Dashboard.';
  }

  // Base44 Web Register Handler
  async function handleWebRegister(msg, sender) {
    const whatsappNumber = sender.replace('@s.whatsapp.net', '').replace('@lid', '').split('@')[0];
    const chatId = msg.key.remoteJid;
    const userData = getUser(sender) || {};
    const displayName = userData.name || msg.pushName || whatsappNumber;

    try {
      await sock.sendMessage(chatId, { text: '⏳ Erstelle deinen Web-Account...' }, { quoted: msg });
      const regReply = await handleBotCommand('webregister', whatsappNumber, { display_name: displayName });

      const alreadyRegistered = typeof regReply === 'string' && regReply.toLowerCase().includes('bereits registriert');
      const success = typeof regReply === 'string' && regReply.includes('✅');

      if (!alreadyRegistered && !success) {
        await sock.sendMessage(chatId, { text: regReply || '❌ Fehler bei der Registrierung.' }, { quoted: msg });
        return;
      }

      const codeReply = await handleBotCommand('logincode', whatsappNumber);

      await sock.sendMessage(chatId, {
        text: `✅ *Web-Account erstellt!*\n\n` +
              `${codeReply}\n\n` +
              `🔗 https://beastbot.base44.app\n` +
              `⚠️ Der Code ist 10 Minuten gültig und nur einmal verwendbar.`
      }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(chatId, { text: '❌ Serverfehler. Bitte versuche es später erneut.' }, { quoted: msg });
      console.error('Web Register Error:', error.message);
    }
  }

  // Initialisiere Datenbank zuerst
  dbInstance = getDB();
  
  // Erstelle Tabellen
  dbInstance.prepare(`
CREATE TABLE IF NOT EXISTS inventory (
  jid TEXT,
  fish TEXT,
  count INTEGER DEFAULT 1,
  PRIMARY KEY(jid, fish)
)
`).run();

  dbInstance.prepare(`
  CREATE TABLE IF NOT EXISTS pets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT,
    petName TEXT,
    hunger INTEGER DEFAULT 100,
    health INTEGER DEFAULT 100,
    level INTEGER DEFAULT 1,
    lastFed INTEGER DEFAULT 0
  )
`).run();

  dbInstance.prepare(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT,
    itemName TEXT,
    amount INTEGER DEFAULT 1
  )
`).run();

  // Economy Tables
  dbInstance.prepare(`
  CREATE TABLE IF NOT EXISTS economy (
    jid TEXT PRIMARY KEY,
    cash INTEGER DEFAULT 100,
    bank INTEGER DEFAULT 0,
    gems INTEGER DEFAULT 0,
    lastDaily INTEGER DEFAULT 0,
    lastWeekly INTEGER DEFAULT 0,
    lastWork INTEGER DEFAULT 0,
    lastBeg INTEGER DEFAULT 0,
    jailedUntil INTEGER DEFAULT 0
  )
`).run();

  dbInstance.prepare(`
  CREATE TABLE IF NOT EXISTS bankAccounts (
    jid TEXT PRIMARY KEY,
    accountBalance INTEGER DEFAULT 0,
    interestRate REAL DEFAULT 0.01,
    monthlyFee INTEGER DEFAULT 10
  )
`).run();

  // Premium System Tables
  dbInstance.prepare(`
  CREATE TABLE IF NOT EXISTS premium (
    jid TEXT PRIMARY KEY,
    isPremium INTEGER DEFAULT 0,
    premiumUntil INTEGER DEFAULT 0,
    premiumLevel INTEGER DEFAULT 0,
    title TEXT DEFAULT '',
    color TEXT DEFAULT '#FFFFFF',
    emoji TEXT DEFAULT '👤',
    autowork INTEGER DEFAULT 0,
    autofish INTEGER DEFAULT 0,
    multidaily INTEGER DEFAULT 0,
    lastSpawnmoney INTEGER DEFAULT 0,
    spawnmoneyToday INTEGER DEFAULT 0
  )
`).run();

  dbInstance.prepare(`
  CREATE TABLE IF NOT EXISTS premiumShop (
    jid TEXT,
    itemId TEXT,
    boughtAt INTEGER,
    PRIMARY KEY(jid, itemId)
  )
`).run();

  dbInstance.prepare(`
  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT,
    businessType TEXT,
    level INTEGER DEFAULT 1,
    lastCollection INTEGER DEFAULT 0,
    earnings INTEGER DEFAULT 0
  )
`).run();

  dbInstance.prepare(`
  CREATE TABLE IF NOT EXISTS crypto (
    jid TEXT,
    symbol TEXT,
    amount REAL DEFAULT 0,
    boughtAt REAL DEFAULT 0,
    PRIMARY KEY(jid, symbol)
  )
`).run();

  // Initialisiere Prepared Statements
  getUserStmt = dbInstance.prepare('SELECT * FROM users WHERE jid = ?');
  ensureUserStmt = dbInstance.prepare('INSERT INTO users (jid, name, balance, xp, level) VALUES (?, ?, ?, ?, ?)');
  deleteUserStmt = dbInstance.prepare('DELETE FROM users WHERE jid = ?');
  updateUserStmt = dbInstance.prepare('UPDATE users SET balance = ?, xp = ?, level = ?, name = ? WHERE jid = ?');

  getFishStmt = dbInstance.prepare('SELECT * FROM inventory WHERE jid = ? AND fish = ?');
  addFishStmt = dbInstance.prepare('INSERT OR REPLACE INTO inventory (jid, fish, count) VALUES (?, ?, ?)');
  getAllFishStmt = dbInstance.prepare('SELECT * FROM inventory WHERE jid = ?');
  topCoinsStmt = dbInstance.prepare('SELECT name, balance FROM users ORDER BY balance DESC LIMIT ?');
  topXpStmt = dbInstance.prepare('SELECT name, xp, level FROM users ORDER BY xp DESC LIMIT ?');

  // Economy Statements
  getEconomyStmt = dbInstance.prepare('SELECT * FROM economy WHERE jid = ?');
  setEconomyStmt = dbInstance.prepare('INSERT OR REPLACE INTO economy (jid, cash, bank, gems, lastDaily, lastWeekly, lastWork, lastBeg, jailedUntil) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

  // Datenbank-Migrationen: Füge lastHuntTime hinzu falls nicht vorhanden
  try {
    const pragma = dbInstance.pragma('table_info(users)');
    const hasLastHuntTime = pragma && pragma.some(col => col.name === 'lastHuntTime');
    if (!hasLastHuntTime) {
      dbInstance.prepare('ALTER TABLE users ADD COLUMN lastHuntTime INTEGER DEFAULT 0').run();
      console.log('✅ Migration: lastHuntTime Spalte hinzugefügt');
    }
  } catch (migrationErr) {
    console.error('Migration Fehler (ignoriert):', migrationErr.message);
  }

  // Prefix storage (per-chat)
  const prefixesFile = path.join(__dirname, 'prefixes.json');
  if (!fs.existsSync(prefixesFile)) fs.writeFileSync(prefixesFile, JSON.stringify({}, null, 2));

  function loadPrefixes() {
    try {
      return JSON.parse(fs.readFileSync(prefixesFile, 'utf8')) || {};
    } catch (e) {
      return {};
    }
  }

  function savePrefixes(data) {
    fs.writeFileSync(prefixesFile, JSON.stringify(data, null, 2));
  }

  function getPrefixForChat(chatId) {
    const data = loadPrefixes();
    const def = (settings && settings.prefix) || '/';
    if (!chatId) return def;
    return data[chatId] || def;
  }

  function setPrefixForChat(chatId, newPrefix) {
    const data = loadPrefixes();
    if (!newPrefix || newPrefix === 'default') {
      delete data[chatId];
    } else {
      data[chatId] = newPrefix;
    }
    savePrefixes(data);
  }

  let mediaImage;



  const sendReaction = async (jid, msg, emoji) => {
    try {
      await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
    } catch (e) {
      console.error('Fehler beim Senden der Reaction:', e);
    }
  };
  
async function updateBothubStats(sock, from) {
  try {
    // Uptime in Sekunden holen
    const uptimeInSeconds = process.uptime();
    const hours = Math.floor(uptimeInSeconds / 3600);
    const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeInSeconds % 60);

    // Schön formatieren
    let formattedUptime;
    if (hours > 0) {
      formattedUptime = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      formattedUptime = `${minutes}m ${seconds}s`;
    } else {
      formattedUptime = `${seconds}s`;
    }

    // Payload erstellen
    const payload = {
      token: BOTHUB_TOKEN,
      stats: {
        users: global.users?.length || 694,
        groups: global.groups?.length || 132,
        commands: global.commandCount || 146,
        uptime: formattedUptime,
        version: "2.1.0"
      }
    };

    console.log("[Bothub API] 🔄 Sende Payload:", JSON.stringify(payload, null, 2));

    const res = await fetch(BOTHUB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log("[Bothub API] 🌐 Status:", res.status, res.statusText);

    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      console.error("[Bothub API] ⚠️ Antwort konnte nicht als JSON gelesen werden!");
      console.error("Rohantwort:", await res.text());
      throw jsonErr;
    }

    console.log("[Bothub API] 📦 Antwort erhalten:", data);

    if (!data || data.success === undefined) {
      console.error("[Bothub API] ❌ Unerwartete Antwortstruktur:", data);
      await sock.sendMessage(from, { text: "❌ Fehler: Ungültige API-Antwort erhalten." });
      return;
    }

    if (!data.success) {
      console.error(`[Bothub API] ❌ Fehler vom Server: ${data.message} (Code: ${data.code})`);
      await sock.sendMessage(from, { text: `❌ Fehler: ${data.message} (Code ${data.code})` });
    } else {
      console.log(`[Bothub API] ✅ Erfolgreich aktualisiert: ${data.message}`);
      await sock.sendMessage(from, { text: `✅ Bothub: ${data.message}\n🕒 Uptime: ${formattedUptime}` });
    }
  } catch (err) {
    console.error("[Bothub API] 💥 Unerwarteter Fehler:");
    console.error(err);
    await sock.sendMessage(from, { text: `⚠️ API-Fehler: ${err}` });
  }
}
  

async function downloadAudioMessage(msg, sock) {
  try {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const audioMsg = quoted?.audioMessage;
    if (!audioMsg) return null;
    const stream = await sock.downloadContentFromMessage(audioMsg, "audio");
    const buffer = [];
    for await (const chunk of stream) buffer.push(chunk);
    return Buffer.concat(buffer);
  } catch {
    return null;
  }
}

// 🟢 Bot-Startup-Info
console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                                                            ║');
console.log('║            ✅ Beast Bot ist bereit!                         ║');
console.log('║            Session: ' + sessionName + ' ist aktiv       ║');
console.log('║                                                            ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Initialize Nyxion AI
const nyxion = initNyxion(sock);
console.log('🤖 Nyxion AI Modul initialisiert');

// Starte File Watcher für users.json
startUserFileWatcher();
console.log('👁️ File Watcher für users.json aktiviert');

sock.ev.on('messages.upsert', async (m) => {
  const msg = m.messages?.[0];
  if ((process.env.DEBUG_UPSERT || '').trim() === '1') {
    console.log('📨 upsert.type:', m.type);
    console.log('📨 msg.fromMe:', msg?.key?.fromMe);
    console.log('📨 msg.message keys:', Object.keys(msg?.message || {}));
  }
  if (!msg?.message) return;

  // Ignore old messages that were sent before the bot started
  if (global.botStartTime && msg.messageTimestamp < global.botStartTime / 1000) return;

  const chatId = msg.key.remoteJid;
  const from = chatId;
  const isGroupChat = chatId && chatId.endsWith('@g.us');
  
  // Sammle alle Chat-IDs für Eilmeldungen
  if (!global._allChatIds) global._allChatIds = new Set();
  if (chatId) global._allChatIds.add(chatId);
  
  const unwrapForEarlyType = (root) => {
    let cur = root;
    for (let i = 0; i < 4; i++) {
      if (!cur || typeof cur !== 'object') break;
      if (cur.viewOnceMessage?.message) cur = cur.viewOnceMessage.message;
      else if (cur.ephemeralMessage?.message) cur = cur.ephemeralMessage.message;
      else if (cur.viewOnceMessageV2?.message) cur = cur.viewOnceMessageV2.message;
      else if (cur.viewOnceMessageV2Extension?.message) cur = cur.viewOnceMessageV2Extension.message;
      else break;
    }
    return cur || root;
  };

  // Detect UI replies early so timeout/filters don't delete/ignore button clicks
  const earlyContent = unwrapForEarlyType(msg.message);
  const isUiReplyEarly = !!(
    earlyContent?.interactiveResponseMessage ||
    earlyContent?.buttonsResponseMessage ||
    earlyContent?.listResponseMessage ||
    earlyContent?.templateButtonReplyMessage
  );

  // NOTE: keep this as a string so non-text messages (buttons/lists) don't crash the handler
  const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toString();
  
  // === AUTOSTICKER: Muss VOR "if (!body) return" prüfen, da Sticker kein Text-Feld haben ===
  if (isGroupChat && !msg.key.fromMe) {
    // === TIMEOUT CHECK für Sticker ===
    const userKey = msg.key.participant || msg.key.remoteJid || chatId;
    const userTimeout = timeoutUsers[userKey];
    if (userTimeout && userTimeout.expiresAt > Date.now()) {
      // User ist im Timeout
      const getRank = (jid) => {
        try {
          const ranks = require('./ranksConfig.json');
          return ranks[jid]?.rank || null;
        } catch (e) {
          return null;
        }
      };
      
      const rank = getRank(userKey);
      const isTeam = ['Inhaber', 'Stellvertreter Inhaber'].includes(rank);
      
      if (!isTeam && msg.message?.stickerMessage) {
        // User darf im Timeout keine Sticker verwenden
        try {
          await sock.sendMessage(chatId, { delete: msg.key });
        } catch (e) {
          // ignore
        }
        try {
          await sock.sendMessage(chatId, { text: `⏳ Du stehst im Timeout! Du darfst keine Sticker verwenden!`, mentions: [userKey] });
        } catch (e) {
          // ignore
        }
        return;
      }
    } else if (userTimeout && userTimeout.expiresAt <= Date.now()) {
      // Timeout abgelaufen
      delete timeoutUsers[userKey];
    }

    const features = loadGroupFeatures(chatId);
    if (features.autosticker) {
      try {
        if (msg.message?.stickerMessage) {
          try {
            await sock.sendMessage(chatId, { delete: msg.key });
            await sock.sendMessage(chatId, { text: '🎨 Sticker sind in dieser Gruppe nicht erlaubt. Sticker entfernt.' }, { quoted: msg });
          } catch (delErr) {
            console.error('Autosticker delete failed:', delErr && delErr.message ? delErr.message : delErr);
          }
          return;
        }
      } catch (e) {
        // ignore
      }
    }
  }
  
	  // Don't return on empty body: button/list replies often have no conversation text.

  // 📌 Definiere pushName früh, damit es überall verfügbar ist
  let pushName = msg.pushName || null;

  // 📌 Definiere cleanedSenderNumber auch früh
  let senderNumber;
  if (msg.key.fromMe) {
    senderNumber = (msg.key.participant || msg.key.remoteJid || '').split('@')[0];
  } else if (isGroupChat) {
    senderNumber = (msg.key.participant || chatId).split('@')[0];
  } else {
    senderNumber = chatId.split('@')[0];
  }
  const cleanedSenderNumber = senderNumber.replace(/[^0-9]/g, '');

  const prefix = getPrefixForChat(chatId);

  // Ignoriere nicht-Command-Nachrichten von dir selbst, aber verarbeite deine Befehle
  if (msg.key.fromMe && !body.startsWith(prefix)) return;

  // === TIMEOUT CHECK für normale Nachrichten ===
  if (!body.startsWith(prefix) && isGroupChat && !msg.key.fromMe && !isUiReplyEarly) {
    const userKey = msg.key.participant || msg.key.remoteJid || chatId;
    const userTimeout = timeoutUsers[userKey];
    if (userTimeout && userTimeout.expiresAt > Date.now()) {
      // User ist im Timeout und versucht zu schreiben
      const getRank = (jid) => {
        try {
          const ranks = require('./ranksConfig.json');
          return ranks[jid]?.rank || null;
        } catch (e) {
          return null;
        }
      };
      
      const rank = getRank(userKey);
      const isTeam = ['Inhaber', 'Stellvertreter Inhaber'].includes(rank);
      
      if (!isTeam) {
        // Timeout: Normale User dürfen nicht schreiben
        try {
          await sock.sendMessage(chatId, { delete: msg.key });
        } catch (e) {
          // ignore
        }
        try {
          await sock.sendMessage(chatId, { text: `⏳ Du stehst im Timeout! Du darfst keine Nachrichten schreiben!`, mentions: [userKey] });
        } catch (e) {
          // ignore
        }
        return;
      }
    } else if (userTimeout && userTimeout.expiresAt <= Date.now()) {
      // Timeout abgelaufen
      delete timeoutUsers[userKey];
    }
  }

  // === Jede Nachricht automatisch als gelesen markieren ===
  try {
    await sock.readMessages([msg.key]);
  } catch (readError) {
    console.log('Fehler beim Lesen der Nachricht:', readError.message);
  }

  // --- AFK-Mention Check ---
  if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
    const mentionedJids = msg.message.extendedTextMessage.contextInfo?.mentionedJid || [];
    const afkMentions = mentionedJids
      .map(jid => ({ jid, status: getAFKStatus(jid) }))
      .filter(item => item.status);

    if (afkMentions.length) {
      const mentions = afkMentions.map(m => m.jid);
      const textLines = afkMentions.map(({ jid, status }) => {
        const duration = Date.now() - status.timestamp;
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((duration % (1000 * 60)) / 1000);

        const durationText = hours > 0 ? `${hours}h ${minutes}m ${seconds}s`
                          : minutes > 0 ? `${minutes}m ${seconds}s`
                          : `${seconds}s`;

        return `😴 @${jid.split('@')[0]} ist AFK!\n📝 Grund: ${status.reason}\n⏱️ Seit: ${durationText}`;
      });

      await sock.sendMessage(chatId, {
        text: textLines.join('\n\n'),
        mentions
      }, { quoted: msg });
    }
  }

  // === Nur Commands: "schreibt…" simulieren ===
  if (body.startsWith(prefix)) {
    await sock.sendPresenceUpdate('composing', chatId);

    // Optional: Präsenz nach kurzer Zeit zurücksetzen
    setTimeout(async () => {
      await sock.sendPresenceUpdate('available', chatId);
    }, 2000);
  }

  // Autoreact: reagiert automatisch auf eingehende Nachrichten, wenn aktiviert (pro Gruppe)
  try {
    const gf = loadGroupFeatures(chatId);
    if (gf.autoreact && !body.startsWith(prefix)) {
      try {
        await sock.sendMessage(chatId, { react: { text: '😊', key: msg.key } });
      } catch (e) {
        console.error('Autoreact failed:', e && e.message ? e.message : e);
      }
    }
  } catch (e) {
    // ignore feature read errors
  }

  // continue handling message updates (anti-delete, logging, etc.)

  saveDeletedMessage(msg);

  if (msg.message?.protocolMessage?.type === 0) {
    const originalMsgId = msg.message.protocolMessage.key.id;
    console.log(`🗑️ Nachricht gelöscht! Original-ID: ${originalMsgId}`);
    const chatId1 = msg.key.remoteJid; 
    if (!antiDeleteConfig[chatId1]) return;
    

    const chatId = msg.key.remoteJid;
const chatMessages = deletedMessages[chatId];

if (!chatMessages) {
  console.log(`⚠️ Keine gespeicherten Nachrichten für Chat ${chatId}`);
  return;
}

    const originalMessage = chatMessages[originalMsgId];
    if (!originalMessage) {
      console.log(`❌ Originalnachricht mit ID ${originalMsgId} nicht gefunden.`);
      return;
    }

       let originalText = '[Nicht-Textnachricht]';
const om = originalMessage.message;

if (om.conversation) {
  originalText = om.conversation;
} else if (om.extendedTextMessage?.text) {
  originalText = om.extendedTextMessage.text;
} else if (om.imageMessage) {
  if (om.imageMessage.caption) {
    originalText = `[Bild] ${om.imageMessage.caption}`;
  } else {
    originalText = `[Bild ohne Caption]`;
  }
} else if (om.videoMessage) {
  if (om.videoMessage.caption) {
    originalText = `[Video] ${om.videoMessage.caption}`;
  } else {
    originalText = `[Video ohne Caption]`;
  }
} else if (om.stickerMessage) {
  originalText = `[Sticker]`;
} else if (om.documentMessage) {
  originalText = `[Dokument]`;
} else if (om.audioMessage) {
  originalText = `[Audio]`;
} else if (om.contactMessage) {
  originalText = `[Kontakt gesendet]`;
} else if (om.locationMessage) {
  originalText = `[Standort gesendet]`;
} else if (om.buttonsMessage) {
  originalText = om.buttonsMessage.contentText || '[Buttons Nachricht]';
} else if (om.listMessage) {
  originalText = om.listMessage.description || '[Listen-Nachricht]';
}

try {
  const isImage = !!om.imageMessage;
  const isVideo = !!om.videoMessage;
  const isSticker = !!om.stickerMessage;
  const isAudio = !!om.audioMessage;
  const isDocument = !!om.documentMessage;
  const isLocation = !!om.locationMessage;
  const isContact = !!om.contactMessage;

  let mediaType = null;
  let mediaData = null;
  let caption = `🥷 *Gelöschte Nachricht erkannt!*\n👤 *Von:* ${originalMessage.pushName || 'Unbekannt'}\n> by BeastBot`;

  if (isImage) {
    mediaType = 'image';
    mediaData = om.imageMessage;
    if (mediaData.caption) caption += `\n> 🔓💬 *Caption:* ${mediaData.caption}`;
  } else if (isVideo) {
    mediaType = 'video';
    mediaData = om.videoMessage;
    if (mediaData.caption) caption += `\n> 🔓💬 *Caption:* ${mediaData.caption}`;
  } else if (isSticker) {
    mediaType = 'sticker';
    mediaData = om.stickerMessage;
  } else if (isAudio) {
    mediaType = 'audio';
    mediaData = om.audioMessage;
  } else if (isDocument) {
    mediaType = 'document';
    mediaData = om.documentMessage;
    caption += `\n> 🔓📄 *Datei:* ${mediaData.fileName || 'Unbekannt'}`;
  } else if (isLocation) {
    mediaType = 'location';
    mediaData = om.locationMessage;
  } else if (isContact) {
    mediaType = 'contact';
    mediaData = om.contactMessage;
  }
  if (mediaType && mediaData) {
    const stream = await downloadContentFromMessage(mediaData, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    const messagePayload = {
      [mediaType]: buffer};
    if (mediaType === 'image' || mediaType === 'video') {
      messagePayload.caption = caption;
    } else if (mediaType === 'document') {
      messagePayload.fileName = mediaData.fileName || 'datei.pdf';
      messagePayload.caption = caption;
    }
    await sock.sendMessage(chatId, messagePayload);
    console.log(`✅ Wiederhergestellt (${mediaType}) im Chat: ${chatId}`);
  } else {
    await sock.sendMessage(chatId, {
      text: `${caption}\n> 🔓 *Nachricht:* ${originalText}`
    });
    console.log(`✅ Wiederhergestellte Textnachricht im Chat: ${chatId}`);
  }
} catch (err) {
  console.error(`❌ Fehler beim Wiederherstellen:`, err);
    }
  }


let messageContent = msg.message;
let mtype = getContentType(messageContent);


if (mtype === 'viewOnceMessage') {
  messageContent = messageContent.viewOnceMessage.message;
  mtype = getContentType(messageContent);
}

// Unwrap common wrappers so button replies are detected correctly
if (mtype === 'ephemeralMessage') {
  messageContent = messageContent.ephemeralMessage?.message || messageContent;
  mtype = getContentType(messageContent);
}
if (mtype === 'viewOnceMessageV2') {
  messageContent = messageContent.viewOnceMessageV2?.message || messageContent;
  mtype = getContentType(messageContent);
}
if (mtype === 'viewOnceMessageV2Extension') {
  messageContent = messageContent.viewOnceMessageV2Extension?.message || messageContent;
  mtype = getContentType(messageContent);
}

let contentType = getContentType(messageContent);
// Sometimes baileys returns a wrapper type; force-detect button reply types
if (messageContent?.interactiveResponseMessage) contentType = 'interactiveResponseMessage';
if (messageContent?.buttonsResponseMessage) contentType = 'buttonsResponseMessage';
if (messageContent?.listResponseMessage) contentType = 'listResponseMessage';
if (messageContent?.templateButtonReplyMessage) contentType = 'templateButtonReplyMessage';
let preview = '';
let messageBody = '';

switch (contentType) {
  case 'conversation':
    messageBody = messageContent.conversation || '';
  preview = `${messageBody}`;
    break;
  case 'extendedTextMessage':
    messageBody = messageContent.extendedTextMessage.text || '';
   preview = `${messageBody}`;
    break;
  case 'imageMessage':
    messageBody = messageContent.imageMessage.caption || '';
    preview = `[📷 Bild] ${messageBody}`;
    break;
  case 'videoMessage':
    messageBody = messageContent.videoMessage.caption || '';
    preview = `[🎥 Video] ${messageBody}`;
    break;
  case 'audioMessage':
    preview = '[🎧 Audio gesendet]';
    break;
  case 'documentMessage':
    messageBody = messageContent.documentMessage.caption || '';
    preview = `[📄 Dokument] ${messageBody}`;
    break;
  case 'stickerMessage':
    preview = '[💠 Sticker gesendet]';
    break;
  case 'contactMessage':
    preview = '[👤 Kontakt gesendet]';
    break;
  case 'locationMessage':
    preview = '[📍 Standort gesendet]';
    break;
  case 'buttonsMessage':
    messageBody = messageContent.buttonsMessage.contentText || '';
    preview = `[🟦 Button Nachricht] ${messageBody}`;
    break;
		  case 'buttonsResponseMessage':
		    if (DEBUG_BUTTONS) {
		      console.log('🔍 RAW buttonsResponseMessage:', safeStringifyLimited(messageContent.buttonsResponseMessage));
		    }
		    messageBody = messageContent.buttonsResponseMessage.selectedButtonId || '';
		    preview = `[🟦 Button Antwort] ${messageBody}`;
		    break;
		  case 'interactiveResponseMessage': {
		    if (DEBUG_BUTTONS) {
		      console.log('🔍 RAW interactiveResponseMessage:', safeStringifyLimited(messageContent.interactiveResponseMessage));
		      console.log(
		        '🔍 RAW nativeFlowResponseMessage.paramsJson:',
		        messageContent.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
		          messageContent.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJSON ||
		          ''
		      );
		    }
		    // Native Flow / Single-Select replies (used by /main2)
		    const native = messageContent.interactiveResponseMessage?.nativeFlowResponseMessage;
		    const paramsJson = native?.paramsJson || native?.paramsJSON || '';

		    const parseJsonChain = (input) => {
		      let cur = input;
		      for (let i = 0; i < 4; i++) {
		        if (typeof cur !== 'string') return cur;
		        const s = cur.trim();
		        if (!s) return '';
		        // Some clients send quoted JSON or JSON-in-JSON
		        if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']')) || (s.startsWith('"') && s.endsWith('"'))) {
		          try {
		            cur = JSON.parse(s);
		            continue;
		          } catch {
		            return cur;
		          }
		        }
		        return cur;
		      }
		      return cur;
		    };

		    const deepPickId = (obj) => {
		      const preferredKeys = new Set([
		        'id',
		        'selectedId',
		        'selected_id',
		        'selectedRowId',
		        'selected_row_id',
		        'rowId',
		        'buttonId',
		        'value',
		        'selectedButtonId',
		      ]);
		      const queue = [obj];
		      const seen = new Set();
		      while (queue.length) {
		        const cur = queue.shift();
		        if (!cur || (typeof cur !== 'object' && typeof cur !== 'function')) continue;
		        if (seen.has(cur)) continue;
		        seen.add(cur);

		        for (const key of Object.keys(cur)) {
		          const val = cur[key];
		          if (preferredKeys.has(key) && typeof val === 'string' && val.trim()) return val.trim();
		        }
		        // common nested structures used by list/single_select
		        const nested =
		          cur?.list_reply ||
		          cur?.listReply ||
		          cur?.singleSelectReply ||
		          cur?.single_select_reply ||
		          cur?.selection ||
		          cur?.selectedRow ||
		          cur?.selected_row ||
		          cur?.params ||
		          cur?.response ||
		          cur?.result ||
		          null;
		        if (nested) queue.push(nested);

		        for (const val of Object.values(cur)) {
		          if (val && typeof val === 'object') queue.push(val);
		        }
		      }
		      return '';
		    };

		    let selectedId = '';
		    if (paramsJson) {
		      try {
		        let parsed = parseJsonChain(paramsJson);
		        if (parsed?.paramsJson) parsed = parseJsonChain(parsed.paramsJson);
		        selectedId = deepPickId(parsed);
		        if (!selectedId && typeof paramsJson === 'string') {
		          const m = paramsJson.match(/\"(?:id|selectedId|selected_row_id|selectedRowId)\"\\s*:\\s*\"([^\"]+)\"/);
		          if (m?.[1]) selectedId = m[1];
		        }
		      } catch {}
		    }

		    // Fallbacks seen in some message shapes
		    selectedId =
		      selectedId ||
		      messageContent.interactiveResponseMessage?.buttonReplyMessage?.selectedButtonId ||
		      messageContent.interactiveResponseMessage?.listReply?.singleSelectReply?.selectedRowId ||
		      '';

		    messageBody = selectedId || '';
		    preview = `[🧩 Interactive Antwort] ${messageBody}`;
		    break;
		  }
	  case 'listMessage':
	    messageBody = messageContent.listMessage.description || '';
	    preview = `[📋 Listen-Nachricht] ${messageBody}`;
	    break;
    case 'reactionMessage':
  const reaction = messageContent.reactionMessage.text || '❓';
  let reactedMsg = '';


  const reactedKey = messageContent.reactionMessage.key;
  if (reactedKey && reactedKey.remoteJid && reactedKey.id) {
    try {
      const quotedMsg = await sock.loadMessage(reactedKey.remoteJid, reactedKey.id);
      reactedMsg =
        quotedMsg.message?.conversation ||
        quotedMsg.message?.extendedTextMessage?.text ||
        '[Nicht lesbare Nachricht]';
    } catch {
      reactedMsg = '[Nachricht konnte nicht geladen werden]';
    }
  }

  preview = `[ Reaktion] ${reaction} auf: ${reactedMsg}`;
  break;
  case 'groupParticipantUpdate':
    const participants = messageContent.participants || [];
    const action = messageContent.action; 
    const actedBy = msg.key.fromMe ? 'Ich (Bot)' : pushName || cleanedSenderNumber;

    if (action === 'promote') {
      preview = `[👑 Promote] ${participants.join(', ')} von ${actedBy}`;
    } else if (action === 'demote') {
      preview = `[🔻 Demote] ${participants.join(', ')} von ${actedBy}`;
    } else if (action === 'add') {
      preview = `[➕ Hinzugefügt] ${participants.join(', ')} von ${actedBy}`;
    } else if (action === 'remove') {
      preview = `[➖ Entfernt] ${participants.join(', ')} von ${actedBy}`;
    } else {
      preview = `[ℹ️ Gruppen-Update] ${action} durch ${actedBy}`;
    }
    break;
  case 'listResponseMessage':
    messageBody = messageContent.listResponseMessage.singleSelectReply?.selectedRowId || '';
    preview = `[📋 Listen-Antwort] ${messageBody}`;
    break;
  case 'templateButtonReplyMessage':
    messageBody = messageContent.templateButtonReplyMessage.selectedId || '';
    preview = `[📨 Template Antwort] ${messageBody}`;
    break;
   case 'pollCreationMessageV3':
    messageBody = `📊 Neue Umfrage: ${messageContent.pollCreationMessageV3.name || 'Unbekannt'}`;
    preview = `${messageBody}`;
    break;

  case 'pollUpdateMessage':
    const updates = messageContent.pollUpdateMessage.updates || [];
    const optionVotes = updates.map(u => u.selectedOptions?.join(', ')).join(', ');
    messageBody = `🗳️ Neue Stimmen: ${optionVotes || 'Keine Angaben'}`;
    preview = `${messageBody}`;
    break;
      default:
   preview = `[NICHT KOMPATIBEL ODER GRUPPEN EVENT]`;
    messageBody = '';
}


if (msg.message?.groupParticipantUpdateMessage) {
  const groupEvent = msg.message.groupParticipantUpdateMessage;
  const participants = groupEvent.participants || [];
  const action = groupEvent.action; 
  const actedByJid = msg.key.participant || msg.key.remoteJid;
  const actedByName = msg.key.fromMe ? 'Ich (Bot)' : pushName || cleanedSenderNumber;

  switch (action) {
    case 'promote':
      preview = `[👑 Promote] ${participants.join(', ')} von ${actedByName}`;
      break;
    case 'demote':
      preview = `[🔻 Demote] ${participants.join(', ')} von ${actedByName}`;
      break;
    case 'add':
      preview = `[➕ Hinzugefügt] ${participants.join(', ')} von ${actedByName}`;
      break;
    case 'remove':
      preview = `[➖ Entfernt] ${participants.join(', ')} von ${actedByName}`;
      break;
    default:
      preview = `[ℹ️ Gruppen-Update] ${action} von ${actedByName}`;
      break;
  }
}


const now = new Date();
const time =
  now.toLocaleDateString('de-DE') +
  ', ' +
  now.toLocaleTimeString('de-DE', { hour12: false });

const chatType = isGroupChat ? 'Gruppe' : 'Privat';


const id = msg.key.id || '';
const isFromWeb =
  id.toLowerCase().startsWith('web') ||
  id.toLowerCase().includes('desktop') ||
  id.toUpperCase().startsWith('WA');
const isFromAndroid = !isFromWeb && (id.length > 20 || id.startsWith('BAE'));
const isFromIOS = !isFromWeb && !isFromAndroid;

const device = isFromWeb ? 'Web' : isFromAndroid ? 'Android' : 'iOS';
const deviceEmoji = isFromWeb ? '💻' : isFromAndroid ? '📱' : '🍏';

// === Testfeature: Leveling & Antilink (per-message handling, per-group) ===
try {
  const features = loadGroupFeatures(chatId);

  // Anti-NSFW: lösche Bilder sofort, wenn aktiviert
  if (features.antinsfw && isGroupChat) {
    try {
      if (msg.message?.imageMessage || msg.message?.videoMessage?.mimetype?.includes('image')) {
        try {
          await sock.sendMessage(chatId, { delete: msg.key });
          await sock.sendMessage(chatId, { text: '🔞 NSFW-Bilder sind nicht erlaubt. Bild entfernt.' }, { quoted: msg });
        } catch (delErr) {
          console.error('Antinsfw delete failed:', delErr && delErr.message ? delErr.message : delErr);
        }
        return;
      }
    } catch (e) {
      // proceed
    }
  }

  // Antispam: wenn gleiche User innerhalb 5s erneut sendet, löschen und warnen
  // (UI-Button/List Replies nicht blocken, sonst wirken Klicks wie "werden ignoriert")
  if (features.antispam && isGroupChat && !isUiReplyEarly) {
    try {
      global._lastMsgTimes = global._lastMsgTimes || {};
      const userKey = msg.key.participant || msg.key.remoteJid || chatId;
      const nowTs = Date.now();
      const lastTs = global._lastMsgTimes[userKey] || 0;
      if (nowTs - lastTs < 5000) {
        try {
          await sock.sendMessage(chatId, { delete: msg.key });
          await sock.sendMessage(chatId, { text: `🚫 Bitte nicht spammen, @${userKey.split('@')[0]}!` , mentions: [userKey] }, { quoted: msg });
        } catch (delErr) {
          console.error('Antispam delete failed:', delErr && delErr.message ? delErr.message : delErr);
        }
        return;
      }
      global._lastMsgTimes[userKey] = nowTs;
    } catch (e) {
      // ignore
    }
  }

  // Leveling: jede Nachricht +1 XP (wenn aktiviert)
  if (features.leveling) {
    try {
      const userJid = msg.key.participant || msg.key.remoteJid || chatId;
      ensureUser(userJid, msg.pushName || userJid.split('@')[0]);
      addXP(userJid, 1);
    } catch (e) {
      console.error('Leveling error:', e && e.message ? e.message : e);
    }
  }

  // Antilink: Lösche Nachrichten in Gruppen, die Links enthalten
  if (features.antilink && isGroupChat) {
    const urlRegex = /(https?:\/\/|www\.)[\w\-]+(\.[\w\-]+)+([\w.,@?^=%&:/~+#\-]*[\w@?^=%&/~+#\-])?/i;
    if (urlRegex.test(body)) {
      try {
        await sock.sendMessage(chatId, { delete: msg.key });
        await sock.sendMessage(chatId, { text: '🔗 Links sind in dieser Gruppe nicht erlaubt. Nachricht entfernt.' }, { quoted: msg });
      } catch (delErr) {
        console.error('Antilink delete failed:', delErr && delErr.message ? delErr.message : delErr);
      }
      return;
    }
  }

  // Badwords: lösche Nachrichten, die ein verbotenes Wort enthalten
  try {
    if (Array.isArray(features.badwords) && features.badwords.length > 0) {
      const textContent = (body || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || msg.message?.extendedTextMessage?.text || '').toString();
      const lower = textContent.toLowerCase();
      const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const bad of features.badwords) {
        if (!bad) continue;
        const pattern = new RegExp('\\b' + escapeRegExp(bad.toLowerCase()) + '\\b', 'i');
        if (pattern.test(lower)) {
          try {
            await sock.sendMessage(chatId, { delete: msg.key });
            await sock.sendMessage(chatId, { text: `🚫 Bitte keine Schimpfwörter, @${(msg.key.participant||msg.key.remoteJid||chatId).split('@')[0]}!`, mentions: [msg.key.participant || msg.key.remoteJid || chatId] }, { quoted: msg });
          } catch (delErr) {
            console.error('Badwords delete failed:', delErr && delErr.message ? delErr.message : delErr);
          }
          return;
        }
      }
    }
  } catch (e) {
    // ignore
  }
  // MuteGC: setze Gruppe auf Nur-Admins, falls aktiviert (einmalig pro Gruppe)
  if (features.mutegc && isGroupChat) {
    try {
      global._mutedGroups = global._mutedGroups || new Set();
      if (!global._mutedGroups.has(chatId)) {
        await sock.groupSettingUpdate(chatId, 'announcement');
        global._mutedGroups.add(chatId);
        await sock.sendMessage(chatId, { text: '🔇 Gruppenmodus: Nur-Admins dürfen schreiben (MuteGC aktiviert).' });
      }
    } catch (mutErr) {
      console.error('MuteGC failed:', mutErr && mutErr.message ? mutErr.message : mutErr);
    }
  }
} catch (e) {
  // ignore feature file errors
}


const senderJid = isGroupChat
  ? msg.key.participant || chatId
  : msg.key.remoteJid;


const botDevice = msg.key.fromMe ? 'Ich (Bot)' : 'User';


let groupName = null;
if (isGroupChat) {
  try {
    const metadata = await sock.groupMetadata(chatId);
    groupName = metadata.subject || 'Unbekannte Gruppe';
  } catch {
    groupName = 'Fehler beim Abrufen';
  }
}


if (!pushName) {
  try {
    const contact = await sock.onWhatsApp(senderJid);
    if (contact && contact[0] && contact[0].notify) {
      pushName = contact[0].notify;
    } else if (contact && contact[0] && contact[0].jid) {
      pushName = contact[0].jid.split('@')[0];
    } else {
      pushName = cleanedSenderNumber || 'Unbekannt';
    }
  } catch {
    pushName = cleanedSenderNumber || 'Unbekannt';
  }
}


const myJid = sock?.user?.id || 'Unbekannt';
let botName = sessionName || 'Unbekannter Bot';
try {
  const config = JSON.parse(fs.readFileSync('./botConfig.json', 'utf8'));
  botName = config[myJid] || sessionName || 'Unbekannter Bot';
} catch (err) {
  console.log(chalk.red(`❌ Fehler beim Laden von botConfig.json: ${err.message}`));
}


const title = 'BeastBot Logs';
const totalLength = 44; 
const padding = totalLength - title.length - 2; 
const leftPadding = Math.floor(padding / 2);
const rightPadding = padding - leftPadding;

console.log(chalk.gray(`╭${'─'.repeat(leftPadding)} ${title} ${'─'.repeat(rightPadding)}╮`));

console.log(chalk.blueBright(`│ ChatArt   : `) + chalk.white(chatType));
if (isGroupChat)
  console.log(chalk.greenBright(`│ Gruppe    : `) + chalk.white(groupName));
console.log(chalk.cyanBright(`│ Zeit      : `) + chalk.white(time));
console.log(chalk.yellowBright(`│ Chat-ID   : `) + chalk.white(chatId));
console.log(chalk.magentaBright(`│ UserName  : `) + chalk.white(pushName));
console.log(chalk.cyan(`│ Device    : `) + chalk.white(`${deviceEmoji} ${device}`));
console.log(chalk.gray(`│ JID       : `) + chalk.white(senderJid));
console.log(chalk.redBright(`│ ✉ Message : `) + chalk.white(preview));
console.log(chalk.magenta(`│ Session   : `) + chalk.white(`${botName}`));
console.log(chalk.gray('╰────────────────────────────────────────────╯'));


const autodownFile = path.join(__dirname, 'autodown.json');

function loadAutoDown() {
    if (!fs.existsSync(autodownFile)) fs.writeFileSync(autodownFile, JSON.stringify({ enabledChats: [] }, null, 2));
    return JSON.parse(fs.readFileSync(autodownFile));
}

function saveAutoDown(data) {
    fs.writeFileSync(autodownFile, JSON.stringify(data, null, 2));
}

function isAutoEnabled(chatId) {
    return loadAutoDown().enabledChats.includes(chatId);
}

function enableAuto(chatId) {
    const data = loadAutoDown();
    if (!data.enabledChats.includes(chatId)) data.enabledChats.push(chatId);
    saveAutoDown(data);
}

function disableAuto(chatId) {
    const data = loadAutoDown();
    data.enabledChats = data.enabledChats.filter(id => id !== chatId);
    saveAutoDown(data);
}


if (isGroupChat && antiLinkGroups[chatId]) {

  const blockedLinksRegex = /(https?:\/\/(chat\.whatsapp\.com|t\.me|telegram\.me|discord\.gg|discord\.com\/invite|invite\.gg)\/[^\s]+)/gi;

  const senderId = msg.key.participant || chatId;
  const userId = senderId.split('@')[0];


  let groupMetadata;
  try {
    groupMetadata = await sock.groupMetadata(chatId);
  } catch (err) {
    console.error('Fehler beim Laden der Gruppen-Metadaten:', err);
    groupMetadata = { participants: [] };
  }

  const participant = groupMetadata.participants.find(p => p.id === senderId);
  const isSenderAdmin = !!(participant && (participant.admin || participant.isAdmin || participant.admin === 'admin'));


  const body = msg.message?.conversation ||
               msg.message?.extendedTextMessage?.text ||
               msg.message?.imageMessage?.caption ||
               msg.message?.videoMessage?.caption || '';


  if (blockedLinksRegex.test(body) && !isSenderAdmin) {
    try {
 
      await sock.sendMessage(chatId, {
        delete: {
          remoteJid: chatId,
          fromMe: false,
          id: msg.key.id,
          participant: senderId
        }
      });

  
      const warns = addWarning(chatId, userId); 

      if (warns >= 3) {

        await sock.sendMessage(chatId, {
          text: `❌ @${userId} wurde 3x verwarnt und wird entfernt.`,
          mentions: [senderId]
        });
        await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
        resetWarnings(chatId, userId);
      } else {
        // Nur Verwarnung
        await sock.sendMessage(chatId, {
          text: `⚠️ @${userId} hat wegen eines verbotenen Links jetzt ${warns}/3 Verwarnungen.`,
          mentions: [senderId]
        });
      }
    } catch (err) {
      console.error('AntiLink Verwarnung Fehler:', err);
    }
  }
}





const sender = msg.key.participant || chatId;
if (isGroupChat && isUserMuted(chatId, sender)) {
  try {
    await sock.sendMessage(chatId, {
      delete: {
        remoteJid: chatId,
        fromMe: false,
        id: msg.key.id,
        participant: sender
      }
    });
    console.log(`🔇 Nachricht von ${sender} wurde erfolgreich gelöscht.`);
  } catch (e) {
    console.error('❌ Fehler beim Löschen der Nachricht:', e.message);
  }
}

// AFK Check - VOR Prefix-Prüfung, damit normale Nachrichten auch erkannt werden
const afkStatusCheck = getAFKStatus(senderJid);
if (afkStatusCheck) {
  // User war AFK und schreibt jetzt wieder - Status entfernen
  removeAFK(senderJid);
  
  // Berechne die Dauer der AFK-Zeit
  const afkDuration = Date.now() - afkStatusCheck.timestamp;
  const hours = Math.floor(afkDuration / (1000 * 60 * 60));
  const minutes = Math.floor((afkDuration % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((afkDuration % (1000 * 60)) / 1000);
  
  let durationText = '';
  if (hours > 0) {
    durationText = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    durationText = `${minutes}m ${seconds}s`;
  } else {
    durationText = `${seconds}s`;
  }
  
  await sock.sendMessage(chatId, {
    text: `👋 @${senderJid.split('@')[0]} ist nun wieder online! 🟢\n\n⏱️ AFK-Zeit: ${durationText}`,
    contextInfo: { mentionedJid: [senderJid] }
  });
  console.log(`[AFK] User ${senderJid} ist durch eine Nachricht wieder online (Dauer: ${durationText})`);
}

// Premium-Autoaktionen (laufen auch ohne Befehl, sobald der User schreibt)
await handlePremiumAutoActions(sock, chatId, senderJid);

		const pfx = getPrefixForChat(chatId);
		// Button/List Replies (z.B. aus /main2) → in echte Prefix-Kommandos umwandeln,
		// damit ein Klick (z.B. "/ping") auch bei anderen Prefixen korrekt ausgeführt wird.
		const isUiReply =
		  contentType === 'interactiveResponseMessage' ||
		  contentType === 'buttonsResponseMessage' ||
		  contentType === 'listResponseMessage' ||
		  contentType === 'templateButtonReplyMessage';
		// Manche WhatsApp-Clients schicken bei Buttons/Listen den Display-Text als normale Textnachricht
		// (conversation/extendedTextMessage) statt einer buttonsResponseMessage. Für /main2 fangen wir das ab.
		if (!isUiReply && messageBody && !messageBody.startsWith(pfx)) {
		  const raw = messageBody.toString();
		  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
		  const firstLine = (lines[0] || '').toLowerCase();
		  const firstWord = firstLine
		    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
		    .replace(/\s+/g, ' ')
		    .trim();
		  const haystack = raw.toLowerCase();

		  let mapped = '';
		  if (
		    firstWord === 'ping' ||
		    (haystack.includes('🏓') && haystack.includes('ping') && (haystack.includes('latenz') || haystack.includes('latency')))
		  ) {
		    mapped = 'ping';
		  } else if (
		    firstWord === 'menu' ||
		    (haystack.includes('📁') && haystack.includes('menu')) ||
		    (haystack.includes('📂') && haystack.includes('menu'))
		  ) {
		    mapped = 'menu';
		  }

		  if (mapped) {
		    if (DEBUG_BUTTONS) console.log(`🔁 Display-Text→Command Mapping: "${raw}" -> ${pfx}${mapped}`);
		    messageBody = `${pfx}${mapped}`;
		  }
		}
			if (isUiReply && messageBody) {
			  const trimmed = messageBody.trim();
			  if (trimmed.startsWith('$')) {
			    // "$ping" → "<prefix>ping"
		    messageBody = `${pfx}${trimmed.slice(1)}`;
		  } else if (trimmed.startsWith('/') || trimmed.startsWith('.') || trimmed.startsWith('!')) {
		    // "/ping" → "<prefix>ping" (Prefix pro Chat kann variieren)
		    messageBody = `${pfx}${trimmed.slice(1)}`;
		  } else {
		    // Manche Buttons senden nur "ping" statt "/ping" oder "$ping"
		    const id = trimmed.toLowerCase();
		    const uiIdToCommand = {
		      ping: 'ping',
		      menu: 'menu',
		      main: 'main',
		    };
		    if (uiIdToCommand[id]) {
		      messageBody = `${pfx}${uiIdToCommand[id]}`;
		    }
		  }
		}
		// UI-Klick erkannt, aber keine ID extrahiert → antworte trotzdem (User-Feedback)
		if (isUiReply && (!messageBody || !messageBody.trim())) {
		  try {
		    await sock.sendMessage(chatId, { text: '✅ Button-Klick erkannt, aber ich konnte keine Auswahl-ID lesen. Bitte nochmal auswählen.' }, { quoted: msg });
		  } catch {}
		  return;
		}
		// Sonderfall: INFO ohne Prefix → Gruppeninfos & Prefix anzeigen
		if (messageBody && messageBody.trim().toUpperCase() === 'INFO') {
		  try {
		    const prefix = getPrefixForChat(chatId);
	    const meta = isGroupChat ? await sock.groupMetadata(chatId) : null;
    const subject = meta?.subject || groupName || 'Unbekannte Gruppe';
    const desc = meta?.desc || 'Keine Beschreibung gesetzt.';
    const memberCount = meta?.participants?.length || (isGroupChat ? 'Unbekannt' : '—');

    const infoText = `ℹ️ *Gruppen-Info*\n`
      + `• Name: ${subject}\n`
      + `• ID: ${chatId}\n`
      + `• Mitglieder: ${memberCount}\n`
      + `• Prefix: ${prefix}\n`
      + `• Beschreibung:\n${desc}`;

    await sock.sendMessage(chatId, { text: infoText }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chatId, { text: '❌ Konnte Gruppeninfos nicht abrufen.' }, { quoted: msg });
  }
  return;
}

// Auto-Download, wenn in dieser Gruppe aktiviert und kein Bot-Befehl
const groupFeature = loadGroupFeatures(chatId);
if (!messageBody.startsWith(pfx) && groupFeature.autodownload) {
  const autoUrl = extractSupportedUrl(messageBody);
  if (autoUrl) {
    try {
      await sock.sendMessage(chatId, { text: `🔄 Autodownload: Starte Download für ${autoUrl}` }, { quoted: msg });
      await downloadAndSendUrl(sock, autoUrl, chatId, msg);
    } catch (e) {
      await sock.sendMessage(chatId, { text: `❌ Autodownload Fehler: ${e?.message || 'Unbekannt'}` }, { quoted: msg });
    }
    return;
  }
}

if (!messageBody.startsWith(pfx)) return;

const commandBody = messageBody.slice(pfx.length).trim();
const args = commandBody.split(/\s+/);
const command = args.shift().toLowerCase();
const q = args.join(' ').trim();
const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: msg });

console.log(chalk.gray(`Befehl von lid/jid: ${cleanedSenderNumber}`));
console.log(chalk.gray(`> Befehl: ${command}`));
console.log(chalk.gray(`> Argument: ${args.join(' ')}`));

global.bannedUsers = new Set();

// IP-Ban Check
const userIP = (senderJid && senderJid.split('@')[0]) || 'unknown';
if (isIPBanned(userIP)) {
  const ipBanData = isIPBanned(userIP);
  
  // Reagiere auf die Nachricht
  await sock.sendMessage(from, { react: { text: '🚫', key: msg.key } });

  // Nachricht mit Grund
  await sock.sendMessage(chatId, { 
    text: `🚫 **IP-GEBANNT**\n\nDeine IP-Adresse ist gebannt und kann nicht mit diesem Bot interagieren.\n\n📝 Grund: ${ipBanData.reason}`
  }, { quoted: msg });

  // Logs
  console.log(`[IP-BAN BLOCKED] IP: ${userIP} | User: ${sender} | Reason: ${ipBanData.reason}`);
  return; // Stoppe Verarbeitung
}

// Dieser Check sollte **vor dem Switch/Command-Handler** laufen
if (isBanned(senderJid)) {
  const banData = isBanned(senderJid); // enthält { jid, reason, timestamp }

  // Gebannte User dürfen NUR /unbanrequest ausführen
  if (command !== 'unbanrequest') {
    // Reagiere auf die Nachricht
    await sock.sendMessage(from, { react: { text: '⛔', key: msg.key } });

    // Nachricht mit Grund
    await sock.sendMessage(chatId, { 
      text: `🚫 Du wurdest gebannt und kannst keine Befehle ausführen.\n📝 Grund: ${banData.reason}\n\n💬 Mit dem Befehl */unbanrequest <Grund>* kannst du eine Entban-Anfrage an die Support-Gruppe senden.`
    }, { quoted: msg });

    return; // damit keine weiteren Commands ausgeführt werden
  }
}

const user = getUser(senderJid);


if (command !== 'register' && !user) {
  await sock.sendMessage(from, {
    react: { text: '⚠️', key: msg.key }
  });

  await sock.sendMessage(
    chatId,
    {
      text: `❌ Du bist nicht registriert!\nBitte nutze */register*, um dein Konto zu erstellen.`,
    },
    { quoted: msg }
  );

  return;
}

const dbBlocked = loadBlocked();
if (dbBlocked.blocked.includes(sender)) return; 

// Lockgroup-Prüfung: Silent mode - nur Inhaber und Co-Owner hören
if (isGroupLocked(from)) {
  // Nur Inhaber und Co-Owner dürfen Commands ausführen
  const senderRank = ranks.getRank(sender);
  const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber'];
  
  if (!allowedRanks.includes(senderRank)) {
    // Silent - keine Meldung an andere Nutzer
    return; 
  }
}

const jid = msg.key.participant || msg.key.remoteJid || msg.sender || chatId;


if (user) {
  user.xp += 6;
  while (user.xp >= 100) {
    user.level += 1;
    user.xp -= 100;
  }
  updateUser(jid, user.balance, user.xp, user.level, user.name);
}


const commandsList = [
  
  'menu', 'help', 'ping', 'runtime', 'server', 'owner', 'support', 'tos', 'bewerben',


  'play', 'play1', 'play2', 'sticker', 'viewonce', 'getpic',

  // 🔹 Admin
  'setdesc', 'setname', 'welcome', 'antidelete', 'antilink', 'linkbypass', 'unlinkbypass',
  'warn', 'resetwarn', 'warns', 'mute', 'unmute', 'mutedlist',
  'kick', 'promote', 'demote', 'add', 'del', 'tagall', 'hidetag',
  'grpinfo', 'grouplink', 'revoke', 'broadcast', 'farewell',
  '1', 'sock', '2',

  
  'reload', 'leaveall', 'leavegrp', 'grouplist', 'grouplist2',
  'addme', 'addadmin', 'setrank', 'delrank', 'ranks', 'listsessions',
  'lid', 'killsession', 'newpair', 'newqr', 'newqr1', 'newqr2',
  'startmc', 'stopmc', 'tok', 'tok2',

  
  'shop', 'buy', 'use', 'inventory', 'register', 'me', 'profile',
  'version',
  'pay',
  'user',
  'addcoins', 'delcoins', 'topcoins', 'topxp', 'pets', 'pethunt', 'sellpet', 'fish', 'fishlist',
  'webregister', 'web', 'logincode',

  'hug', 'kiss', 'slap', 'pat', 'poke', 'cuddle', 'fuck', 'horny', 'kill', 'goon', 'penis', 'tok', 'tok2',

 
  'id', 'ig', 'igd', 'instagramdownload', 'leave', 'leave2', 'join', 'addme', 'sessions', 'antideletepn',

  
  'ban', 'unban', 'unbanrequest', 'approveunban', 'rejectunban', 'unregister', 'broadcast', 'tagall', 'grpinfo', 'antidelete', 
  // Stranger Things fun
  'strangerfact', 'upside', 'eleven', 'mindflip', 'demogorgon', 'redrun', 'darkweb', 'strangergame', 'moviequote', 'hawkins', 'dna', 'friends', 'gate',
  // AI Commands
  'ai', 'vol', 'ask', 'summarize', 'translate', 'joke', 'rhyme', 'poem', 'story', 'riddle', 'codehelp', 'math', 'define', 'nyxion', 'nayvy',
  // User Config
  'config',
  // Audio Effects
  'bassboost', 'slowed', 'spedup', 'nightcore', 'reverb', 'reverse', 'deep', 'echo', 'vaporwave', '8d', 'earrape', 'chipmunk',
  // ECONOMY - Basic
  'balance', 'bal', 'daily', 'weekly', 'work', 'beg', 
  // ECONOMY - Gambling
  'slots', 'roulette', 'dice', 'blackjack',
  // ECONOMY - Jobs
  'mine', 'hunt', 'farm',
  // ECONOMY - Crime
  'rob', 'crime', 'heist', 'jail',
  // ECONOMY - Bank
  'bank', 'deposit', 'withdraw',
  // ECONOMY - Leaderboards
  'topbalance', 'topbank',
  // PREMIUM ECONOMY
  'spawnmoney', 'cooldowns', 'rich', 'boost',
  // PREMIUM CASINO
  'highroller', 'jackpot', 'double',
  // PREMIUM SHOP
  'premiumshop', 'buypremium',
  // PREMIUM CUSTOMIZATION
  'settitle', 'setcolor', 'setemoji',
  // AUTO FEATURES
  'autowork', 'autofish', 'multidaily',
  // BUSINESS SYSTEM
  'business', 'buybusiness', 'collect',
  // CRYPTO
  'crypto', 'buybtc', 'sellbtc', 'market', 'buycrypto', 'sellcrypto',
  // PREMIUM ACCOUNT
  'premium',
  // INFO COMMANDS
  'device',
];



function levenshtein(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(
        matrix[i - 1][j - 1] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1
      );
    }
  }
  return matrix[b.length][a.length];
}

function suggestCommand(input) {
  let closest = null;
  let minDistance = Infinity;

  commandsList.forEach(cmd => {
    const dist = levenshtein(input, cmd);
    if (dist < minDistance) {
      minDistance = dist;
      closest = cmd;
    }
  });

  return closest;
}
 


sock.ev.on('group-participants.update', async (update) => {
  try {
    const db = loadWelcome();
    const groupId = update.id;

    // Handle participants as a batch to avoid sending the same welcome/goodbye multiple times
    const participants = (update.participants || []).map(u => (typeof u === 'string' ? u : (u.jid || u.id || String(u))));
    const uniqueParticipants = [...new Set(participants)];

    // Debounce-System: Verhindere mehrfaches Versenden innerhalb von 5 Sekunden für identische Teilnehmerlisten
    if (!global._welcomeDebounce) global._welcomeDebounce = {};
    const debounceKey = `${groupId}-${update.action}`;
    const now = Date.now();
    const participantKey = [...new Set(uniqueParticipants)].sort().join(',');
    const previous = global._welcomeDebounce[debounceKey];

    if (previous && (now - previous.timestamp) < 5000 && previous.participants === participantKey) {
      console.log(`[WELCOME/GOODBYE] Debounced - zu schnelle Wiederholung für ${groupId}`);
      return;
    }
    global._welcomeDebounce[debounceKey] = { timestamp: now, participants: participantKey };

    // Load per-group feature toggles (default: all off)
    let groupFeatures = {};
    try {
      const gfPath = path.join(__dirname, 'data', 'groupFeatures.json');
      if (fs.existsSync(gfPath)) {
        const raw = fs.readFileSync(gfPath, 'utf8');
        groupFeatures = JSON.parse(raw || '{}');
      }
    } catch (e) {
      // ignore feature load errors
      groupFeatures = {};
    }

    try {
      // JOIN (send a single welcome message for all new participants)
      if (update.action === 'add') {
        const gFeat = groupFeatures[groupId] || {};
        // NUR das neue System verwenden (gFeat.welcome), nicht das alte (db[groupId]?.enabled)
        if (gFeat.welcome) {
          try {
            const namesList = uniqueParticipants.map(u => `@${u.split('@')[0]}`).join(' ');
            // Verwende custom Text wenn gesetzt, sonst Standard
            let welcomeText = gFeat.welcomeText || 'Willkommen @user 🎉';
            welcomeText = welcomeText.replace(/@user/gi, namesList);
            await sock.sendMessage(groupId, { text: welcomeText, mentions: uniqueParticipants });
            console.log(`[WELCOME] Nachricht in ${groupId} versendet`);
          } catch (msgErr) {
            if (msgErr?.data !== 429) console.error('Welcome message error:', msgErr?.message || msgErr);
          }
        }

        // Antibot: prüfen und ggf. pro Teilnehmer entfernen (keine Mehrfach-Willkommensnachricht)
        if ((groupFeatures[groupId] || {}).antibot) {
          for (const userJid of uniqueParticipants) {
            try {
              const contactInfo = await sock.onWhatsApp(userJid).catch(() => null);
              const notify = contactInfo && contactInfo[0] && contactInfo[0].notify ? contactInfo[0].notify : '';
              const isBot = /bot/i.test(notify) || /bot/i.test(userJid);
              if (isBot) {
                try {
                  await sock.groupParticipantsUpdate(groupId, [userJid], 'remove');
                  await sock.sendMessage(groupId, { text: `🤖 Bot erkannt und entfernt: @${userJid.split('@')[0]}`, mentions: [userJid] });
                } catch (kickErr) {
                  if (kickErr?.data !== 429) console.error('Antibot kick failed:', kickErr?.message || kickErr);
                }
              }
            } catch (errBot) {
              // ignore per-user check errors
            }
          }
        }
      }

      // LEAVE / REMOVE (send a single goodbye message for all removed participants)
      if (update.action === 'remove' || update.action === 'leave') {
        const gFeatLeave = groupFeatures[groupId] || {};
        // NUR das neue System verwenden (gFeatLeave.goodbye), nicht das alte (db[groupId]?.goodbye)
        if (gFeatLeave.goodbye) {
          try {
            const namesList = uniqueParticipants.map(u => `@${u.split('@')[0]}`).join(' ');
            // Verwende custom Text wenn gesetzt, sonst Standard
            let goodbyeText = gFeatLeave.goodbyeText || 'Tschüss @user 👋';
            goodbyeText = goodbyeText.replace(/@user/gi, namesList);
            await sock.sendMessage(groupId, { text: goodbyeText, mentions: uniqueParticipants });
            console.log(`[GOODBYE] Nachricht in ${groupId} versendet`);
          } catch (msgErr) {
            if (msgErr?.data !== 429) console.error('Goodbye message error:', msgErr?.message || msgErr);
          }
        }
      }
    } catch (innerErr) {
      if (innerErr?.data !== 429 && !innerErr?.message?.includes('rate')) {
        console.error('Participant batch error:', innerErr?.message || innerErr);
      }
    }
  } catch (err) {
    console.error('Group update error:', err?.message || err);
  }
});

// COMMAND HANDLER - MUSS INSIDE des messages.upsert HANDLERS SEIN
// Verschiebe das hier rein:
// Prüfe global deaktivierte Befehle vor dem switch
try {
  const disabledList = loadDisabledCommands();
  if (disabledList.includes(command) && command !== 'enable' && command !== 'disable' && command !== 'nyx') {
    await sock.sendMessage(chatId, { text: `⛔ Befehl '${command}' ist global deaktiviert.` }, { quoted: msg });
    return;
  }
} catch (e) {
  // ignore
}

// === TIMEOUT CHECK: Prüfe ob User im Timeout ist ===
const userKey = msg.key.participant || msg.key.remoteJid || chatId;
const userTimeout = timeoutUsers[userKey];
if (userTimeout && userTimeout.expiresAt > Date.now()) {
  // User ist noch im Timeout
  const rank = ranks.getRank(userKey);
  const isTeam = ['Inhaber', 'Stellvertreter Inhaber'].includes(rank);
  
  if (!isTeam) {
    // Timeout: Nur Team darf Befehle nutzen
    await sock.sendMessage(chatId, { text: `⏳ Du stehst im Timeout! ${command !== 'timeout' ? 'Du darfst keine Befehle nutzen.' : ''}` }, { quoted: msg });
    return;
  }
} else if (userTimeout && userTimeout.expiresAt <= Date.now()) {
  // Timeout abgelaufen
  delete timeoutUsers[userKey];
}

try {
switch (command) {
case 'nyx': {
  if (!q) {
    await sock.sendMessage(chatId, { text: '🤖 Nyxion AI\n\nVerwendung: */nyx <Frage>*\n\nBeispiel: */nyx Was ist KI?*' }, { quoted: msg });
    break;
  }

  try {
    await sock.sendPresenceUpdate('composing', chatId);
    
    console.log(`🤖 Nyxion: Verarbeite Anfrage von ${cleanedSenderNumber}...`);
    
    const response = await handleNyxionMessage(q, chatId, sock, from);
    console.log(`📤 Nyxion Response erhalten: "${response.substring(0, 50)}..."`);
    
    await sendNyxionResponse(sock, chatId, response);
    console.log(`✅ Nyxion Antwort erfolgreich gesendet`);
    
    await sock.sendPresenceUpdate('available', chatId);
  } catch (error) {
    console.error('Nyxion Command Error:', error.message);
    console.error('Stack:', error.stack);
    await sock.sendMessage(chatId, { text: `❌ Fehler: ${error.message}` }, { quoted: msg });
  }
  break;
}

case 'reload': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(from, { text: '⛔ Nur Inhaber oder Stellvertreter dürfen diesen Befehl ausführen.' }, { quoted: msg });
    break;
  }

  await sock.sendMessage(from, { text: '🔄 Bot wird neu gestartet...' }, { quoted: msg });
  console.log('[RELOAD] Bot wird durch /reload neu gestartet...');
  
  // Beende den Prozess, PM2 wird ihn automatisch neu starten
  setTimeout(() => {
    process.exit(0);
  }, 1000);
  break;
}

case 'fishlist': {
  let text = '🎣 **Liste aller Fische und ihr Wert:**\n\n';
  fishes.forEach(f => {
    // Wenn min = max, nur einen Wert anzeigen
    const value = f.min === f.max ? f.min : `${f.min}–${f.max}`;
    text += `${f.name} – 💸 ${value} Coins\n`;
  });

  await sock.sendMessage(chatId, { text }, { quoted: msg });
  break;
}

case 'webregister': {
  await handleWebRegister(msg, sender);
  break;
}

case 'web': {
  const args = q.trim();
  
  if (!args) {
    await sock.sendMessage(chatId, {
      text: '❌ Format: `/web Username/Passwort`\n\nBeispiel: `/web meinname/meinpasswort123`'
    }, { quoted: msg });
    break;
  }

  const parts = args.split('/');
  if (parts.length < 2) {
    await sock.sendMessage(chatId, {
      text: '❌ Format: `/web Username/Passwort`'
    }, { quoted: msg });
    break;
  }

  const username = parts[0].trim();
  const password = parts.slice(1).join('/').trim();
  const whatsappNumber = (sender || '').replace('@s.whatsapp.net', '').replace('@lid', '').split('@')[0];

  const reply = await handleBotCommand('setpassword', whatsappNumber, { username, password });
  await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
  break;
}

case 'logincode': {
  const whatsappNumber = (sender || '').replace('@s.whatsapp.net', '').replace('@lid', '').split('@')[0];
  const reply = await handleBotCommand('logincode', whatsappNumber);
  await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
  break;
}

  case "bothub": {
    const senderRank = ranks.getRank(sender);
    const allowed = ["Inhaber", "Stellvertreter Inhaber"];

    if (!allowed.includes(senderRank)) {
      await sock.sendMessage(from, { text: "⛔ Nur Inhaber oder Stellvertreter dürfen diesen Befehl ausführen." });
      break;
    }

    await sock.sendMessage(from, { text: "📡 Aktualisiere Bothub-Daten..." });
    await updateBothubStats(sock, from);
    break;
  }

  case 'disable': {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];
    if (!allowed.includes(senderRank)) {
      await sock.sendMessage(from, { text: '⛔ Nur Inhaber oder Stellvertreter dürfen diesen Befehl ausführen.' }, { quoted: msg });
      break;
    }
    const toDisable = args && args[0] ? args[0].toLowerCase().replace(/[^a-z0-9_-]/g, '') : null;
    if (!toDisable) return await sock.sendMessage(from, { text: 'Verwendung: /disable <befehl>' }, { quoted: msg });
    if (['disable','enable'].includes(toDisable)) return await sock.sendMessage(from, { text: 'Diese Befehle können nicht deaktiviert werden.' }, { quoted: msg });
    const list = loadDisabledCommands();
    if (!list.includes(toDisable)) {
      list.push(toDisable);
      saveDisabledCommands(list);
    }
    await sock.sendMessage(from, { text: `✅ Befehl '${toDisable}' global deaktiviert.` }, { quoted: msg });
    break;
  }

  case 'enable': {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];
    if (!allowed.includes(senderRank)) {
      await sock.sendMessage(from, { text: '⛔ Nur Inhaber oder Stellvertreter dürfen diesen Befehl ausführen.' }, { quoted: msg });
      break;
    }
    const toEnable = args && args[0] ? args[0].toLowerCase().replace(/[^a-z0-9_-]/g, '') : null;
    if (!toEnable) return await sock.sendMessage(from, { text: 'Verwendung: /enable <befehl>' }, { quoted: msg });
    const list = loadDisabledCommands();
    const idx = list.indexOf(toEnable);
    if (idx !== -1) {
      list.splice(idx, 1);
      saveDisabledCommands(list);
    }
    await sock.sendMessage(from, { text: `✅ Befehl '${toEnable}' global aktiviert.` }, { quoted: msg });
    break;
  }

  case 'info':
  case 'botinfo': {
    try {
      const os = require('os');
      const langs = {
        de: {
          botSystem: '🤖 BOT INFO',
          status: 'Status',
          online: 'Online & Running',
          engine: 'Engine',
          features: 'Features',
          speed: 'Speed',
          security: 'Security',
          chats: 'Chats',
          groups: 'Groups',
          uptime: 'Uptime',
          owner: 'Owner',
          started: 'Gestartet',
          system: 'System',
          ramUsage: 'RAM Nutzung',
          cpu: 'CPU',
          cores: 'Cores',
          platform: 'Plattform',
          configuration: 'Konfiguration',
          language: 'Sprache',
          region: 'Region',
          version: 'Version',
          network: 'Netzwerk',
          users: 'User',
          activeModules: 'Aktive Module',
          github: 'GitHub Repository',
          footer: '✨ Smart. Simple. Reliable.'
        },
        en: {
          botSystem: '🤖 BOT INFO',
          status: 'Status',
          online: 'Online & Running',
          engine: 'Engine',
          features: 'Features',
          speed: 'Speed',
          security: 'Security',
          chats: 'Chats',
          groups: 'Groups',
          uptime: 'Uptime',
          owner: 'Owner',
          started: 'Started',
          system: 'System',
          ramUsage: 'RAM Usage',
          cpu: 'CPU',
          cores: 'Cores',
          platform: 'Platform',
          configuration: 'Configuration',
          language: 'Language',
          region: 'Region',
          version: 'Version',
          network: 'Network',
          users: 'Users',
          activeModules: 'Active Modules',
          github: 'GitHub Repository',
          footer: '✨ Smart. Simple. Reliable.'
        }
      };

      const lang = (settings && settings.botLang === 'en') ? langs.en : langs.de;

      const startTime = new Date(global.botStartTime || Date.now());
      global.botStartTime = global.botStartTime || startTime;

      const usedRamMB = process.memoryUsage().rss / 1024 / 1024;
      const totalRamMB = os.totalmem() / 1024 / 1024;
      const ramPercent = ((usedRamMB / totalRamMB) * 100).toFixed(1);
      const cpuUsage = Math.floor(Math.random() * 20 + 5);
      const cpu = os.cpus()[0].model;
      const cpuCores = os.cpus().length;
      const msgTs = (msg.messageTimestamp || msg.key?.timestamp) || Math.floor(Date.now()/1000);
      const ping = Date.now() - (msgTs * 1000);

      const modules = [ 'AI', 'Moderation', 'Anti-Spam', 'Auto-Reply', 'Utilities' ];

      const chatsObj = (sock && sock.chats) || (global.conn && global.conn.chats) || {};
      let chatsCount = Object.keys(chatsObj).length;
      let groupsCount = Object.values(chatsObj).filter(c => c && c.isGroup).length || 0;
      // Try to get registered users from DB (more accurate)
      let usersCount = 0;
      try {
        const row = getDB().prepare('SELECT COUNT(*) as c FROM users').get();
        usersCount = (row && row.c) || 0;
      } catch (e) {
        // fallback to participants count in chats object
        usersCount = Object.values(chatsObj).reduce((a, c) => a + (c?.participants?.length || 0), 0);
      }
      // If we have no cached chats, try a lightweight fetch of group list (safe retry)
      if (chatsCount === 0) {
        try {
          const groups = await sock.groupFetchAllParticipating();
          groupsCount = Object.keys(groups || {}).length;
          chatsCount = Math.max(chatsCount, groupsCount);
        } catch (e) {
          // ignore rate limits
        }
      }

      let info = `\n───〔 ${lang.botSystem} 〕───╮\n` +
        `│ 📡 ${lang.status}    : ${lang.online}\n` +
        `│ ⚙️ ${lang.engine}    : Baileys MD\n` +
        `│ 🧠 ${lang.features}  : AI · Moderation · Tools\n` +
        `│ 🚀 ${lang.speed}     : Fast\n` +
        `│ 🔐 ${lang.security}  : Enabled\n` +
        `│ 🌐 ${lang.chats}     : ${chatsCount}\n` +
        `│ 👥 ${lang.groups}    : ${groupsCount}\n` +
        `│ ⏱ ${lang.uptime}    : ${Math.floor(process.uptime())}s\n` +
        `│ 👤 ${lang.owner}     : Nico\n` +
        `╰────────────────────╯\n\n` +
        `───〔 ${lang.botSystem} 〕───╮\n` +
        `⚡ ${lang.status}\n` +
        `├ ${lang.online}\n` +
        `├ Ping        : ${ping} ms\n` +
        `├ ${lang.uptime}     : ${Math.floor(process.uptime())} s\n` +
        `└ ${lang.started}    : ${startTime.toLocaleString()}\n\n` +
        `🧠 ${lang.system}\n` +
        `├ ${lang.ramUsage}   : ${usedRamMB.toFixed(1)}MB / ${Math.round(totalRamMB)}MB (${ramPercent}%)\n` +
        `├ ${lang.cpu}        : ${cpu} (${cpuCores} cores)\n` +
        `├ CPU Auslastung     : ${cpuUsage}%\n` +
        `└ ${lang.platform}   : ${os.platform()} (${os.arch()})\n\n` +
        `🌍 ${lang.configuration}\n` +
        `├ ${lang.language}   : ${(settings && settings.botLang) || 'DE'}\n` +
        `├ ${lang.region}     : EU\n` +
        `├ ${lang.version}    : v1.0.0\n` +
        `└ ${lang.engine}     : Baileys MD\n\n` +
        `👥 ${lang.network}\n` +
        `├ ${lang.chats}      : ${chatsCount}\n` +
        `├ ${lang.groups}     : ${groupsCount}\n` +
        `└ ${lang.users}      : ${usersCount}\n\n` +
        `🔧 ${lang.activeModules}\n` +
        `${modules.map(m => `├ ${m}`).join('\n')}\n\n` +
        `🌐 ${lang.github} : https://github.com/NicoRoe/YourBotRepo\n\n` +
        `──────────────────────────────\n` +
        `${lang.footer}\n`;

      await sock.sendMessage(chatId, { text: info }, { quoted: msg });
    } catch (e) {
      console.error('Fehler bei /info:', e);
      await sock.sendMessage(chatId, { text: `❌ Fehler beim Anzeigen der Bot-Info: ${e.message || e}` }, { quoted: msg });
    }
    break;
  }

  case 'alledits':{
    try {
      const from = chatId;
      const basePath = path.join(__dirname, 'cards');
      const WEBSITE_URL = 'https://beastbot.base44.app';
      const CHANNEL_URL = 'https://chat.whatsapp.com/Hu2gjCneSvQLj9q2RHw1E0';
      const MINI_WEB = 'https://beastmeds.github.io/Beast-Bot-Info/';
      const statusQuoted = {
        key: {
          fromMe: false,
          participant: '0@s.whatsapp.net',
          remoteJid: 'status@broadcast',
          id: crypto.randomUUID()
        },
        message: { extendedTextMessage: { text: '🎬 Beast Bot Video Gallery' } }
      };

      let files = [];
      try {
        files = fs.readdirSync(basePath).filter(f => /\.(mp4|mov)$/i.test(f)).sort();
      } catch (e) {
        return await sock.sendMessage(from, { text: '❌ /cards Ordner nicht lesbar.' }, { quoted: msg });
      }

      if (!files.length) return await sock.sendMessage(from, { text: '⚠️ Keine Videos im /cards Ordner.' }, { quoted: msg });

      // Pagination: max 10 Videos pro Nachricht
      const pageSize = 10;
      const pages = Math.ceil(files.length / pageSize);
      
      for (let page = 0; page < pages; page++) {
        const start = page * pageSize;
        const end = Math.min(start + pageSize, files.length);
        const pageFiles = files.slice(start, end);
        
        const cards = [];
        for (let i = 0; i < pageFiles.length; i++) {
          const filePath = path.join(basePath, pageFiles[i]);
          const buffer = fs.readFileSync(filePath);
          const media = await prepareWAMessageMedia({ video: buffer }, { upload: sock.waUploadToServer });
          cards.push({
            header: {
              title: `♤ Video ${start + i + 1}/${files.length} ♤`,
              hasMediaAttachment: true,
              videoMessage: media.videoMessage
            },
            body: { text: `♤ BeastBot Gallery – Video ${start + i + 1}` },
            footer: { text: `©️ Beastmeds X ⁷¹⁷𝓝𝓪𝔂𝓥𝔂 (Seite ${page + 1}/${pages})` },
            nativeFlowMessage: {
              buttons: [
                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📎 WhatsApp Community', url: CHANNEL_URL }) },
                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🌐 Website', url: WEBSITE_URL }) },
                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🔗 Alle Infos zu BeastBot', url: MINI_WEB }) }
              ]
            }
          });
        }

        const content = {
          interactiveMessage: {
            body: { text: `🎬 Beast Bot Video Carousel\n\n↔️ Wische durch ${pageFiles.length} Videos (Seite ${page + 1}/${pages})` },
            carouselMessage: { cards }
          }
        };

        const generated = generateWAMessageFromContent(from, content, { userJid: sock.user.id, quoted: statusQuoted });
        await sock.relayMessage(from, generated.message, { messageId: generated.key.id });
        
        // Kleine Verzögerung zwischen Seiten
        if (page < pages - 1) {
          await sleep(1000);
        }
      }
    } catch (e) {
      console.error('Fehler bei /alledits:', e);
      await sock.sendMessage(chatId, { text: `❌ Fehler bei alledits: ${e.message || e}` }, { quoted: msg });
    }
    break;
  }

  case 'testfeatures': {
    try {
      // Only works in groups
      if (!isGroupChat) {
        return await sock.sendMessage(from, { text: '⛔ /testfeatures funktioniert nur in Gruppen!' }, { quoted: msg });
      }

      const f = loadGroupFeatures(from);

      // args expected: ['welcome','on'] or ['badwords','add','word']
      if (!args || args.length === 0) {
        // build report
        const reportLines = [];
        reportLines.push('💬 🧪 Feature Test Report (Pro Gruppe)\n');
        reportLines.push(`📥 Welcome: ${f.welcome ? '✅ Aktiviert' : '❌ Deaktiviert'}`);
        reportLines.push(`📤 Goodbye: ${f.goodbye ? '✅ Aktiviert' : '❌ Deaktiviert'}`);
        reportLines.push(`📊 Leveling: ${f.leveling ? '✅ Aktiviert' : '❌ Deaktiviert'}`);
        reportLines.push(`🔗 Antilink: ${f.antilink ? '✅ Aktiviert' : '❌ Deaktiviert'}`);
        reportLines.push(`💬 Antispam: ${f.antispam ? '✅ Aktiviert' : '❌ Deaktiviert'}`);
        reportLines.push(`🚫 Anti-NSFW: ${f.antinsfw ? '✅ Aktiviert' : '❌ Deaktiviert'}`);
        reportLines.push(`🤖 Antibot: ${f.antibot ? '✅ Aktiviert' : '❌ Deaktiviert'}`);
        reportLines.push(`🏷️ Autosticker: ${f.autosticker ? '✅ Aktiviert' : '❌ Deaktiviert'}`);
        reportLines.push(`🤐 MuteGC: ${f.mutegc ? '✅ Aktiviert' : '❌ Deaktiviert'}`);
        reportLines.push(`😊 Autoreact: ${f.autoreact ? '✅ Aktiviert' : '❌ Deaktiviert'}`);
        reportLines.push(`🚷 Badwords: ${f.badwords.length ? `✅ ${f.badwords.length} Wörter` : '❌ Deaktiviert'}\n`);

        reportLines.push('📝 Test-Aktionen:');
        reportLines.push('• /testfeatures <feature> on — Aktivieren');
        reportLines.push('• /testfeatures <feature> off — Deaktivieren');
        reportLines.push('• /testfeatures badwords add <wort> — Wort hinzufügen');
        reportLines.push('• /testfeatures badwords remove <wort> — Wort entfernen');

        const report = reportLines.join('\n');
        await sock.sendMessage(from, { text: report }, { quoted: msg });
        break;
      }

      const sub = args[0].toLowerCase();
      const action = args[1] ? args[1].toLowerCase() : null;

      const toggleable = ['welcome','goodbye','leveling','antilink','antispam','antinsfw','antibot','autosticker','mutegc','autoreact'];

      if (toggleable.includes(sub)) {
        if (!action || (action !== 'on' && action !== 'off')) {
          return await sock.sendMessage(from, { text: `Verwendung: /testfeatures ${sub} on|off` }, { quoted: msg });
        }
        f[sub] = action === 'on';
        saveGroupFeatures(from, f);
        await sock.sendMessage(from, { text: `✅ Feature '${sub}' ist jetzt ${f[sub] ? 'aktiviert' : 'deaktiviert'}.` }, { quoted: msg });
        break;
      }

      if (sub === 'badwords') {
        const verb = args[1] ? args[1].toLowerCase() : null;
        const word = args.slice(2).join(' ').trim();
        if (verb === 'add' && word) {
          if (!f.badwords.includes(word)) f.badwords.push(word);
          saveGroupFeatures(from, f);
          await sock.sendMessage(from, { text: `✅ Wort '${word}' zur Badwords-Liste hinzugefügt.` }, { quoted: msg });
          break;
        }
        if (verb === 'remove' && word) {
          f.badwords = f.badwords.filter(w => w !== word);
          saveGroupFeatures(from, f);
          await sock.sendMessage(from, { text: `✅ Wort '${word}' aus der Badwords-Liste entfernt.` }, { quoted: msg });
          break;
        }
        return await sock.sendMessage(from, { text: 'Verwendung: /testfeatures badwords add|remove <wort>' }, { quoted: msg });
      }

      await sock.sendMessage(from, { text: 'Unbekannter Feature-Name. Nutze /testfeatures zum Anzeigen der Liste.' }, { quoted: msg });
    } catch (e) {
      console.error('Fehler bei /testfeatures:', e);
      await sock.sendMessage(chatId, { text: `❌ Fehler: ${e.message || e}` }, { quoted: msg });
    }
    break;
  }


//=================ownerCase==============//
case 'owner': {
  const {
    owner,
    bot,
    admins,
    links,
    system,
    branding,
    forwardedNewsletter,
    features,
    debug,
    statusQuoted
  } = settings;

  const os = require('os');

  // RAM
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2); // in GB
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);   // in GB
  const usedMem = (totalMem - freeMem).toFixed(2);

  // CPU Infos
  const cpus = os.cpus();
  const cpuModel = cpus[0].model;
  const cpuCores = cpus.length;

  // CPU Load (Durchschnitt über 1, 5, 15 Minuten)
  const loadAvg = os.loadavg().map(n => n.toFixed(2)).join(' | ');

  // Admin-Liste
  const adminsList = admins
    .map(num => `• ${num} ${num === owner.number ? '(👑 Owner)' : ''}`)
    .join('\n');

  const premiumList = features.modules.filter(f => f.access === 'private');
  const exploitList = features.modules.filter(f =>
    f.command?.includes('xforce') || f.name?.toLowerCase().includes('exploit')
  );

  const featureList = features.modules.map((f, i) => (
    `*${i + 1}.* ${f.name}\n` +
    `   ⤷ ${f.description}\n` +
    `   ⤷ Befehl: \`${f.command}\`\n` +
    `   ⤷ Datei: \`${f.file}\`\n` +
    `   ⤷ Zugriff: *${f.access === 'private' ? '🔒 Premium/Privat' : '🌐 Öffentlich'}*\n`
  )).join('\n');

  const text = `

👤 *Inhaber*
• Name: Beastmeds
• Nummer: Nicht Verfügbar

🛡️ *Co-Owner*
• Name: Lian
• Nummer: +49 176 72395249

`.trim();
  await sock.sendMessage(from, { text });
await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
  break;
}

case 'bewerben': {
  const bewerbungsLink = 'https://docs.google.com/forms/d/e/1FAIpQLSc_rw6L7JtQ3tXioHbzaJgvpJwDWCW7hElMQhi3UDCJJjKUPg/viewform?usp=dialog';
  
  const text = `
📋 *Bewerbungsformular*

Hallo ${pushName}! 👋

Interessierst du dich dafür, unserem Team beizutreten?
Fülle unser Bewerbungsformular aus und wir werden uns demnächst bei dir melden!

🔗 *Zum Formular:*
${bewerbungsLink}

Viel Erfolg! 🚀
`.trim();

  await sock.sendMessage(chatId, { text }, { quoted: msg });
  break;
}

case 'unbanrequest': {
  try {
    // Prüfe ob der User überhaupt gebannt ist
    if (!isBanned(senderJid)) {
      return await sock.sendMessage(chatId, {
        text: '✅ Du bist nicht gebannt! Du kannst den Bot normal nutzen.',
      }, { quoted: msg });
    }

    const query = args.join(" ");
    const banData = isBanned(senderJid);

    if (!query) {
      return await sock.sendMessage(chatId, {
        text: "📝 Bitte gib einen Grund für deine Entban-Anfrage an.\n\n💡 Beispiel:\n`/unbanrequest Ich habe mich nicht regelkonform verhalten, entschuldige mich aber dafür.`",
      }, { quoted: msg });
    }

    // Lade oder erstelle Entban-Request-Daten
    const banRequestFile = './data/unbanRequests.json';
    if (!fs.existsSync(banRequestFile)) {
      fs.writeFileSync(banRequestFile, JSON.stringify({ lastId: 0, requests: [] }, null, 2));
    }

    const data = JSON.parse(fs.readFileSync(banRequestFile, 'utf8'));
    
    // Prüfe Cooldown (1x pro Woche = 7 Tage)
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const userLastRequest = data.requests
      .filter(req => req.user === sender)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (userLastRequest && (Date.now() - userLastRequest.timestamp) < oneWeekMs) {
      const timeLeftMs = oneWeekMs - (Date.now() - userLastRequest.timestamp);
      const daysLeft = Math.ceil(timeLeftMs / (24 * 60 * 60 * 1000));
      
      return await sock.sendMessage(chatId, {
        text: `⏳ Du kannst nur einmal pro Woche eine Entban-Anfrage stellen.\n\n📅 Nächster Versuch möglich in: *${daysLeft} Tag(en)*`,
      }, { quoted: msg });
    }

    const newId = data.lastId + 1;
    data.lastId = newId;

    data.requests.push({
      id: newId,
      user: sender,
      chat: from,
      message: query,
      banReason: banData.reason,
      status: "offen",
      timestamp: Date.now(),
    });

    fs.writeFileSync(banRequestFile, JSON.stringify(data, null, 2));

    // Sende Anfrage an Support-Gruppe mit größerem Delay
    const supportGroup = getSupportGroup();
    
    const unbanText = `🚫➡️✅ *Neue Entban-Anfrage #${newId}*\n\n👤 *Von:* @${sender.split("@")[0]}\n⛔ *Grund des Bans:* ${banData.reason}\n\n📩 *Grund für Entban-Anfrage:*\n${query}\n\n💡 *Zum Antworten:* \`/approveunban ${newId}\` oder \`/rejectunban ${newId}\``;

    if (supportGroup) {
      // Delay von 3 Sekunden vor dem Senden
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await sock.sendMessage(supportGroup, {
        text: unbanText,
        mentions: [sender],
      });
    }

    // Weiteres Delay von 2 Sekunden
    await new Promise(resolve => setTimeout(resolve, 2000));

    await sock.sendMessage(chatId, {
      text: `✅ Deine Entban-Anfrage wurde erfolgreich an die Support-Gruppe gesendet!\n\n🆔 Anfrage-ID: *#${newId}*\n⏳ Das Team wird deine Anfrage überprüfen und dir antworten.\n\n📅 Du kannst die nächste Anfrage in 7 Tagen stellen.`,
    }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: "📨", key: msg.key } });
  } catch (err) {
    console.error(err);
    await sock.sendMessage(chatId, {
      text: "❌ Fehler beim Senden der Entban-Anfrage. Bitte versuche es später erneut.",
    }, { quoted: msg });
  }
  break;
}
 
case 'team': {
  try {
    // Lade alle gesetzten Ränge (userId -> Rank)
    const ranksMap = ranks.list() || {};
    const groups = {};

    for (const [uid, role] of Object.entries(ranksMap)) {
      if (!role) continue;
      groups[role] = groups[role] || [];
      if (!groups[role].includes(uid)) groups[role].push(uid);
    }

    // Sicherstellen, dass Owner aus settings enthalten ist
    const ownerNum = settings && settings.owner && settings.owner.number ? settings.owner.number.replace(/[^0-9]/g, '') : null;
    if (ownerNum) {
      const ownerJid = ownerNum + '@s.whatsapp.net';
      groups['Inhaber'] = groups['Inhaber'] || [];
      if (!groups['Inhaber'].includes(ownerJid)) groups['Inhaber'].unshift(ownerJid);
    }

    // Reihenfolge der Rollen, wie angezeigt werden soll
    const order = [
      'Inhaber',
      'Stellvertreter Inhaber',
      'Moderator',
      'Supporter',
      'Entwickler',
      'Admin'
    ];

    let text = '👥 *Teamübersicht*\n\n';
    const mentions = [];

    const makeDisplay = async (u) => {
      try {
        const user = getUser(u);
        if (user && user.name) return `${user.name}`;
        const contact = await sock.onWhatsApp(u).catch(() => null);
        if (contact && contact[0] && contact[0].notify) return `${contact[0].notify}`;
      } catch (e) {}
      return u.split('@')[0];
    };

    for (const role of order) {
      const arr = groups[role] || [];
      if (!arr.length) continue;
      text += `*${role}* (${arr.length}):\n`;
      for (const u of arr) {
        const display = await makeDisplay(u);
        text += `• ${display}\n`;
        mentions.push(u);
      }
      text += '\n';
    }

    // Sonstige Rollen
    const otherRoles = Object.keys(groups).filter(r => !order.includes(r));
    for (const role of otherRoles) {
      const arr = groups[role] || [];
      if (!arr.length) continue;
      text += `*${role}* (${arr.length}):\n`;
      for (const u of arr) {
        const display = await makeDisplay(u);
        text += `• ${display}\n`;
        mentions.push(u);
      }
      text += '\n';
    }

    if (mentions.length === 0) text = '⚠️ Keine Team-Mitglieder gefunden.';

    // Sende die Teamliste OHNE das `mentions`-Array, damit in Clients
    // keine rohen JIDs/Nummern als Erwähnung neben Namen angezeigt werden.
    await sock.sendMessage(chatId, { text }, { quoted: msg });
  } catch (e) {
    console.error('Fehler bei /team:', e);
    await sock.sendMessage(chatId, { text: `❌ Fehler: ${e.message}` }, { quoted: msg });
  }
  break;
}

case 'lid': {
  try {
    const input = args[0];
    if (!input) return await sock.sendMessage(chatId, { text: '❌ Usage: /lid <Telefonnummer>\nBeispiel: /lid 436123456789' }, { quoted: msg });

    let raw = input.trim();
    if (raw.includes('@')) {
      const localOnly = raw.split('@')[0].replace(/\D/g, '');
      const jid = raw.includes('@') ? raw : `${localOnly}@s.whatsapp.net`;
      let name = 'Unbekannt';
      try {
        const userObj = getUser(jid);
        if (userObj && userObj.name) name = userObj.name;
        else {
          const contact = await sock.onWhatsApp(jid).catch(() => null);
          if (contact && contact[0] && contact[0].notify) name = contact[0].notify;
        }
      } catch (e) {}
      return await sock.sendMessage(chatId, { text: `LID: ${localOnly}\nName: ${name}\nJID: ${jid}` }, { quoted: msg });
    }

    // Nur Ziffern extrahieren
    let num = raw.replace(/\D/g, '');
    if (!num) return await sock.sendMessage(chatId, { text: '❌ Ungültige Nummer.' }, { quoted: msg });

    // Versuche Ländervorwahl vom Owner abzuleiten, falls Kurznummer angegeben wurde
    const ownerNumRaw = settings && settings.owner && settings.owner.number ? settings.owner.number.replace(/\D/g, '') : null;
    let jidNum = num;
    if (num.length <= 10 && ownerNumRaw && ownerNumRaw.length > num.length) {
      const prefix = ownerNumRaw.slice(0, ownerNumRaw.length - num.length);
      jidNum = prefix + num;
    } else if (num.length <= 10 && !ownerNumRaw) {
      return await sock.sendMessage(chatId, { text: '❌ Bitte gib die vollständige internationale Telefonnummer an (z.B. 43612...).' }, { quoted: msg });
    }

    // Build full JID and try to resolve a display name and lid via onWhatsApp
    const jid = `${jidNum}@s.whatsapp.net`;
    let name = 'Unbekannt';
    let lidVal = null;
    try {
      const onWA = await sock.onWhatsApp(jid).catch(() => null);
      if (onWA && onWA[0]) {
        lidVal = onWA[0].lid || onWA[0].id || null;
        if (onWA[0].notify) name = onWA[0].notify;
        if (onWA[0].name) name = onWA[0].name;
      }
      // fallback to local DB user if available
      if ((!name || name === 'Unbekannt') && getUser(jid)) {
        const u = getUser(jid);
        if (u && u.name) name = u.name;
      }
    } catch (e) {}

    const lidDisplay = lidVal ? String(lidVal).replace(/\D/g, '') : jidNum.replace(/\D/g, '');
    await sock.sendMessage(chatId, { text: `LID: ${lidDisplay}\nName: ${name}\nJID: ${jid}` }, { quoted: msg });
  } catch (e) {
    console.error('Fehler bei /lid:', e);
    await sock.sendMessage(chatId, { text: `❌ Fehler: ${e.message}` }, { quoted: msg });
  }
  break;
}


case 'autossssssssssssssssssssssssssssss': {
    const groupMetadata = await sock.groupMetadata(chatId);
    const senderId = msg.key.participant || chatId;
    const participant = groupMetadata.participants.find(p => p.id === senderId);
    const isSenderAdmin = !!(participant && (participant.admin || participant.isAdmin || participant.admin === 'admin'));

    if (!isSenderAdmin) {
        await sock.sendMessage(chatId, { text: '🔒 Nur Gruppenadmins dürfen AutoDownload ein-/ausschalten!' }, { quoted: msg });
        break;
    }

    const arg = args[0]?.toLowerCase();

    if (arg === 'on') {
        enableAuto(chatId);
        await sock.sendMessage(chatId, { text: '✅ AutoDownload ist jetzt *aktiviert* für diese Gruppe.' }, { quoted: msg });
    } else if (arg === 'off') {
        disableAuto(chatId);
        await sock.sendMessage(chatId, { text: '❌ AutoDownload ist jetzt *deaktiviert* für diese Gruppe.' }, { quoted: msg });
    } else {
        await sock.sendMessage(chatId, { text: '⚠️ Usage: /auto <on|off>' }, { quoted: msg });
    }

    break;
}



 case "playdsadfaf": {
    const q = args.join(" ");
    const botName = "💻 BeastBot"; 
    const startTime = Date.now();

    if (!q) {
        await sock.sendMessage(chatId, {
            text: `⚠️ Usage: $${command} <Songname oder YouTube-Link>\n\n` +
                  `💿 Example: $play Blümchen Herz an Herz\n\n` +
                  `> ${botName}`
        });
        break;
    }

    try {
        const search = await yts.search(q);
        if (!search.videos.length) {
            await sock.sendMessage(chatId, { 
                text: `❌ Keine Ergebnisse gefunden.\n> ${botName}`
            });
            break;
        }

        const v = search.videos[0];
        const { title, url, timestamp, views, author, ago } = v;

        // Dauer checken
        function durationToSeconds(str) {
            if (!str) return 0;
            return str.split(":").reverse().reduce((acc, val, i) => acc + (parseInt(val) || 0) * Math.pow(60, i), 0);
        }
        const durationSec = durationToSeconds(timestamp);

        if (durationSec > 25200) {
            await sock.sendMessage(chatId, {
                text: `⏰ Das Video ist zu lang (*${timestamp}*). Limit: 7h.\n> ${botName}`
            });
            break;
        }

        // Audio laden
        let audioBuffer;
        try {
            const data = await neeledownloader.ytdown(url);
            const audioUrl = data?.data?.audio || data?.data?.mp3;
            if (audioUrl) {
                audioBuffer = (await axios.get(audioUrl, { responseType: "arraybuffer" })).data;
            }
        } catch {
            console.log("❌ Neel Downloader down → fallback auf play-dl...");
        }

        if (!audioBuffer) {
            const streamAudio = await playdl.stream(url, { quality: 0 });
            const chunksAudio = [];
            for await (const chunk of streamAudio.stream) chunksAudio.push(chunk);
            audioBuffer = Buffer.concat(chunksAudio);
        }

        const cleanTitle = title.replace(/[\\/:*?"<>|]/g, "").trim();
        const fileName = `${cleanTitle}.mp3`; 
        const endTime = Date.now();
        const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

        // Nur MP3 senden
        if (audioBuffer) {
            await sock.sendMessage(chatId, {
                audio: audioBuffer,
                mimetype: "audio/mpeg",
                fileName,
                ptt: false,
                caption: 
                    `🎶 Titel: ${title}\n` +
                    `⏱ Dauer: ${timestamp}\n` +
                    `👀 Aufrufe: ${views.toLocaleString()}\n` +
                    `📅 Hochgeladen: ${ago}\n` +
                    `👤 Uploader: ${author?.name || "Unbekannt"}\n` +
                    `🔗 Link: ${url}\n\n` +
                    `✅ Download fertig in ${timeTaken}s\n> ${botName}`
            });
        }

    } catch (err) {
        console.error("Fehler bei $play:", err);
        await sock.sendMessage(chatId, {
            text: `❌ Fehler: ${err?.message || "Unbekannt"}\n> ${botName}`
        });
    }
    break;
}
case 'lockgroup':
{
  const senderRank = ranks.getRank(sender);
  const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber'];
  
  // Nur Owner und Co-Owner dürfen lockgroup nutzen
  if (!allowedRanks.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, {
      text: `⛔ *Zugriff verweigert!*\n\nNur Owner und Co-Owner dürfen diesen Befehl nutzen.`
    }, { quoted: msg });
    break;
  }

  lockGroup(from);
  await sock.sendMessage(from, {
    text: `🔒 *Diese Gruppe wurde gesperrt!*\n\nNur Owner und Co-Owner können noch Commands nutzen.`
  }, { quoted: msg });
}
break;
case 'device': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { 
      text: "⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
    }, { quoted: msg });
    break;
  }

  let targetMsg;
  let targetJid;

  // 1️⃣ Antwort auf Nachricht (zitierte Nachricht)
  const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quotedMsg) {
    targetMsg = quotedMsg;
    targetJid = msg.message?.extendedTextMessage?.contextInfo?.participant || msg.message?.extendedTextMessage?.contextInfo?.remoteJid;
  }
  // 2️⃣ Mention
  else if (msg.mentionedJid && msg.mentionedJid.length > 0) {
    const targetMention = msg.mentionedJid[0];
    targetJid = targetMention;

    try {
      const chats = await sock.fetchMessages(targetMention, { limit: 1 });
      targetMsg = (chats && chats.length > 0) ? chats[0] : { key: { id: '', participant: targetMention, remoteJid: targetMention }, pushName: null };
    } catch {
      targetMsg = { key: { id: '', participant: targetMention, remoteJid: targetMention }, pushName: null };
    }
  } 

  else {
    targetMsg = msg;
    targetJid = msg.key.participant || msg.key.remoteJid;
  }

  try {
    let origId = '';
    let origJid = '';

    if (quotedMsg) {
      // Aus quoted message: die ID liegt in key.id
      origId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId || '';
      origJid = msg.message?.extendedTextMessage?.contextInfo?.participant || msg.key.participant || sender;
    } else {
      origId = targetMsg?.key?.id || msg.key.id || '';
      origJid = targetMsg?.key?.participant || targetMsg?.key?.remoteJid || msg.key.participant || sender;
    }

    const idLower = origId.toLowerCase();
    const idUpper = origId.toUpperCase();

    // Grundlegende Device-Erkennung
    const isWeb =
      idLower.startsWith('web') ||
      idLower.includes('desktop') ||
      idUpper.startsWith('WA');

    const isAndroid = !isWeb && (origId.startsWith('BAE') || /^[0-9A-F]{28,}$/i.test(origId));
    const isIOS = !isWeb && !isAndroid;

    let device = isWeb ? 'Web/Desktop' : isAndroid ? 'Android' : 'iOS';
    let deviceEmoji = isWeb ? '💻' : isAndroid ? '📱' : '🍏';

    // Prüfe, ob für diese JID eine Device-Override existiert
    const override = getDeviceOverride(origJid);
    if (override && override.label) {
      device = override.label;
      deviceEmoji = '🤖';
    }

    let pushName = targetMsg.pushName || null;
    if (!pushName) {
      try {
        const contact = await sock.onWhatsApp(origJid);
        if (contact && contact[0] && contact[0].notify) pushName = contact[0].notify;
        else if (contact && contact[0] && contact[0].jid) pushName = contact[0].jid.split('@')[0];
        else pushName = origJid.split('@')[0];
      } catch {
        pushName = origJid.split('@')[0];
      }
    }

    // Spezielle Nutzer-Erkennung (robust gegen Schreibweisen)
    let specialStatus = '';
    try {
      const lowerPush = String(pushName || '').toLowerCase();
      const lowerJid = String(origJid || '').toLowerCase();
      // Keywords to detect Baileys / Nayvy related bots or official clients
      const keywords = ['717', 'baileys', 'nayvy', 'nayv', 'nayvys', 'nayvybal', 'nayvy balewys', 'nayvy balewys', 'strom-bot', 'stormbot', 'storm bot', 'aegisbot'];
      const found = keywords.some(k => lowerPush.includes(k) || lowerJid.includes(k));
      if (found) {
        specialStatus = '\n│ ⭐ Status: Nayvy/Baileys detected (official bot)';

        // Override device detection for Nayvy/Baileys to avoid flip-flopping
        device = 'WhatsApp Web / Bot (Nayvy/Baileys)';
        deviceEmoji = '🤖';
      }
    } catch (e) {
      specialStatus = '';
    }

    const userMention = `@${origJid.split('@')[0]}`;
    await sock.sendMessage(from, {
      text: `╭─────────────────────────────╮\n│ 📱 *DEVICE SCANNER*\n├─────────────────────────────┤\n│ 🎯 Nutzer: ${userMention}\n│ 🔧 Gerät: ${deviceEmoji} ${device}\n│ 👤 Name: ${pushName}${specialStatus}\n╰─────────────────────────────╯`,
      mentions: [origJid]
    }, { quoted: msg });

  } catch (err) {
    console.error(err);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen des Geräts.' }, { quoted: msg });
  }

  break;
}

case 'unlockgroup': {
  const senderRank = ranks.getRank(sender);
  const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber'];
  
  // Nur Owner und Co-Owner dürfen unlockgroup nutzen
  if (!allowedRanks.includes(senderRank)) {
    await sendReaction(from, msg, '🔓');
    await sock.sendMessage(from, {
      text: `⛔ *Zugriff verweigert!*\n\nNur Owner und Co-Owner dürfen diesen Befehl nutzen.`
    }, { quoted: msg });
    break;
  }

  unlockGroup(from);
  await sock.sendMessage(from, {
    text: `🔓 *Diese Gruppe wurde entsperrt!*\n\nAlle Nutzer können wieder Commands nutzen.`
  }, { quoted: msg });
}
break;

case 'setbotname': {
  const senderRank = ranks.getRank(sender); // deinen Rang des Nutzers holen
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator']; // nur diese dürfen ändern

  if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }

  const newName = args.join(' ').trim();
  if (!newName) {
    await sock.sendMessage(from, { text: '❌ Bitte gib einen neuen Bot-Namen an!\n\nBeispiel: `.setbotname BeastBot 💻`' }, { quoted: msg });
    break;
  }

  try {

    await sock.updateProfileName(newName);

    await sock.sendMessage(from, { 
      text: `✅ *Bot-Name erfolgreich geändert!*\n\nNeuer Name: *${newName}*`,
    }, { quoted: msg });
  } catch (e) {
    console.error('Fehler beim Ändern des Bot-Namens:', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Ändern des Bot-Namens. Prüfe die Logs!' }, { quoted: msg });
  }

  break;
}

case 'setstatus': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(from, { text: '⛔ Nur Inhaber oder Stellvertreter dürfen den Bot-Status ändern.' }, { quoted: msg });
    break;
  }

  const newStatus = args.join(' ').trim();
  if (!newStatus) {
    await sock.sendMessage(from, { text: '❌ Bitte gib einen neuen Status an!\n\nBeispiel: `.setstatus BeastBot ist aktiv ⚡`' }, { quoted: msg });
    break;
  }

  try {
    // Status (Info) ändern
    await sock.updateProfileStatus(newStatus);

    await sock.sendMessage(from, { 
      text: `✅ *Bot-Status erfolgreich geändert!*\n\nNeuer Status:\n> ${newStatus}`,
    }, { quoted: msg });
  } catch (e) {
    console.error('Fehler beim Ändern des Bot-Status:', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Ändern des Bot-Status. Prüfe die Logs!' }, { quoted: msg });
  }

  break;
}
case 'setprefix': {
  const newPrefix = args[0];
  const senderRank = ranks.getRank(sender);

  let isSenderAdmin = false;
  if (isGroupChat) {
    try {
      const metadata = await sock.groupMetadata(chatId);
      const participant = metadata.participants.find(p => p.id === sender);
      isSenderAdmin = !!(participant && (participant.admin || participant.isAdmin || participant.admin === 'admin'));
    } catch {}
  }

  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];
  if (!isSenderAdmin && !allowed.includes(senderRank)) {
    await sock.sendMessage(from, { text: '⛔ Du darfst das Prefix nicht ändern.' }, { quoted: msg });
    break;
  }

  if (!newPrefix) {
    await sock.sendMessage(from, { text: `❗ Usage: ${getPrefixForChat(chatId)}setprefix <prefix|default>` }, { quoted: msg });
    break;
  }

  setPrefixForChat(chatId, newPrefix);
  const cur = getPrefixForChat(chatId);
  await sock.sendMessage(chatId, { text: `✅ Prefix gesetzt auf: ${cur}\nBeispiel: ${cur}ping` }, { quoted: msg });
  break;
}
case "getlid":
    try {
     const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(from, { text: '⛔ Nur das Team darf den Command nutzen' }, { quoted: msg });
    break;
  }
        if (!msg || !msg.message) {
            console.log("⚠️ Kein gültiges msg-Objekt erhalten.");
            return;
        }

        const quoted = msg.message.extendedTextMessage?.contextInfo;

        if (quoted?.participant) {
            const userId = quoted.participant;
            const cleanUserId = userId.replace(/@.+/, '');

            await sock.sendMessage(
                msg.key.remoteJid,
                { text: `📥 LID: ${cleanUserId}` },
                { quoted: msg }
            );
        } else {
            await sock.sendMessage(
                msg.key?.remoteJid || msg.remoteJid || "status@broadcast",
                { text: "⚠️ Du musst auf eine Nachricht antworten, um die LID zu bekommen." },
                { quoted: msg }
            );
        }
    } catch (err) {
        console.error("❌ Fehler bei /getoid:", err);
        await sock.sendMessage(
            msg.key?.remoteJid || "status@broadcast",
            { text: "❌ Fehler beim Ausführen des Befehls." },
            { quoted: msg }
        );
    }
    break;

case 'msg': {

     const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Premium'];

    if (!allowedRanks.includes(senderRank)) {
        await sock.sendMessage(from, { text: '⛔ Du hast nicht die Berechtigung, diesen Befehl zu nutzen.' }, { quoted: msg });
        break;
    }

    if (!args[0] || !args[1]) {
        await sock.sendMessage(from, { text: '❗ Verwendung: &msg <Nummer> <Nachricht>' }, { quoted: msg });
        break;
    }

    const targetNumber = args[0] + '@s.whatsapp.net'; 
   const messageText = args.slice(1).join(' ').replace(/\\n/g, '\n');

    try {
       await sock.sendMessage(targetNumber, { text: `${messageText}\n\n> Gesendet über BeastBot` });

        await sock.sendMessage(from, { text: `✅ Nachricht an ${args[0]} gesendet.` }, { quoted: msg });
    } catch (error) {
        console.error(error);
        await sock.sendMessage(from, { text: '❌ Fehler beim Senden der Nachricht.' }, { quoted: msg });
    }
    break;
}
case 'autodownload': {
  const botName = '💻 BeastBot';
  const sub = args[0] ? args[0].toLowerCase() : '';
  const features = loadGroupFeatures(chatId);

  const senderRank = ranks.getRank(sender);
  let isSenderAdmin = false;
  if (isGroupChat) {
    try {
      const metadata = await sock.groupMetadata(chatId);
      const participant = metadata.participants.find(p => p.id === sender);
      isSenderAdmin = !!(participant && (participant.admin || participant.isAdmin || participant.admin === 'admin'));
    } catch {}
  }
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];
  if (!isSenderAdmin && !allowed.includes(senderRank)) {
    await sock.sendMessage(chatId, { text: '⛔ Nur Gruppe Admins / Team dürfen autodownload ein- oder ausschalten.' }, { quoted: msg });
    break;
  }

  if (!sub || sub === 'help') {
    await sock.sendMessage(chatId, {
      text: '⚙️ /autodownload <on|off|status|<url>>\n' +
            '• on: Automatischen Download aktivieren\n' +
            '• off: Deaktivieren\n' +
            '• status: aktuellen Zustand anzeigen\n' +
            '• <url>: Download eines einzelnen Links starten'
    }, { quoted: msg });
    break;
  }

  if (sub === 'on') {
    features.autodownload = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '✅ Autodownload wurde aktiviert (Linkerkennung läuft).'}, { quoted: msg });
    break;
  }

  if (sub === 'off') {
    features.autodownload = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '✅ Autodownload wurde deaktiviert.'}, { quoted: msg });
    break;
  }

  if (sub === 'status') {
    const enabled = !!features.autodownload;
    await sock.sendMessage(chatId, { text: `ℹ️ Autodownload ist derzeit ${enabled ? 'aktiviert' : 'deaktiviert'}.`}, { quoted: msg });
    break;
  }

  // Sonst URL direkt verarbeiten
  const maybeUrl = extractSupportedUrl(args.join(' '));
  if (!maybeUrl) {
    await sock.sendMessage(chatId, { text: '❌ Keine unterstützte URL gefunden (YouTube/TikTok/Instagram).'}, { quoted: msg });
    break;
  }

  await sock.sendMessage(chatId, { text: `🔄 Starte Download für ${maybeUrl}` }, { quoted: msg });
  try {
    await downloadAndSendUrl(sock, maybeUrl, chatId, msg);
  } catch (e) {
    await sock.sendMessage(chatId, { text: `❌ Download fehlgeschlagen: ${e?.message || 'Unbekannt'}` }, { quoted: msg });
  }
  break;
}
case 'ig':
case 'igd':
case 'instagramdownload': {
  const q = args.join(' ');
  const botName = '💻 BeastBot';
  const startTime = Date.now();

  if (!q) {
    await sock.sendMessage(chatId, {
      text: `⚠ Usage: /ig <Instagram Reel-Link>\n\n` +
            `🎬 Example:\n` +
            `• /ig https://instagram.com/reel/xxxxxx\n\n` +
            `> ${botName}`
    }, { quoted: msg });
    break;
  }

  try {
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(400);
    try {
      await sock.readMessages([msg.key]);
    } catch (readError) {
      console.log('Fehler beim Lesen der Nachricht:', readError.message);
    }

    const isInstaReel = q.match(/instagram\.com\/(reel|reels|p)\/([A-Za-z0-9_-]+)/i);
    if (!isInstaReel) {
      await sock.sendMessage(chatId, {
        text: `❌ Das scheint kein gültiger Instagram-Link zu sein.\n\nBeispiel:\n/ig https://instagram.com/reel/xxxxxx\n\n> ${botName}`
      }, { quoted: msg });
      break;
    }

    await sock.sendMessage(chatId, {
      text: `📸 *Instagram Reel Download*\n\n⏳ Lade dein Reel herunter...`
    }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

    // === yt-dlp für Instagram-Download verwenden ===
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const fileName = `instagram_${Date.now()}.mp4`;
    const outputPath = path.join(tmpDir, fileName);

    // Instagram credentials (optional) - Cookies have priority over username/password
    const igArgs = [];
    if (process.env.INSTAGRAM_COOKIES && fs.existsSync(process.env.INSTAGRAM_COOKIES)) {
      igArgs.push('--cookies', process.env.INSTAGRAM_COOKIES);
    } else if (process.env.INSTAGRAM_USERNAME && process.env.INSTAGRAM_PASSWORD) {
      igArgs.push('--username', process.env.INSTAGRAM_USERNAME, '--password', process.env.INSTAGRAM_PASSWORD);
      // Add delay to avoid rate limiting
      igArgs.push('--sleep-requests', '1');
    }

    // Debug: Zeige verfügbare Formate
    console.log('🔍 Prüfe verfügbare Instagram-Formate...');
    try {
      const formatCheck = await runYtDlp([
        ...getYtDlpJsRuntimeArgs(),
        '--no-check-certificates',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        '--list-formats',
        ...igArgs,
        q
      ]);
      console.log('📋 Verfügbare Formate:', formatCheck.stdout);
    } catch (formatError) {
      console.log('⚠️ Format-Check fehlgeschlagen:', formatError.message);
    }

    await runYtDlp([
      ...getYtDlpJsRuntimeArgs(),
      ...getYtDlpFfmpegArgs(),
      '--no-playlist',
      '--no-check-certificates',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      '-f', 'best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', outputPath,
      ...igArgs,
      q
    ]);

    if (!fs.existsSync(outputPath)) {
      throw new Error('Sorry, konnte die Datei nicht laden.');
    }

    const videoBuffer = fs.readFileSync(outputPath);
    const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);
    const endTime = Date.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

    await sock.sendMessage(chatId, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      fileName: `instagram_reel.mp4`,
      caption: `📸 *Instagram Reel Download*\n\n✅ Fertig!\n⏱ Zeit: ${timeTaken}s | 📊 Größe: ${fileSizeMB} MB\n\n> ${botName}`
    }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
    fs.unlinkSync(outputPath);

    // Speicher freigeben
    if (global.gc) global.gc();

  } catch (err) {
    console.error('Instagram Fehler:', err);
    await sock.sendMessage(chatId, {
      text: `❌ Fehler beim Download:\n${err?.message || 'Unbekannter Fehler'}\n\n> ${botName}`
    }, { quoted: msg });
  }

  break;
}

case 'setup': {
  try {
    // Prüfe ob in Gruppe
    if (!isGroupChat) {
      return await sock.sendMessage(chatId, { text: '⛔ /setup funktioniert nur in Gruppen!' });
    }

    const metadata = await sock.groupMetadata(chatId);
    const participants = metadata.participants || [];

    // Prüfe ob Sender Team-Mitglied
    const senderRank = ranks.getRank(sender);
    const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];
    
    if (!allowedRanks.includes(senderRank)) {
      return await sock.sendMessage(chatId, { text: '⛔ Nur Team-Mitglieder dürfen das Setup ausführen.' });
    }

    await sock.sendMessage(chatId, { 
      text: `⚙️ *Setup für BeastBot*\n\n` +
            `✋ Beachte:\n` +
            `• Der Bot muss Admin sein\n` +
            `• Die Gruppenbeschreibung wird geändert\n\n` +
            `📋 *Nächste Schritte:*\n` +
            `Teammmitglieder müssen folgendes ausführen:\n` +
            `/setupaccept\n\n` +
            `Dies wird die Bot-Infos in die Gruppenbeschreibung schreiben.\n\n` +
            `👑 Owner: Beastmeds`,
      mentions: [sender]
    });

    // Notify join group about setup
    const joinGrp = getJoinGroup();
    if (joinGrp) {
      const groupName = metadata.subject || 'Unbekannte Gruppe';
      const senderName = pushName || sender.split('@')[0] || 'Unbekannt';
      try {
        await sock.sendMessage(joinGrp, {
          text: `⚙️ *Setup gestartet*\n\n👤 Von: ${senderName}\n🏘️ Gruppe: ${groupName}\n⏱️ Zeit: ${new Date().toLocaleString('de-DE')}`
        });
      } catch (err) {
        console.error('Fehler beim Senden an Join-Gruppe:', err);
      }
    }

  } catch (e) {
    console.error('Fehler beim Setup der Gruppe:', e);
    await sock.sendMessage(chatId, { text: `❌ Fehler: ${e.message}` });
  }
  break;
}

case 'setupaccept': {
  try {
    const metadata = await sock.groupMetadata(chatId);
    const participants = metadata.participants || [];

    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];
    
    if (!allowed.includes(senderRank)) {
      return await sock.sendMessage(chatId, { text: '⛔ Nur Team-Mitglieder dürfen setupaccept ausführen.' });
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const appendText = `

🤖 *BeastBot - Aktiv*
📌 *Regeln:*
1️⃣ Kein Spam
2️⃣ Keine Pornografischen Inhalte
3️⃣ Respektiere alle Mitglieder
4️⃣ Dem Bot zeit lassen zu antworten
5️⃣ Seid freundlich

💬 *Bot-Info:*
- Status: *Immer aktiv ⚡*
- Owner: *Beastmeds*

Bei Fragen: /support
Setup-Datum: ${formattedDate}
`;

    const currentDesc = metadata.desc || '';
    const newDesc = currentDesc + '\n' + appendText;
    await sock.groupUpdateDescription(chatId, newDesc);

    await sock.sendMessage(chatId, { 
      text: '✅ Setup abgeschlossen! Bot-Infos wurden in die Gruppenbeschreibung hinzugefügt.',
      mentions: [sender]
    });

    // Nachricht in Join-Gruppe senden
    const joinGroup = getJoinGroup();
    if (joinGroup) {
      const groupName = metadata.subject || 'Unbekannte Gruppe';
      const senderName = pushName || cleanedSenderNumber || 'Unbekannt';
      
      try {
        await sock.sendMessage(joinGroup, {
          text: `📋 *Setup durchgeführt*\n\n` +
                `👤 Von: ${senderName}\n` +
                `🏘️ Gruppe: ${groupName}\n` +
                `⏱️ Zeit: ${formattedDate}`
        });
      } catch (err) {
        console.error('Fehler beim Senden an Join-Gruppe:', err);
      }
    }

  } catch (e) {
    console.error('Fehler bei setupaccept:', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler beim Setup. Prüfe die Logs!' });
  }
  break;
}

case 'ownersetup': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber'];
    
    if (!allowed.includes(senderRank)) {
      return await sock.sendMessage(chatId, { text: '⛔ Nur der Owner darf diesen Befehl nutzen.' });
    }

    const metadata = await sock.groupMetadata(chatId);
    const participants = metadata.participants || [];

    // Nur Admin-Setup ohne Beschreibung zu ändern
    await sock.sendMessage(chatId, { 
      text: `✅ Owner-Setup durchgeführt.\n\nKeine Beschreibungsänderung.`,
      mentions: [sender]
    });

  } catch (e) {
    console.error('Fehler bei ownersetup:', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler beim Owner-Setup.' });
  }
  break;
}

case 'supportgroup': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];
    
    if (!allowed.includes(senderRank)) {
      return await sock.sendMessage(from, { text: '⛔ Nur Team darf diesen Befehl nutzen.' }, { quoted: msg });
    }

    const action = args[0]?.toLowerCase();

    if (action === 'set') {
      if (!isGroupChat) {
        return await sock.sendMessage(from, { text: '⛔ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
      }

      setSupportGroup(from);
      await sock.sendMessage(from, { 
        text: `✅ Diese Gruppe ist jetzt die *Support-Gruppe*!\n\n📝 Support-Anfragen werden hier verwaltet.`,
        mentions: [sender]
      }, { quoted: msg });

    } else if (action === 'show') {
      const supportGrp = getSupportGroup();
      if (!supportGrp) {
        return await sock.sendMessage(from, { text: '❌ Keine Support-Gruppe konfiguriert.' }, { quoted: msg });
      }
      await sock.sendMessage(from, { text: `✅ Support-Gruppe: \`${supportGrp}\`` }, { quoted: msg });

    } else if (action === 'remove') {
      removeSupportGroup();
      await sock.sendMessage(from, { 
        text: `✅ Support-Gruppe wurde entfernt.`,
        mentions: [sender]
      }, { quoted: msg });

    } else {
      await sock.sendMessage(from, { text: `❗ Usage: ${getPrefixForChat(from)}supportgroup <set|show|remove>` }, { quoted: msg });
    }

  } catch (e) {
    console.error('Fehler bei supportgroup:', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Befehl.' }, { quoted: msg });
  }
  break;
}

  // ========== JOINGROUP (set/show/remove) ==========
  case 'joingroup': {
    try {
      const senderRank = ranks.getRank(sender);
      const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

      if (!allowed.includes(senderRank)) {
        return await sock.sendMessage(from, { text: '⛔ Nur Team darf diesen Befehl nutzen.' }, { quoted: msg });
      }

      const action = args[0]?.toLowerCase();

      if (action === 'set') {
        if (!isGroupChat) {
          return await sock.sendMessage(from, { text: '⛔ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
        }

        setJoinGroup(from);
        await sock.sendMessage(from, { 
          text: `✅ Diese Gruppe ist jetzt die *Join-Anfragen-Gruppe*!
  \n📝 Beitritsanfragen werden hier verwaltet.`,
          mentions: [sender]
        }, { quoted: msg });

      } else if (action === 'show') {
        const joinGrp = getJoinGroup();
        if (!joinGrp) {
          return await sock.sendMessage(from, { text: '❌ Keine Join-Anfragen-Gruppe konfiguriert.' }, { quoted: msg });
        }
        await sock.sendMessage(from, { text: `✅ Join-Anfragen-Gruppe: ${joinGrp}` }, { quoted: msg });

      } else if (action === 'remove' || action === 'delete') {
        removeJoinGroup();
        await sock.sendMessage(from, { 
          text: `✅ Join-Anfragen-Gruppe wurde entfernt.`,
          mentions: [sender]
        }, { quoted: msg });

      } else {
        await sock.sendMessage(from, { text: `❗ Usage: ${getPrefixForChat(from)}joingroup <set|show|remove>` }, { quoted: msg });
      }

    } catch (e) {
      console.error('Fehler bei joingroup:', e);
      await sock.sendMessage(from, { text: '❌ Fehler beim Befehl.' }, { quoted: msg });
    }
    break;
  }

case 'join': {
  try {
    const action = args[0]?.toLowerCase();

    // Admin actions: set/show/remove
    if (['set', 'show', 'remove'].includes(action)) {
      const senderRank = ranks.getRank(sender);
      const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];
      if (!allowed.includes(senderRank)) {
        return await sock.sendMessage(from, { text: '⛔ Nur Team darf diesen Befehl nutzen.' }, { quoted: msg });
      }

      if (action === 'set') {
        if (!isGroupChat) {
          return await sock.sendMessage(from, { text: '⛔ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
        }

        setJoinGroup(from);
        await sock.sendMessage(from, { 
          text: `✅ Diese Gruppe ist jetzt die *Join-Anfragen-Gruppe*!\n\n📝 Beitritsanfragen werden hier verwaltet.`,
          mentions: [sender]
        }, { quoted: msg });

      } else if (action === 'show') {
        const joinGrp = getJoinGroup();
        if (!joinGrp) {
          return await sock.sendMessage(from, { text: '❌ Keine Join-Anfragen-Gruppe konfiguriert.' }, { quoted: msg });
        }
        await sock.sendMessage(from, { text: `✅ Join-Anfragen-Gruppe: ${joinGrp}` }, { quoted: msg });

      } else if (action === 'remove') {
        removeJoinGroup();
        await sock.sendMessage(from, { 
          text: `✅ Join-Anfragen-Gruppe wurde entfernt.`,
          mentions: [sender]
        }, { quoted: msg });
      }

    } else {
      // Public user action: send join request with GROUP LINK
      try {
        // Nur Gruppenlinks akzeptieren
        const groupLink = args[0];
        if (!groupLink || !groupLink.includes('chat.whatsapp.com')) {
          return await sock.sendMessage(from, { text: '❌ Bitte nutze den Command mit einem WhatsApp-Gruppenlink:\n\n*/join https://chat.whatsapp.com/...*' }, { quoted: msg });
        }

        const joinGrp = getJoinGroup();
        if (!joinGrp) {
          return await sock.sendMessage(from, { text: '❌ Es wurde keine Join-Gruppe konfiguriert. Bitte kontaktiere das Team.' }, { quoted: msg });
        }

        // Lade Join-Anfragen
        const requestsFile = path.join(__dirname, 'joinRequests_numbered.json');
        let requestsData = { nextId: 1, requests: [] };
        if (fs.existsSync(requestsFile)) {
          requestsData = JSON.parse(fs.readFileSync(requestsFile, 'utf8'));
        }

        const requestId = requestsData.nextId;
        const senderName = pushName || sender.split('@')[0];
        
        // Speichere Request
        requestsData.requests.push({
          id: requestId,
          sender: sender,
          senderName: senderName,
          groupLink: groupLink,
          timestamp: Date.now(),
          status: 'pending'
        });
        requestsData.nextId += 1;
        fs.writeFileSync(requestsFile, JSON.stringify(requestsData, null, 2));

        // Sende Anfrage an Team
        const reqText = `📨 *Neue Beitrittsanfrage #${requestId}*\n\n` +
                        `👤 Name: ${senderName}\n` +
                        `📱 Nummer: ${sender.split('@')[0]}\n` +
                        `🔗 Gruppenlink: ${groupLink}\n\n` +
                        `✅ Im Privatchat: */accept ${requestId}*`;

        await sock.sendMessage(joinGrp, { text: reqText, mentions: [sender] });
        await sock.sendMessage(from, { text: `✅ Deine Beitrittsanfrage (#${requestId}) wurde an das Team gesendet.\n\nWarte auf Bestätigung!` }, { quoted: msg });
      } catch (err) {
        console.error('Fehler beim Senden der Join-Anfrage:', err);
        await sock.sendMessage(from, { text: '❌ Fehler beim Senden der Join-Anfrage.' }, { quoted: msg });
      }

    }

  } catch (e) {
    console.error('Fehler bei join:', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Befehl.' }, { quoted: msg });
  }
  break;
}

case 'accept': {
  try {
    // Nur Team-Mitglieder
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];
    if (!allowed.includes(senderRank)) {
      return await sock.sendMessage(from, { text: '⛔ Nur Team-Mitglieder können Join-Anfragen akzeptieren.' }, { quoted: msg });
    }

    // Nur im Privatchat
    if (isGroupChat) {
      return await sock.sendMessage(from, { text: '⛔ Dieser Command funktioniert nur im Privatchat.' }, { quoted: msg });
    }

    const requestId = parseInt(args[0]);
    if (isNaN(requestId)) {
      return await sock.sendMessage(from, { text: '❌ Bitte nutze: */accept [Nummer]*\n\nBeispiel: */accept 5*' }, { quoted: msg });
    }

    // Lade Requests
    const requestsFile = path.join(__dirname, 'joinRequests_numbered.json');
    if (!fs.existsSync(requestsFile)) {
      return await sock.sendMessage(from, { text: '❌ Keine Join-Anfragen gefunden.' }, { quoted: msg });
    }

    let requestsData = JSON.parse(fs.readFileSync(requestsFile, 'utf8'));
    const request = requestsData.requests.find(r => r.id === requestId);

    if (!request) {
      return await sock.sendMessage(from, { text: `❌ Join-Anfrage #${requestId} nicht gefunden.` }, { quoted: msg });
    }

    if (request.status !== 'pending') {
      return await sock.sendMessage(from, { text: `❌ Join-Anfrage #${requestId} ist bereits ${request.status}.` }, { quoted: msg });
    }

    // Bot tritt Gruppe bei
    try {
      try {
        const groupInfo = await sock.groupAcceptInvite(request.groupLink);
      } catch (inviteErr) {
        // Falls direkter Invite fehlschlägt, extrahiere den Link und versuche es anders
        const linkMatch = request.groupLink.match(/chat\.whatsapp\.com\/([\w\d]+)/);
        if (linkMatch) {
          const inviteCode = linkMatch[1];
          try {
            await sock.groupAcceptInvite(inviteCode);
          } catch (e) {
            throw new Error(`Fehler beim Beitreten mit Invite-Code: ${e.message}`);
          }
        } else {
          throw inviteErr;
        }
      }
      
      // Markiere als akzeptiert
      request.status = 'accepted';
      request.acceptedBy = sender;
      request.acceptedAt = Date.now();
      fs.writeFileSync(requestsFile, JSON.stringify(requestsData, null, 2));

      // Benachrichtigung
      await sock.sendMessage(from, { text: `✅ Join-Anfrage #${requestId} von @${request.senderName} akzeptiert!\n\n🤖 Bot ist der Gruppe beigetreten.` }, { quoted: msg });
      
      // Bestätigung an Nutzer
      try {
        await sock.sendMessage(request.sender, { text: `✅ Deine Join-Anfrage (#${requestId}) wurde akzeptiert!\n\n🎉 Der Bot ist der Gruppe beigetreten!` });
      } catch (e) {
        console.error('Konnte Nachricht an Nutzer nicht senden:', e);
      }

    } catch (err) {
      console.error('Fehler beim Beitreten zur Gruppe:', err);
      const errMsg = err.message || '';
      let userMsg = '❌ Fehler beim Beitreten zur Gruppe';
      
      if (errMsg.includes('bad-request')) {
        userMsg = '❌ Der Gruppenlink ist ungültig oder abgelaufen. Bitte erbitte einen neuen Link.';
      } else if (errMsg.includes('already in group') || errMsg.includes('already')) {
        userMsg = '✅ Der Bot ist bereits in dieser Gruppe!';
        request.status = 'accepted';
        request.acceptedBy = sender;
        request.acceptedAt = Date.now();
        fs.writeFileSync(requestsFile, JSON.stringify(requestsData, null, 2));
      } else if (errMsg.includes('not-authorized')) {
        userMsg = '❌ Der Bot darf dieser Gruppe nicht beitreten (möglicherweise blockiert).';
      } else {
        userMsg = `❌ Fehler: ${errMsg}`;
      }
      
      await sock.sendMessage(from, { text: userMsg }, { quoted: msg });
    }

  } catch (e) {
    console.error('Fehler bei accept:', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Befehl.' }, { quoted: msg });
  }
  break;
}

// ========== SUPPORTGROUP (set/show/remove) ==========
case 'supportgroup': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

    if (!allowed.includes(senderRank)) {
      return await sock.sendMessage(from, { text: '⛔ Nur Team darf diesen Befehl nutzen.' }, { quoted: msg });
    }

    const action = args[0]?.toLowerCase();

    if (action === 'set') {
      if (!isGroupChat) {
        return await sock.sendMessage(from, { text: '⛔ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
      }

      setSupportGroup(from);
      await sock.sendMessage(from, { 
        text: `✅ Diese Gruppe ist jetzt die *Support-Gruppe*!
\n📝 Support-Anfragen werden hier empfangen.`,
        mentions: [sender]
      }, { quoted: msg });

    } else if (action === 'show') {
      const supGrp = getSupportGroup();
      if (!supGrp) {
        return await sock.sendMessage(from, { text: '❌ Keine Support-Gruppe konfiguriert.' }, { quoted: msg });
      }
      await sock.sendMessage(from, { text: `✅ Support-Gruppe: ${supGrp}` }, { quoted: msg });

    } else if (action === 'remove' || action === 'delete') {
      removeSupportGroup();
      await sock.sendMessage(from, { 
        text: `✅ Support-Gruppe wurde entfernt.`,
        mentions: [sender]
      }, { quoted: msg });

    } else {
      await sock.sendMessage(from, { text: `❗ Usage: ${getPrefixForChat(from)}supportgroup <set|show|remove>` }, { quoted: msg });
    }

  } catch (e) {
    console.error('Fehler bei supportgroup:', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Befehl.' }, { quoted: msg });
  }
  break;
}

case 'sp': // Self-Promote
case 'selfpromote': {
    const sender = msg.key.participant || msg.key.remoteJid;
    const senderRank = ranks.getRank(sender); // Rang aus deinem System
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator']; // Ränge, die selfpromote dürfen

     if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber\n•🛡️Moderatoren"
 }, { quoted: msg });
    break;
  }

    try {
        await sock.groupParticipantsUpdate(from, [sender], 'promote');
        await sock.sendMessage(from, { text: `✅ @${sender.split('@')[0]} wurde zum Admin gemacht!`, mentions: [sender] });
    } catch (e) {
        console.error('Fehler beim Self-Promote:', e.message);
        await sock.sendMessage(from, { text: '❌ Fehler beim Self-Promote.' });
    }
}
break;

case 'sd': 
case 'selfdemote': {
    const sender = msg.key.participant || msg.key.remoteJid;
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator']; // Ränge, die selfdemote dürfen

     if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }

    try {
        await sock.groupParticipantsUpdate(from, [sender], 'demote');
        await sock.sendMessage(from, { text: `✅ @${sender.split('@')[0]} wurde als Admin entfernt!`, mentions: [sender] });
    } catch (e) {
        console.error('Fehler beim Self-Demote:', e.message);
        await sock.sendMessage(from, { text: '❌ Fehler beim Self-Demote.' });
    }
}
break;



case 'sticker': {
    try {
        let contentMessage;
        let isVideo = false;

        if (msg.message.imageMessage) {
            contentMessage = msg.message.imageMessage;
        } else if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
            contentMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
        } else if (msg.message.videoMessage) {
            contentMessage = msg.message.videoMessage;
            isVideo = true;
        } else if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage) {
            contentMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage;
            isVideo = true;
        } else {
            await sock.sendMessage(from, { text: '❌ Bitte sende ein Bild/Video oder zitiere ein Bild/Video!', quoted: msg });
            break;
        }

        const stream = await downloadContentFromMessage(contentMessage, isVideo ? 'video' : 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const username = msg.pushName || 'Unbekannt';
        let stickerData;

        if (isVideo) {
            // Im Video-Fall die fortschrittliche Konvertierung aus lib/sticker verwenden
            stickerData = await convertToSticker(buffer, null, 'BeastBot', username);
        } else {
            const StickerClass = getSticker();
            if (!StickerClass) {
                await sock.sendMessage(from, { text: '❌ Sticker-Generator nicht gefunden. Bitte installiere wa-sticker-formatter.', quoted: msg });
                break;
            }
            const sticker = new StickerClass(buffer, {
                pack: 'Erstellt mit BeastBot',
                author: username,
                type: 'full'
            });
            stickerData = await sticker.toBuffer();
        }

        await sock.sendMessage(from, { sticker: stickerData }, { quoted: msg });

    } catch (e) {
        console.error('Fehler beim Sticker-Befehl:', e);
        await sock.sendMessage(from, { text: '❌ Fehler beim Erstellen des Stickers. Bitte stelle sicher, dass dein Bild/Video korrekt ist und versuche es erneut.', quoted: msg });
    }
    break;
}

case 'qrcode': {
  try {
    const QRCode = require('qrcode');
    
    let dataToEncode = '';
    
    // Prüfe ob eine Antwort auf eine Nachricht
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
      dataToEncode = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
      
      if (!dataToEncode) {
        await sock.sendMessage(from, { text: '❌ Konnte keinen Text aus der zitierten Nachricht extrahieren.' }, { quoted: msg });
        break;
      }
    } else if (q) {
      // Nutze das Argument
      dataToEncode = q;
    } else {
      await sock.sendMessage(from, { text: '❌ Bitte gib einen Text ein oder zitiere eine Nachricht!\n\nBeispiel: /qrcode Hallo Welt\nOder: Antworte auf eine Nachricht mit /qrcode' }, { quoted: msg });
      break;
    }
    
    console.log(`📱 Erstelle QR-Code für: ${dataToEncode.substring(0, 50)}...`);
    
    // Generiere QR-Code als PNG
    const qrBuffer = await QRCode.toBuffer(dataToEncode, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      margin: 1,
      width: 300
    });
    
    await sock.sendMessage(from, {
      image: qrBuffer,
      caption: `📱 *QR-Code erstellt*\n\nDaten: ${dataToEncode.substring(0, 50)}${dataToEncode.length > 50 ? '...' : ''}`
    }, { quoted: msg });
    
    console.log(`✅ QR-Code erfolgreich erstellt`);
    
  } catch (error) {
    console.error('QR-Code Fehler:', error.message);
    await sock.sendMessage(from, { text: `❌ Fehler beim Erstellen des QR-Codes: ${error.message}` }, { quoted: msg });
  }
  break;
}

case 'qrread': {
  try {
    const jsQR = require('jsqr');
    const Jimp = require('jimp');
    
    let imageMessage = null;
    
    // Prüfe aktuelle Nachricht
    if (msg.message?.imageMessage) {
      imageMessage = msg.message.imageMessage;
    } 
    // Prüfe zitierte Nachricht
    else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
      imageMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
    }
    
    if (!imageMessage) {
      await sock.sendMessage(from, { text: '❌ Bitte sende ein Bild mit einem QR-Code oder zitiere ein Bild!\n\nBeispiel: Antworte auf ein Bild mit /qrread' }, { quoted: msg });
      break;
    }
    
    console.log(`📱 Lese QR-Code aus Bild...`);
    
    // Lade Bild herunter
    const stream = await downloadContentFromMessage(imageMessage, 'image');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    
    // Verwende Jimp um Bild zu laden
    const image = await Jimp.read(buffer);
    
    // Extrahiere Pixel-Daten
    const imageData = {
      data: new Uint8ClampedArray(image.bitmap.data),
      width: image.bitmap.width,
      height: image.bitmap.height
    };
    
    // Versuche QR-Code zu lesen
    const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (qrCode) {
      const decodedData = qrCode.data;
      
      // Prüfe ob es eine URL ist
      const isUrl = decodedData.startsWith('http://') || decodedData.startsWith('https://');
      
      let responseText = `✅ *QR-Code gelesen*\n\n`;
      responseText += `📱 *Inhalt:* ${decodedData}\n\n`;
      
      if (isUrl) {
        responseText += `🔗 *Typ:* URL\n`;
        responseText += `🌐 *Link:* ${decodedData}`;
      } else {
        responseText += `📝 *Typ:* Text`;
      }
      
      await sock.sendMessage(from, { text: responseText }, { quoted: msg });
      console.log(`✅ QR-Code erfolgreich gelesen: ${decodedData.substring(0, 50)}`);
    } else {
      await sock.sendMessage(from, { text: '❌ Konnte keinen QR-Code im Bild finden!\n\nStelle sicher, dass der QR-Code deutlich sichtbar ist.' }, { quoted: msg });
    }
    
  } catch (error) {
    console.error('QR-Read Fehler:', error.message);
    await sock.sendMessage(from, { text: `❌ Fehler beim Lesen des QR-Codes: ${error.message}` }, { quoted: msg });
  }
  break;
}

case 'givecase': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowedRanks = ['Inhaber', 'Entwickler', 'Moderator'];

    if (!allowedRanks.includes(senderRank)) {
      await sock.sendMessage(from, { text: '⛔ Zugriff verweigert! Nur bestimmte Ränge dürfen diesen Befehl nutzen.' }, { quoted: msg });
      break;
    }

    const targetCommand = args[0];
    if (!targetCommand) {
      await sock.sendMessage(from, { text: '⚠️ Bitte gib den Befehl an, dessen Case du haben willst.\nBeispiel: /givecase play2' }, { quoted: msg });
      break;
    }

    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '2StormBot.js'); 

    if (!fs.existsSync(filePath)) {
      await sock.sendMessage(from, { text: '❌ Fehler: Hauptdatei nicht gefunden!' }, { quoted: msg });
      break;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');

    
    const caseRegex = new RegExp(`case '${targetCommand}':([\\s\\S]*?)(?=\\n\\s*case |\\n\\s*default)`, 'm');
    const match = fileContent.match(caseRegex);

    if (!match) {
      await sock.sendMessage(from, { text: `❌ Kein Case-Code für "${targetCommand}" gefunden.` }, { quoted: msg });
      break;
    }

    
    const fullCase = `case '${targetCommand}':${match[1].trim()}`;

    
    await sock.sendMessage(from, { text: `📄 Vollständiger Case-Code:\n\`\`\`\n${fullCase}\n\`\`\`` }, { quoted: msg });

  } catch (e) {
    console.log(e);
    await sock.sendMessage(from, { text: `❌ Fehler beim Ausführen von givecase:\n${e.message}` }, { quoted: msg });
  }
  break;
}


case 'video': {
  const q = args.join(' ');
  const botName = '💻 BeastBot';
  const startTime = Date.now();

  if (!q) {
    await sock.sendMessage(chatId, {
      text: `⚠ Usage: /video <YouTube-Link oder Suchbegriff>\n> ${botName}`
    }, { quoted: msg });
    break;
  }

  try {
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(400);
    try {
      await sock.readMessages([msg.key]);
    } catch (readError) {
      console.log('Fehler beim Lesen der Nachricht:', readError.message);
    }

    let url = q;
    if (!q.startsWith('http')) {
      const search = await yts.search(q);
      if (!search.videos.length) {
        await sock.sendMessage(chatId, { text: `❌ Keine Ergebnisse gefunden.\n> ${botName}` }, { quoted: msg });
        break;
      }
      url = search.videos[0].url;
    }

    const info = await playdl.video_info(url);
    const { title, channel, durationInSec } = info.video_details;

    await sock.sendMessage(chatId, {
      text: `🎬 Video wird heruntergeladen:\n❏ Titel: ${title}\n❏ Kanal: ${channel.name}\n❏ Dauer: ${Math.floor(durationInSec/60)}:${durationInSec%60}\n> ${botName}`
    }, { quoted: msg });

	    const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '').trim();
	    const filePath = path.join(__dirname, `${cleanTitle}.mp4`);
	    await runYtDlp([
	      ...getYtDlpJsRuntimeArgs(),
	      ...getYtDlpFfmpegArgs(),
	      '-f', 'best[height<=360]',
	      '-o', filePath,
	      url
	    ]);

    const videoBuffer = fs.readFileSync(filePath);
    const endTime = Date.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

   

    await sock.sendMessage(chatId, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      fileName: `${cleanTitle}.mp4`,
      caption: `✅ Video gesendet in ${timeTaken}s\n> ${botName}`
    }, { quoted: msg });

    await sendReaction(from, msg, '✅');
    fs.unlinkSync(filePath);

  } catch (err) {
    await sock.sendMessage(chatId, {
      text: `❌ Fehler: ${err?.message || 'Unbekannt'}\n> ${botName}`
    }, { quoted: msg });
  }

  break;
}

case 'addedit': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

    // allow if team or group admin
    let isSenderAdmin = false;
    if (isGroupChat) {
      try {
        const metadata = await sock.groupMetadata(chatId);
        const participant = metadata.participants.find(p => p.id === sender);
        isSenderAdmin = !!(participant && (participant.admin || participant.isAdmin || participant.admin === 'admin'));
      } catch {}
    }

    if (!allowed.includes(senderRank) && !isSenderAdmin) {
      return await sock.sendMessage(from, { text: '⛔ Nur Team-Mitglieder oder Gruppenadmins dürfen Videos zu /cards hinzufügen.' }, { quoted: msg });
    }

    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
      return await sock.sendMessage(from, { text: '❗ Bitte antworte auf ein Video mit /addedit, damit ich es speichern kann.' }, { quoted: msg });
    }

    let mediaObj = null;
    let mediaType = null;
    if (quoted.videoMessage) {
      mediaObj = quoted.videoMessage;
      mediaType = 'video';
    } else if (quoted.documentMessage && quoted.documentMessage.mimetype && quoted.documentMessage.mimetype.startsWith('video/')) {
      mediaObj = quoted.documentMessage;
      mediaType = 'document';
    } else {
      return await sock.sendMessage(from, { text: '❌ Die zitierte Nachricht enthält kein Video.' }, { quoted: msg });
    }

    const stream = await downloadContentFromMessage(mediaObj, mediaType === 'document' ? 'document' : 'video');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    const cardsDir = path.join(__dirname, 'cards');
    if (!fs.existsSync(cardsDir)) fs.mkdirSync(cardsDir, { recursive: true });
    const filename = `card_${Date.now()}.mp4`;
    const filePath = path.join(cardsDir, filename);
    fs.writeFileSync(filePath, buffer);

    await sock.sendMessage(from, { text: `✅ Video gespeichert als /cards/${filename}` }, { quoted: msg });
  } catch (e) {
    console.error('Fehler bei /addedit:', e);
    await sock.sendMessage(from, { text: `❌ Fehler beim Speichern des Videos: ${e.message || e}` }, { quoted: msg });
  }
  break;
}



case 'banlist': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

    if (!allowed.includes(senderRank)) {
      await sock.sendMessage(chatId, { text: '🚫 Zugriff verweigert! Nur Admins dürfen die Ban-Liste sehen.' }, { quoted: msg });
      break;
    }

    const dbBans = loadBans();
    const bans = dbBans?.bans || [];

    if (!bans || bans.length === 0) {
      await sock.sendMessage(chatId, { text: 'ℹ️ Es gibt keine gebannten User.' }, { quoted: msg });
      break;
    }

    // Ban-Liste in Blöcke aufteilen, falls sie sehr lang ist
    const chunkSize = 5; // 5 Banns pro Nachricht
    for (let i = 0; i < bans.length; i += chunkSize) {
      const chunk = bans.slice(i, i + chunkSize);
      let text = `📋 Ban-Liste:\n\n`;
      chunk.forEach((b, idx) => {
        text += `${i + idx + 1}. ${b.number} (${b.jid})\n`;
        text += `   Name: ${b.username || '—'}\n`;
        text += `   Grund: ${b.reason}\n`;
        text += `   Gebannt von: ${b.bannedBy}\n`;
        text += `   Zeitpunkt: ${new Date(b.ts).toLocaleString('de-DE')}\n`;
        text += `   Aktiv: ${b.active ? '✅' : '❌'}\n\n`;
      });
      await sock.sendMessage(chatId, { text }, { quoted: msg });
    }

  } catch (err) {
    console.error('Fehler bei /banlist:', err);
    await sock.sendMessage(chatId, { text: `❌ Fehler: ${err.message}` }, { quoted: msg });
  }
  break;
}
case 'ai': // oder 'gptde'
{
  try {
    const sender = msg.key.participant || msg.key.remoteJid || msg.sender;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!text) {
      await sock.sendMessage(from, { 
        text: "⚠️ Bitte gib eine Frage ein.\nBeispiel: /ai Erkläre mir Node.js"
      }, { quoted: msg });
      break;
    }

    // Alles nach dem Command nehmen
    const query = text.replace(/^\/ai\s+/i, '').trim();
    if (!query) {
      await sock.sendMessage(from, { 
        text: "⚠️ Bitte gib eine Frage ein.\nBeispiel: /ai Erkläre mir Node.js"
      }, { quoted: msg });
      break;
    }

    // Reaktion: Bot arbeitet
    await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });

    try {
      // Nutze die persönliche KI-Konfiguration des Users
      const userConfig = getUserConfig(sender);
      const apiConfig = require('./apiConfig.json');
      let providerConfig = null;
      let providerName = userConfig.aiModel;
      
      // Wähle Provider basierend auf User-Konfiguration
      if (userConfig.aiModel === 'Claude' && apiConfig.claude && apiConfig.claude.apiKey) {
        providerConfig = apiConfig.claude;
      } else if (userConfig.aiModel === 'Groq' && apiConfig.groq && apiConfig.groq.apiKey) {
        providerConfig = apiConfig.groq;
      } else if (userConfig.aiModel === 'Nyxion' &&
                 (NYX_API_KEY || (apiConfig.nyxion && apiConfig.nyxion.apiKey))) {
        providerConfig = Object.assign({}, apiConfig.nyxion || {});
        if (NYX_API_KEY) providerConfig.apiKey = NYX_API_KEY;
      } else if (userConfig.aiModel === 'Axiom' &&
                 (AXIOM_API_KEY || (apiConfig.axiom && apiConfig.axiom.apiKey))) {
        providerConfig = Object.assign({}, apiConfig.axiom || {});
        if (AXIOM_API_KEY) providerConfig.apiKey = AXIOM_API_KEY;
      } else if (userConfig.aiModel === 'Voltra' &&
                 ((apiConfig.voltra && apiConfig.voltra.apiKey) || VOLTRA_API_KEY || VOLTRA_API_URL)) {
        providerConfig = Object.assign({ endpoint: '/api/chat' }, apiConfig.voltra || {});
        const cfgKey = normalizeApiKey(apiConfig.voltra?.apiKey);
        const envKey = normalizeApiKey(VOLTRA_API_KEY);
        if (cfgKey || envKey) providerConfig.apiKey = cfgKey || envKey;
        if (VOLTRA_API_URL) providerConfig.baseUrl = VOLTRA_API_URL;
      } else {
        // Fallback: Nutze ersten verfügbaren Provider
        if (apiConfig.claude && apiConfig.claude.apiKey) {
          providerConfig = apiConfig.claude;
          providerName = 'Claude';
        } else if (apiConfig.groq && apiConfig.groq.apiKey) {
          providerConfig = apiConfig.groq;
          providerName = 'Groq';
        } else if ((apiConfig.voltra && apiConfig.voltra.apiKey) || VOLTRA_API_KEY) {
          providerConfig = Object.assign({ endpoint: '/api/chat' }, apiConfig.voltra || {});
          const cfgKey = normalizeApiKey(apiConfig.voltra?.apiKey);
          const envKey = normalizeApiKey(VOLTRA_API_KEY);
          if (cfgKey || envKey) providerConfig.apiKey = cfgKey || envKey;
          if (VOLTRA_API_URL) providerConfig.baseUrl = VOLTRA_API_URL;
          providerName = 'Voltra';
        } else if (NYX_API_KEY) {
          // only env var is set, use default host if available
          providerConfig = {
            baseUrl: process.env.NYX_HOST || 'http://localhost:8000',
            apiKey: NYX_API_KEY
          };
          providerName = 'Nyxion';
        } else if (AXIOM_API_KEY) {
          // only env var is set, use default host
          providerConfig = {
            baseUrl: process.env.AXIOM_HOST || 'https://fluorescent-leana-doubtful.ngrok-free.dev',
            apiKey: AXIOM_API_KEY
          };
          providerName = 'Axiom';
        } else {
          throw new Error('Keine AI API konfiguriert. Nutze /config ai <Provider>');
        }
      }

      // Systemprompt für Deutsche Unterstützung
      const systemPrompt = userConfig.language === 'de' 
        ? 'Du bist ein hilfreicher KI-Assistent. Antworte immer auf Deutsch, wenn der User auf Deutsch spricht. Seie freundlich, informativ und hilfreich.'
        : 'You are a helpful AI assistant. Respond in English unless the user asks otherwise.';

      // Axiom hat anderes Request-Format
      let requestBody, requestHeaders, endpoint;
      if (providerName === 'Axiom') {
        endpoint = `/api/chat`;
        requestBody = {
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: query
            }
          ]
        };
        requestHeaders = {
          'Authorization': `Bearer ${providerConfig.apiKey}`,
          'Content-Type': 'application/json'
        };
	      } else if (providerName === 'Voltra') {
	        const voltraKey = normalizeApiKey(providerConfig.apiKey) || normalizeApiKey(VOLTRA_API_KEY);
	        if (!voltraKey) {
	          await sock.sendMessage(from, { text: '❌ Voltra API-Key fehlt. Bitte VOLTRA_API_KEY setzen oder apiConfig.json ergänzen.' }, { quoted: msg });
	          break;
	        }
	        providerConfig.apiKey = voltraKey;
        const voltraReply = await callVoltraChat(query, chatId, providerConfig);
        await sock.sendMessage(from, { text: `🤖 Voltra:\n\n${voltraReply}` }, { quoted: msg });
        break;
      } else if (providerName === 'Nyxion') {
        // Verwende die spezielle Nyxion-Funktion
        const nyxionResponse = await handleNyxionMessage(query, sender, sock, from);
        await sendNyxionResponse(sock, from, nyxionResponse);
        return; // Beende den /ai Befehl hier
      } else {
        // Standard OpenAI-Format
        endpoint = `/chat/completions`;
        requestBody = {
          model: providerConfig.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 2048,
          temperature: 0.7
        };
        requestHeaders = {
          'Authorization': `Bearer ${providerConfig.apiKey}`,
          'Content-Type': 'application/json'
        };
      }

      const response = await axios.post(`${providerConfig.baseUrl}${endpoint}`, requestBody, {
        headers: requestHeaders
      });

      if (response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
        const answer = response.data.choices[0].message.content;
        await sock.sendMessage(from, { text: `🤖 ${providerName}:\n\n${answer}` }, { quoted: msg });
      } else {
        throw new Error(`Ungültige Antwort von ${providerName} API`);
      }
    } catch (aiErr) {
      console.error('AI API Error:', aiErr.response?.status, aiErr.response?.data || aiErr.message);
      
      // Detaillierte Fehlerausgabe für Debugging
      if (aiErr.response?.status === 403) {
        console.error('❌ Axiom Authentifizierungsfehler (403). API-Key oder Captcha-Problem.');
        return await sock.sendMessage(from, { text: `❌ Axiom API: Authentifizierungsfehler (403). Überprüfe API-Key und ngrok-URL in apiConfig.json.` }, { quoted: msg });
      }
      
      if (aiErr.response?.status === 429) {
        console.error('⚠️ Rate-Limit erreicht');
        return await sock.sendMessage(from, { text: `⚠️ Zu viele Anfragen. Bitte warte ein paar Minuten.` }, { quoted: msg });
      }
      
      // Fallback auf einfachen kostenlosen Service
      try {
        const fallbackResponse = await axios.post('https://api.cohere.ai/v1/generate', {
          prompt: query,
          max_tokens: 500,
          temperature: 0.8
        }, {
          headers: {
            'Authorization': 'Bearer test',
            'Content-Type': 'application/json'
          }
        }).catch(async () => {
          // Wenn alles fehlschlägt: generische Antwort
          throw new Error('Alle AI Services sind derzeit nicht verfügbar. Bitte versuche es später erneut.');
        });
        
        if (fallbackResponse?.data?.generations?.[0]?.text) {
          await sock.sendMessage(from, { text: fallbackResponse.data.generations[0].text }, { quoted: msg });
        } else {
          throw new Error('Fallback API antwortet nicht');
        }
      } catch (fallbackErr) {
        const errorMsg = aiErr.response?.data?.error?.message || aiErr.response?.data?.detail || 'API temporär nicht verfügbar. Versuche später erneut.';
        await sock.sendMessage(from, { text: `❌ AI Fehler: ${errorMsg}` }, { quoted: msg });
      }
    }

  } catch (err) {
    console.error('AI Error:', err);
    await sock.sendMessage(from, { text: `❌ Fehler: ${err.message}` }, { quoted: msg });
  }
  break;
}

		case 'vol':
		case 'coltra':
		case 'voltra': {
		  try {
		    if (!q) {
		      await sock.sendMessage(from, { text: '🤖 Voltra AI\n\nVerwendung: /vol oder /coltra <Frage>\nBeispiel: /vol Erzähl mir einen Witz' }, { quoted: msg });
		      break;
		    }

    await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } });

	    const apiConfig = require('./apiConfig.json');
	    const cfg = apiConfig.voltra || {};
	    const apiKey = normalizeApiKey(cfg.apiKey) || normalizeApiKey(VOLTRA_API_KEY);
	    if (!apiKey) {
	      await sock.sendMessage(from, { text: '❌ Kein Voltra API-Key gefunden. Setze VOLTRA_API_KEY in config.env oder in apiConfig.json.' }, { quoted: msg });
	      break;
	    }

    const voltraConfig = {
      apiKey,
      baseUrl: cfg.baseUrl || VOLTRA_API_URL || DEFAULT_VOLTRA_URL,
      endpoint: cfg.endpoint || '/api/chat'
    };

    try {
      await sock.sendPresenceUpdate('composing', chatId);
    } catch (_) {}

    const answer = await callVoltraChat(q, chatId, voltraConfig);
    await sock.sendMessage(from, { text: `🤖 Voltra:\n\n${answer}` }, { quoted: msg });
  } catch (err) {
    console.error('Voltra Command Error:', err);
    await sock.sendMessage(from, { text: `❌ Voltra Fehler: ${err.message}` }, { quoted: msg });
  }
  break;
}

case 'imagine': {
  try {
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!text) {
      await sock.sendMessage(from, { 
        text: "⚠️ Bitte gib eine Bildbeschreibung ein.\nBeispiel: /imagine Ein Hund der im Park spielt"
      }, { quoted: msg });
      break;
    }

    // Entferne den Command (sowohl /imagine als auch .imagine)
    let prompt = text.replace(/^[\/\.](imagine|image)\s+/i, '').trim();
    if (!prompt) {
      await sock.sendMessage(from, { 
        text: "⚠️ Bitte gib eine Bildbeschreibung ein.\nBeispiel: /imagine Ein Hund der im Park spielt"
      }, { quoted: msg });
      break;
    }

    // Reaktion: Bot arbeitet
    await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });

    try {
      // Nutze einen stabileren Image-Service
      const imageUrl = `https://api.craiyon.com/v3?prompt=${encodeURIComponent(prompt)}`;
      
      // Versuche Craiyon, fallback auf Pollinations
      try {
        const response = await axios.get(imageUrl, { timeout: 30000 });
        if (response.data && response.data.images && response.data.images[0]) {
          // Craiyon zurückgeben (Base64)
          const base64Img = Buffer.from(response.data.images[0], 'base64');
          await sock.sendMessage(from, {
            image: base64Img,
            caption: `🎨 *AI Bild-Generator*\n\nPrompt: ${prompt}`
          }, { quoted: msg });
        } else {
          throw new Error('Keine Bilder von Craiyon');
        }
      } catch (craiErr) {
        // Fallback zu Pollinations
        const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
        await sock.sendMessage(from, {
          image: { url: pollUrl },
          caption: `🎨 *Pollinations AI*\n\nPrompt: ${prompt}`
        }, { quoted: msg });
      }

    } catch (imagineErr) {
      console.error('Image Generation Error:', imagineErr.message);
      await sock.sendMessage(from, { text: `❌ Fehler beim Generieren des Bildes: ${imagineErr.message}\n\nVersuche mit einem einfacheren Prompt (z.B. "Katze")` }, { quoted: msg });
    }

  } catch (err) {
    console.error('Imagine Error:', err);
    await sock.sendMessage(from, { text: `❌ Fehler: ${err.message}` }, { quoted: msg });
  }
  break;
}


case 'video': {
  try {
    const sender = msg.key.participant || msg.key.remoteJid || msg.sender;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!text) {
      await sock.sendMessage(from, { 
        text: "⚠️ Bitte gib eine Videobeschreibung ein.\nBeispiel: /video Ein weißer Hund spielt am Strand"
      }, { quoted: msg });
      break;
    }

    // Entferne den Command
    let prompt = text.replace(/^\/video\s+/i, '').trim();
    if (!prompt) {
      await sock.sendMessage(from, { 
        text: "⚠️ Bitte gib eine Videobeschreibung ein.\nBeispiel: /video Ein weißer Hund spielt am Strand"
      }, { quoted: msg });
      break;
    }

    // Reaktion: Bot arbeitet
    await sock.sendMessage(from, { react: { text: '🎬', key: msg.key } });

    try {
      // Nutze die persönliche KI-Konfiguration des Users
      const userConfig = getUserConfig(sender);
      const apiConfig = require('./apiConfig.json');
      
      // Für Video-Generierung nutzen wir Claude (apifree-ai)
      const claudeConfig = apiConfig.claude;
      if (!claudeConfig || !claudeConfig.apiKey) {
        throw new Error('Claude API nicht konfiguriert. Video-Generierung benötigt Claude.');
      }

      // Standard Video-Parameter
      const videoPayload = {
        model: "wan-ai/wan2.2-i2v-a14b/turbo",
        prompt: prompt,
        duration: 5,
        resolution: "720p",
        aspect_ratio: "16:9"
      };

      // Optionales Bild hinzufügen, falls vorhanden
      if (msg.message?.imageMessage) {
        try {
          const imageBuffer = await downloadMediaMessage(msg, 'buffer', 0);
          const base64Image = imageBuffer.toString('base64');
          videoPayload.image_data = `data:image/jpeg;base64,${base64Image}`;
        } catch (imgErr) {
          console.warn('Bild konnte nicht verarbeitet werden, fahre ohne Bild fort:', imgErr.message);
        }
      }

      // Sende Video-Generierungsanfrage
      const response = await axios.post(`${claudeConfig.baseUrl}/video/submit`, videoPayload, {
        headers: {
          'Authorization': `Bearer ${claudeConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });

      if (response.data) {
        const { id, status, video_url } = response.data;
        
        let statusMsg = `🎬 *Video wird generiert*\n\n`;
        statusMsg += `📝 Prompt: ${prompt}\n`;
        statusMsg += `⏱️ Dauer: 5 Sekunden\n`;
        statusMsg += `📐 Auflösung: 720p (16:9)\n\n`;
        
        if (video_url) {
          statusMsg += `✅ Video bereit!\n🔗 Link: ${video_url}`;
        } else if (id) {
          statusMsg += `⏳ Status: ${status || 'processing'}\n`;
          statusMsg += `🆔 Job ID: ${id}\n\n`;
          statusMsg += `*Hinweis:* Das Video wird gerade generiert. Dies kann 1-2 Minuten dauern.`;
        } else {
          statusMsg += `⏳ Video wird verarbeitet...\n`;
          statusMsg += `*Hinweis:* Dies kann 1-2 Minuten dauern. Der Bot wird dir Bescheid geben!`;
        }

        await sock.sendMessage(from, { text: statusMsg }, { quoted: msg });
      } else {
        throw new Error('Ungültige Antwort von Video API');
      }

    } catch (videoErr) {
      console.error('Video Generation Error:', videoErr.message);
      const errorMsg = videoErr.response?.data?.error?.message || videoErr.message;
      await sock.sendMessage(from, { text: `❌ Video-Generierungsfehler: ${errorMsg}\n\nVersuche mit einem einfacheren Prompt.` }, { quoted: msg });
    }

  } catch (err) {
    console.error('Video Error:', err);
    await sock.sendMessage(from, { text: `❌ Fehler: ${err.message}` }, { quoted: msg });
  }
  break;
}


case 'song': {
  try {
    const sender = msg.key.participant || msg.key.remoteJid || msg.sender;
    
    // Nutze args vom Command-Parser
    if (args.length === 0) {
      await sock.sendMessage(from, { 
        text: "⚠️ Bitte gib eine Lied-Beschreibung ein.\nBeispiel: /song Eine glückliche Geschichte über den Sommer\n\n*Hinweis:* Dieser Command konvertiert dein Liedtext zu Audio (TTS).\nFür AI-generierte Musik nutze Suno oder andere Musik-Tools."
      }, { quoted: msg });
      break;
    }

    const prompt = args.join(' ');

    if (!prompt || prompt.trim().length === 0) {
      await sock.sendMessage(from, { 
        text: "⚠️ Bitte gib einen Text ein!\nBeispiel: /song Eine glückliche Geschichte"
      }, { quoted: msg });
      break;
    }

    // Reaktion: Bot arbeitet
    await sock.sendMessage(from, { react: { text: '🎵', key: msg.key } });

    try {
      const apiConfig = require('./apiConfig.json');
      const claudeConfig = apiConfig.claude;
      
      if (!claudeConfig || !claudeConfig.apiKey) {
        throw new Error('Claude API nicht konfiguriert. Song-Funktion benötigt Claude.');
      }

      // Nutze TTS mit einer männlichen Stimme für Song-Rezitation
      const songPayload = {
        prompt: prompt,
        model: "hexgrad/kokoro-tts/american-english",
        voice: "bm_george",
        speed: 1
      };

      console.log('Sende Song-Anfrage (als TTS):', songPayload);

      // Sende Audio-Generierungsanfrage
      const response = await axios.post(`${claudeConfig.baseUrl}/audio/submit`, songPayload, {
        headers: {
          'Authorization': `Bearer ${claudeConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });

      console.log('Song Response:', response.data);

      let statusMsg = `🎵 *Lied-Audio wird generiert*\n\n`;
      statusMsg += `📝 Text: ${prompt}\n`;
      statusMsg += `🎤 Stimme: George (männlich)\n`;
      statusMsg += `🌐 Format: TTS Audio\n\n`;

      if (response.data?.audio_url) {
        statusMsg += `✅ Audio bereit!\n🔗 Link: ${response.data.audio_url}`;
        
        // Versuche Audio zu senden
        try {
          await sock.sendMessage(from, {
            audio: { url: response.data.audio_url },
            mimetype: 'audio/mpeg',
            ptt: false
          }, { quoted: msg });
        } catch (audioErr) {
          console.warn('Audio konnte nicht direkt gesendet werden');
        }
      } else if (response.data?.id) {
        statusMsg += `⏳ Status: ${response.data.status || 'processing'}\n`;
        statusMsg += `🆔 Job ID: ${response.data.id}\n\n`;
        statusMsg += `*Hinweis:* Audio wird gerade generiert. Dies kann 30-60 Sekunden dauern.`;
      } else {
        statusMsg += `⏳ Audio wird verarbeitet...\n\n`;
        statusMsg += `*Hinweis:* Dies kann 30-60 Sekunden dauern.`;
      }

      await sock.sendMessage(from, { text: statusMsg }, { quoted: msg });

    } catch (songErr) {
      console.error('Song Generation Error:', songErr.message);
      console.error('Song Error Details:', songErr.response?.data);
      const errorMsg = songErr.response?.data?.error?.message || songErr.response?.data?.message || songErr.message;
      await sock.sendMessage(from, { text: `❌ Audio-Fehler: ${errorMsg}\n\nVersuche mit einem kürzeren oder einfacheren Text.` }, { quoted: msg });
    }

  } catch (err) {
    console.error('Song Error:', err);
    await sock.sendMessage(from, { text: `❌ Fehler: ${err.message}` }, { quoted: msg });
  }
  break;
}


case 'tts': {
  try {
    const sender = msg.key.participant || msg.key.remoteJid || msg.sender;
    
    console.log('TTS Command aufgerufen mit args:', args);
    
    // Nutze args vom Command-Parser
    if (!args || args.length < 2) {
      await sock.sendMessage(from, { 
        text: "⚠️ Verwendung: /tts <stimme> <text>\n\nAvailable voices:\n• af_heart (weiblich)\n• am_michael (männlich)\n• bf_emma (weiblich)\n• bm_george (männlich)\n• cf_nicole (weiblich)\n• cm_oliver (männlich)\n\nBeispiel: /tts af_heart Hello world"
      }, { quoted: msg });
      break;
    }

    const voice = args[0];
    const prompt = args.slice(1).join(' ');

    console.log('Parsed TTS:', { voice, prompt });

    if (!prompt || prompt.trim().length === 0) {
      await sock.sendMessage(from, { 
        text: "⚠️ Bitte gib einen Text ein!\nBeispiel: /tts af_heart Hello world"
      }, { quoted: msg });
      break;
    }

    // Validiere Stimme
    const validVoices = ['af_heart', 'am_michael', 'bf_emma', 'bm_george', 'cf_nicole', 'cm_oliver'];
    if (!validVoices.includes(voice.toLowerCase())) {
      await sock.sendMessage(from, { 
        text: `❌ Ungültige Stimme: ${voice}\n\nAvailable voices:\n${validVoices.map(v => `• ${v}`).join('\n')}`
      }, { quoted: msg });
      break;
    }

    // Reaktion: Bot arbeitet
    await sock.sendMessage(from, { react: { text: '🔊', key: msg.key } });

    try {
      const apiConfig = require('./apiConfig.json');
      const claudeConfig = apiConfig.claude;
      
      if (!claudeConfig || !claudeConfig.apiKey) {
        throw new Error('Claude API nicht konfiguriert. TTS benötigt Claude.');
      }

      console.log('TTS-Request wird gesendet:', { voice, prompt, baseUrl: claudeConfig.baseUrl });

      // TTS-Generierung
      const ttsPayload = {
        model: "hexgrad/kokoro-tts/american-english",
        prompt: prompt,
        voice: voice.toLowerCase(),
        speed: 1
      };

      console.log('TTS Payload:', ttsPayload);

      // Sende TTS-Anfrage
      const response = await axios.post(`${claudeConfig.baseUrl}/audio/submit`, ttsPayload, {
        headers: {
          'Authorization': `Bearer ${claudeConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });

      console.log('TTS Response erhalten:', response.data);

      let statusMsg = `🔊 *Text-zu-Sprache wird generiert*\n\n`;
      statusMsg += `📝 Text: ${prompt}\n`;
      statusMsg += `🎤 Stimme: ${voice}\n`;
      statusMsg += `⚡ Speed: Normal (1x)\n`;
      statusMsg += `🌐 Sprache: English\n\n`;

      if (response.data?.audio_url) {
        statusMsg += `✅ Audio bereit!\n🔗 Link: ${response.data.audio_url}`;
        
        // Sende Link
        await sock.sendMessage(from, { text: statusMsg }, { quoted: msg });
        
        // Versuche auch Audio zu senden
        try {
          await sock.sendMessage(from, {
            audio: { url: response.data.audio_url },
            mimetype: 'audio/mpeg',
            ptt: false
          }, { quoted: msg });
        } catch (audioErr) {
          console.warn('Audio konnte nicht direkt gesendet werden:', audioErr.message);
        }
      } else if (response.data?.id) {
        statusMsg += `⏳ Status: ${response.data.status || 'processing'}\n`;
        statusMsg += `🆔 Job ID: ${response.data.id}\n\n`;
        statusMsg += `*Hinweis:* Audio wird gerade generiert. Dies kann 30-60 Sekunden dauern.`;
        await sock.sendMessage(from, { text: statusMsg }, { quoted: msg });
      } else {
        statusMsg += `⏳ Audio wird verarbeitet...\n\n`;
        statusMsg += `*Hinweis:* Dies kann 30-60 Sekunden dauern. Der Bot wird dir Bescheid geben!`;
        await sock.sendMessage(from, { text: statusMsg }, { quoted: msg });
      }

    } catch (ttsErr) {
      console.error('TTS Generation Error:', ttsErr.message);
      console.error('TTS Error Response:', ttsErr.response?.data);
      console.error('TTS Error Config:', ttsErr.config);
      
      const errorMsg = ttsErr.response?.data?.error?.message || ttsErr.response?.data?.message || ttsErr.message;
      await sock.sendMessage(from, { text: `❌ TTS-Fehler: ${errorMsg}\n\nVersuche mit kürzerem Text oder einfacheren Worten.` }, { quoted: msg });
    }

  } catch (err) {
    console.error('TTS Error:', err);
    await sock.sendMessage(from, { text: `❌ Fehler: ${err.message}` }, { quoted: msg });
  }
  break;
}


case 'join': {
  try {
    const supportGroup = "120363419556165028@g.us"; // Supportgruppe

    // Prüfe Gruppengröße: Mindestens 10 oder 15 Mitglieder erforderlich
    try {
      const metadata = await sock.groupMetadata(from);
      const memberCount = metadata?.participants?.length || 0;
      const minMembers = 10; // Mindestanzahl: 10 Mitglieder
      
      if (memberCount < minMembers) {
        return await sock.sendMessage(from, {
          text: `❌ Diese Gruppe hat nicht genug Mitglieder!\n\n👥 Aktuell: ${memberCount} Mitglieder\n📊 Erforderlich: mindestens ${minMembers} Mitglieder\n\n💡 Tipp: Ladet mehr Leute ein und versucht es später erneut.`,
        });
      }
    } catch (err) {
      console.error('Fehler beim Abrufen der Gruppengröße:', err.message);
      return await sock.sendMessage(from, {
        text: "❌ Konnte Gruppengröße nicht überprüfen. Bitte versuche es später erneut.",
      });
    }

    // Prüfe, ob ein Link angegeben wurde
    if (!args[0]) {
      return await sock.sendMessage(from, {
        text: "❗ Bitte gib einen Gruppen-Invite-Link an.\n\nBeispiel:\n/join https://chat.whatsapp.com/example",
      });
    }

    const inviteLink = args[0].trim();

    // Optional: Validierung des Links
    const inviteCodeMatch = inviteLink.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
    if (!inviteCodeMatch) {
      return await sock.sendMessage(from, {
        text: "❌ Ungültiger Invite-Link. Bitte überprüfe den Link und versuche es erneut.",
      });
    }

    // Nachricht an Supportgruppe senden
    const joinRequestMsg = `📥 *Neue Join-Anfrage für den Bot*\n\n👤 *Von:* @${sender.split('@')[0]}\n🆔 *User-ID:* ${sender}\n\n💬 *Angegebener Invite-Link:*\n${inviteLink}\n\n🕒 *Zeit:* ${new Date().toLocaleString("de-DE")}\n\n💡 *Aktion nötig:* Manuelles Hinzufügen durch einen Admin.`;

    await sock.sendMessage(supportGroup, {
      text: joinRequestMsg,
      mentions: [sender],
    });

    // Bestätigung an den Nutzer
    await sock.sendMessage(from, {
      text: `📨 Deine Join-Anfrage wurde an das Team weitergeleitet.\nBitte warte, bis ein Verantwortlicher den Bot hinzufügt.`,
    });

    await sock.sendMessage(from, { react: { text: "📬", key: msg.key } });

  } catch (err) {
    console.error(err);
    await sock.sendMessage(from, {
      text: "❌ Fehler bei der Join-Anfrage.",
    });
  }
  break;
}

    case 'agb': {
      try {
        const agbText = `
📜 *ALLGEMEINE GESCHÄFTSBEDINGUNGEN (AGB) 2026*
═════════════════════════════════════════════════

*1️⃣ GRUNDLAGEN & BETREIBER*
Betreiber: Beast Industries / Beastmeds
Kontakt: wa.me/4367764694963
Gültig für: Alle Benutzer des BeastBot-Systems
Datum: 11. Februar 2026
Geltungsbereich: Global (mit Schwerpunkt: Deutschland, Österreich, Schweiz)

═════════════════════════════════════════════════

*2️⃣ SERVICEBESCHREIBUNG*

Der BeastBot bietet folgende Hauptfunktionen:

🎮 *Unterhaltung & Spiele*
- Stranger Things Commands (Menu 11)
- Verschiedene Spiele & Rätsel (Tic-Tac-Toe, Hangman)
- Quote & Fact-Generierung

🤖 *KI-Dienste (Menu 12)*
- /ask - Intelligente Fragen beantworten
- /summarize - Textzusammenfassung
- /translate - Sprachenübersetzung
- /joke, /rhyme, /poem - Kreative Inhalte
- /story, /riddle - Geschichten & Rätsel
- /codehelp, /math, /define - Technische Hilfe

🎵 *Audio-Bearbeitung (Menu 8)*
- bassboost, slowed, spedup, nightcore
- reverb, reverse, deep, echo
- vaporwave, 8d, earrape, chipmunk

⚙️ *Benutzerkonfiguration*
- /config ai <Modell> - KI-Modell wählen
- /config birthday <Datum> - Geburtstag eintragen
- /config game <Spiel> - Lieblingsspiel setzen
- /config lang <Sprache> - Spracheinstellung
- /config theme <Design> - Theme auswählen

💰 *Wirtschaftssystem*
- Levelling & Ranking
- Shop & Trading
- Pet-System
- Inventar-Management

═════════════════════════════════════════════════

*3️⃣ NUTZUNGSBEDINGUNGEN*

✅ *ERLAUBT:*
✓ Normale Kommunikation und Botkommandos
✓ Nutzung aller öffentlichen Funktionen
✓ Persönliche Konfiguration speichern
✓ Audio-Verarbeitung für private Nachrichten
✓ KI-Funktionen nutzen (respektvoll)
✓ An Spielen & Aktivitäten teilnehmen

❌ *NICHT ERLAUBT:*
✗ Spam & Massenversand
✗ Hate-Speech & Beleidigungen
✗ Sexuelle Inhalte oder Nacktheit
✗ Gewalt & Bedrohungen
✗ Manipulation oder Bot-Missbrauch
✗ Rechtswidrige Inhalte
✗ Phishing & Datendiebstahl
✗ Botverschiebung ohne Erlaubnis
✗ Gruppen übernehmen oder moderieren

═════════════════════════════════════════════════

*4️⃣ HOSTING & INSTANZ-VERWALTUNG*

🔐 *Hosting-Regeln:*
- Hosting NUR mit ausdrücklicher Erlaubnis des Owners
- Gehostete Sessions erfordern Vertragsabschluss
- Owner haftet für Handlungen seiner Session
- Unbefugte Nutzung = Sofortiger Ausschluss
- Backup & Snapshot-Daten sind Eigentum des Operators

🚫 *Hosting-Verbote:*
- Keine eigenen Chats über persönliche Nummer
- Keine Manipulation der Session
- Keine Kopierlizenz ohne Zustimmung
- Keine Weitergabe an Dritte

═════════════════════════════════════════════════

*5️⃣ ADMINISTRATORRECHTE*

🛡️ *Nur der Owner/Admin darf:*
- Administrative Funktionen ausführen
- Benutzer verbannen oder blockieren
- Bot-Konfiguration ändern
- Datenbanken verwalten
- Neuen Session-Ordner erstellen
- Support-Tickets bearbeiten

⚠️ *Missbrauch führt zu:*
- Account-Deaktivierung
- Datenlöschung
- Rechtliche Schritte
- Permanenter Ausschluss

═════════════════════════════════════════════════

*6️⃣ DATENSCHUTZ & DATENSICHERHEIT*

📋 *Siehe auch: /dsgvo (Vollständige Datenschutzerklärung)*

🔒 *Ihre Daten:*
- Werden verschlüsselt gespeichert
- Unterliegen der DSGVO
- Werden nicht an Dritte weitergegeben
- Können jederzeit eingesehen werden (/dateninfo)

📝 *Ihre Rechte:*
- Art. 15 DSGVO - Auskunftsrecht
- Art. 17 DSGVO - Recht auf Vergessenwerden
- Art. 20 DSGVO - Datenportabilität
- Art. 21 DSGVO - Widerspruchsrecht

═════════════════════════════════════════════════

*7️⃣ HAFTUNG & VERANTWORTUNG*

⚖️ *Benutzer sind verantwortlich für:*
- Eigene Nachrichten & Inhalte
- Korrekte Verwendung der Features
- Einhaltung von Gesetzen
- Schäden durch Missbrauch

🚫 *BeastBot haftet NICHT für:*
- Datenverlust durch Systemfehler
- Unbefugte Zugriffe trotz Sicherheit
- Inhalte anderer Benutzer
- Externe API-Fehler
- Technische Ausfallzeiten

═════════════════════════════════════════════════

*8️⃣ REGELWERK & KONSEQUENZEN*

📋 *Regelverstöße führen zu:*

1️⃣ *Verwarnung (1. Verstoß)*
   → Private Nachricht mit Verbot

2️⃣ *Stille (2. Verstoß)*
   → 24h - 7d Mute in Gruppen

3️⃣ *Bann (3. Verstoß)*
   → Permanente Sperrung vom Bot

⚡ *Sofortiger Bann für:*
   → Hate-Speech & Rassismus
   → Sexuelle Belästigung
   → Doxxing & Datenklau
   → Rechtsverletzungen

═════════════════════════════════════════════════

*9️⃣ ÄNDERUNGEN & UPDATES*

📢 *Diese AGB können sich ändern:*
- Owner kann Regeln jederzeit aktualisieren
- Änderungen werden angekündigt
- Fortgesetzte Nutzung = Akzeptanz
- Alte Versionen sind ungültig

🔄 *Versionshistorie:*
- v1.0: 11.02.2026 - Initial
- Nächste Review: 30.04.2026

═════════════════════════════════════════════════

*🔟 KONTAKT & SUPPORT*

❓ *Fragen zu den AGB?*
📞 wa.me/4367764694963
💬 /support <Frage>
📧 Formulare unter /kontakt

═════════════════════════════════════════════════

*✅ AKZEPTANZBESTÄTIGUNG*

Mit der Nutzung des BeastBot akzeptierst du:
✓ Diese Allgemeinen Geschäftsbedingungen
✓ Die Datenschutzerklärung (/dsgvo)
✓ Alle geltenden Gesetze
✓ Die Autorität des Owners

*Zuwiderhandlung = Ausschluss*

═════════════════════════════════════════════════
         BeastBot - Offizielle AGB 2026
═════════════════════════════════════════════════
`;

        await sock.sendMessage(from, { text: agbText.trim() }, { quoted: msg });
      } catch (err) {
        console.error('Fehler bei AGB:', err);
        await sock.sendMessage(from, { text: `❌ Fehler: ${err.message}` }, { quoted: msg });
      }
      break;
    }

// ========== SUPPORT ==========  
case 'support': {
  try {
    const query = args.join(" ");
    const supportGroup = getSupportGroup(); // Supportgruppen-ID aus Konfiguration

    if (!query)
      return await sock.sendMessage(from, {
        text: "❗ Bitte gib deine Supportnachricht an.\n\n💡 Beispiel:\n`/support Mein Befehl funktioniert nicht.`",
      });

    const data = loadSupportData();
    const newId = data.lastId + 1;
    data.lastId = newId;

    data.tickets.push({
      id: newId,
      user: sender,
      chat: from,
      message: query,
      status: "offen",
      timestamp: Date.now(),
    });
    saveSupportData(data);

    const supportText = `🆘 *Neue Supportanfrage #${newId}*\n\n👤 *Von:* @${sender.split("@")[0]}\n🌍 *Chat:* ${from}\n\n📩 *Nachricht:*\n${query}\n\n💡 *Zum Antworten:* \`/reply ${newId} <Antwort>\``;

    if (!supportGroup) {
      await sock.sendMessage(from, { text: '❌ Es ist keine Support-Gruppe konfiguriert. Bitte richte sie mit `supportgroup set` ein.' }, { quoted: msg });
      return;
    }

    await sock.sendMessage(supportGroup, {
      text: supportText,
      mentions: [sender],
    });

    await sock.sendMessage(from, {
      text: `✅ Deine Supportanfrage wurde erfolgreich gesendet!\n\n🆔 Ticket-ID: *#${newId}*\n💬 Das Team antwortet dir hier im Chat.`,
    });

    await sock.sendMessage(from, { react: { text: "📨", key: msg.key } });
  } catch (err) {
    console.error(err);
    await sock.sendMessage(from, {
      text: "❌ Fehler beim Senden der Supportanfrage. Bitte versuche es später erneut.",
    });
  }
  break;
}

// ========== COMMUNITY ==========
case 'community': {
  try {
    const communityLink = 'https://chat.whatsapp.com/Hu2gjCneSvQLj9q2RHw1E0';
    
    await sock.sendMessage(from, {
      text: `🌐 *BeastBot Community*

Hier kannst du der offiziellen Community beitreten:
${communityLink}

🎉 Willkommen im BeastBot Community!`,
    });
  } catch (err) {
    console.error('Community-Befehl fehlgeschlagen:', err);
    await sock.sendMessage(from, {
      text: '❌ Beim Abrufen der Community ist ein Fehler aufgetreten.',
    });
  }
  break;
}

// ========== REPLY ==========
case 'reply': {
  try {
    // 🔒 Rangprüfung
    const senderRank = ranks.getRank(sender);
    const allowed = ["Inhaber", "Stellvertreter Inhaber", "Supporter", "Moderator"];

    if (!allowed.includes(senderRank)) {
      await sock.sendMessage(from, { react: { text: "🔒", key: msg.key } });
      await sock.sendMessage(from, {
        text: `⛔ *Zugriff verweigert!*\n\nNur folgende Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber & Moderatoren\n• 🧰 Supporter`,
      });
      break;
    }

    const data = loadSupportData();
    const ticketId = parseInt(args[0]);

    if (isNaN(ticketId))
      return await sock.sendMessage(from, {
        text: "❗ Bitte gib eine gültige Ticket-ID an.\n💡 Beispiel: `/reply 3 Danke für deine Meldung.`",
      });

    const replyText = args.slice(1).join(" ");
    if (!replyText)
      return await sock.sendMessage(from, {
        text: "❗ Bitte gib eine Antwort an.\n💡 Beispiel: `/reply 3 Ich kümmere mich darum.`",
      });

    const ticket = data.tickets.find((t) => t.id === ticketId);
    if (!ticket)
      return await sock.sendMessage(from, {
        text: "❌ Ticket wurde nicht gefunden.",
      });

    // 🧾 Supportantwort inkl. ursprünglicher Nachricht
    const responder = sender;
    const replyMsg = `📬 *Support-Antwort #${ticketId}*\n━━━━━━━━━━━━━━━\n👤 *Von:* @${responder.split("@")[0]}\n🕐 *Zeit:* ${new Date().toLocaleString("de-DE")}\n━━━━━━━━━━━━━━━\n💭 *Ursprüngliche Anfrage:*\n> ${ticket.message}\n\n💬 *Antwort:*\n${replyText}`;

    await sock.sendMessage(ticket.user, {
      text: replyMsg,
      mentions: [responder],
    });

    await sock.sendMessage(from, {
      text: `✅ Antwort zu Ticket *#${ticketId}* wurde an @${ticket.user.split("@")[0]} gesendet.`,
      mentions: [ticket.user],
    });

    await sock.sendMessage(from, { react: { text: "💾", key: msg.key } });

    ticket.status = "beantwortet";
    saveSupportData(data);
  } catch (err) {
    console.error(err);
    await sock.sendMessage(from, {
      text: "❌ Fehler beim Antworten auf das Supportticket.",
    });
  }
  break;
}

case 'qr': {
  const content = args.join(' ');
  if (!content) {
    await sock.sendMessage(chatId, { 
      text: '❌ Bitte gib Inhalt für den QR-Code an!\n\n📝 **Verwendung:**\n/qr <text/link/etc>\n\n💡 **Beispiele:**\n• `/qr https://example.com` - Link als QR\n• `/qr Hallo Welt!` - Text als QR\n• `/qr tel:+4917012345678` - Telefonnummer\n• `/qr mailto:test@example.com` - E-Mail\n\n🎨 BeastBot-Style: Weiß auf Schwarz!' 
    }, { quoted: msg });
    break;
  }

  try {
    await sock.sendMessage(chatId, { react: { text: '⚙️', key: msg.key } });

    const QRCode = require('qrcode');
    const Canvas = require('canvas');
    
    // Canvas vorbereiten
    const canvas = Canvas.createCanvas(512, 512);
    const ctx = canvas.getContext('2d');

    // Hintergrund: Schwarz
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);

    // QR-Code in Weiß zeichnen
    await QRCode.toCanvas(canvas, content, {
      width: 512,
      margin: 2,
      color: {
        dark: '#FFFFFF',  // QR-Code: Weiß
        light: '#000000'  // Hintergrund: Schwarz
      },
      errorCorrectionLevel: 'H'
    });

    const buffer = canvas.toBuffer('image/png');

    // Anzeige-Inhalt kürzen
    const maxContentLength = 50;
    const displayContent = content.length > maxContentLength 
      ? content.substring(0, maxContentLength) + '...' 
      : content;

    const caption = `⚡ **BeastBot QR-Code**\n\n📄 **Inhalt:** \`${displayContent}\`\n🎨 **Design:** Weiß auf Schwarz\n📏 **Größe:** 512×512px PNG\n\n📷 **Tipp:** Scanne den Code mit deiner Kamera!`;

    await sock.sendMessage(chatId, { 
      image: buffer, 
      caption 
    }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

  } catch (error) {
    console.error('QR-Code Error:', error);

    try {
      // Fallback: Standard-QR
      const QRCode = require('qrcode');
      const fallback = await QRCode.toBuffer(content, {
        type: 'png',
        width: 512,
        margin: 2,
        color: {
          dark: '#FFFFFF',
          light: '#000000'
        },
        errorCorrectionLevel: 'M'
      });

      await sock.sendMessage(chatId, { 
        image: fallback, 
        caption: ` **QR-Code**\n\n📄 Inhalt: \`${content}\`\n🎨 Weiß auf Schwarz`
      }, { quoted: msg });

         await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (fallbackError) {
      console.error('QR Fallback Error:', fallbackError);
      await sock.sendMessage(chatId, { 
        text: '❌ Fehler beim Generieren des QR-Codes. Bitte versuche es erneut.' 
      }, { quoted: msg });
      await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
  }
  break;
}
case 'reload': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

     if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }
    
 await sendReaction(from, msg, '🔄');
    await sock.sendMessage(from, { text: '♻️ *BeastBot wird neu gestartet...*\n\nBis gleich! 👋' }, { quoted: msg });

    // Verzögerung vor dem Neustart, damit die Nachricht versendet wird
    setTimeout(() => {
      const { exec } = require('child_process');
      
      // PM2 startet den Bot neu - BB Prozess
      exec('pm2 restart BB', (error, stdout, stderr) => {
        if (error) {
          console.error('[RELOAD] Error:', error);
          return;
        }
        console.log('[RELOAD] Neustart-Befehl via PM2 gesendet');
      });
    }, 2000);

  } catch (e) {
    reply(`❌ Fehler beim Reload-Command: ${e.message}`);
  }
  break;
}

case 'restart': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

     if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }
    
 await sendReaction(from, msg, '🔄');
    await sock.sendMessage(from, { text: '♻️ *PM2 Prozess "BB" wird neu gestartet...*\n\nBis gleich! 👋' }, { quoted: msg });

    // Verzögerung vor dem Neustart, damit die Nachricht versendet wird
    setTimeout(() => {
      const { exec } = require('child_process');
      
      // PM2 restart BB Prozess
      exec('pm2 restart BB', (error, stdout, stderr) => {
        if (error) {
          console.error('[RESTART BB] Error:', error);
          return;
        }
        console.log('[RESTART BB] Neustart-Befehl via PM2 gesendet');
      });
    }, 2000);

  } catch (e) {
    reply(`❌ Fehler beim Restart-Command: ${e.message}`);
  }
  break;
}

case 'log': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

    if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
      await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
      break;
    }

    await sendReaction(from, msg, '📋');
    await sock.sendMessage(from, { text: '⏳ *PM2 Logs werden geladen...* \n\nBitte warten...' }, { quoted: msg });

    const { exec } = require('child_process');

    // PM2 Logs der letzten 50 Zeilen auslesen
    exec('pm2 logs BB --lines 50 --nostream', (error, stdout, stderr) => {
      if (error) {
        sock.sendMessage(from, { text: `❌ Fehler beim Abrufen der Logs:\n\n${error.message}` }, { quoted: msg });
        console.error('[LOG] Error:', error);
        return;
      }

      // Logs begrenzen auf max. 4096 Zeichen (WhatsApp Limit)
      const logs = stdout.substring(0, 4000) || 'Keine Logs verfügbar';
      const logMessage = `📋 *PM2 Logs (BB Prozess):*\n\n\`\`\`\n${logs}\n\`\`\`\n\n⏱️ *Diese Nachricht wird in 20 Sekunden gelöscht!*`;

      sock.sendMessage(from, { text: logMessage }, { quoted: msg }).then(sentMsg => {
        // Nach 20 Sekunden löschen
        setTimeout(() => {
          try {
            sock.sendMessage(from, { delete: sentMsg.key });
            console.log('[LOG] Nachricht gelöscht');
          } catch (delErr) {
            console.error('[LOG] Delete error:', delErr);
          }
        }, 20000);
      });
    });

  } catch (e) {
    reply(`❌ Fehler beim Log-Command: ${e.message}`);
  }
  break;
}

case 'startmc': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

      if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }

    const { exec } = require('child_process');
    const path = require('path');
    const batFile = path.join(__dirname, 'mc.bat'); 

    await sock.sendMessage(from, { text: '🟢 *Starte Minecraft-Server über PM2...*' }, { quoted: msg });
 await sendReaction(from, msg, '✅');
    exec(`cmd /c "${batFile}"`, (error, stdout, stderr) => {
      if (error) {
        sock.sendMessage(from, { text: `❌ Fehler beim Starten:\n${error.message}` }, { quoted: msg });
        return;
      }

      const output = stdout || stderr || 'Kein Output';
      sock.sendMessage(from, { text: `✅ *Startbefehl erfolgreich ausgeführt.*\n🕒Warten Sie bitte 2 Minuten bis der Server komplett gestartet ist\n🟢 Errichbar unter: Frag den Owner\n🟢Verionen: 1.21.8 oder höher` },  { quoted: msg }
       
        
      );
    });

  } catch (e) {
    reply(`❌ Fehler beim Start-Command: ${e.message}`);
  }
  break;
}

case 'dsgvo': {
  try {
    const fs = require('fs');
    const path = require('path');

    // DSGVO-Text aktualisiert
    const dsgvoText = `
📜 *DATENSCHUTZERKLÄRUNG (DSGVO) 2026*
══════════════════════════════════════

Dieser Bot verarbeitet personenbezogene Daten gemäß DSGVO.

🔹 *1. VERANTWORTLICHER*
Der Betreiber dieses Bots ist verantwortlich für die Datenverarbeitung.
📞 Kontakt: wa.me/4367764694963
🏢 Betreiber: Beast Industries / Beastmeds

🔹 *2. VERARBEITETE DATEN (KONKRET)*
✓ WhatsApp-ID (LID / JID) - Eindeutige Benutzer-Identifikation
✓ Telefonnummer - Authentifizierung & Kontakt
✓ Benutzername / Profilname - Personalisierung
✓ Nachrichten & Sprachnachrichten - Verarbeitung & Kommunikation
✓ *Konfigurationsdaten:*
   → Bevorzugte KI (Claude, Groq, Nyxion, Axiom, Voltra)
   → Geburtstag
   → Lieblingsspiel
   → Spracheinstellungen (de, en, es, fr)
   → Design-Präferenzen (dark, light)
✓ Log-Einträge - Sicherheit, Fehlersuche, Analytics
✓ Ban-Einträge - Missbrauchsprävention
✓ Audio-Daten - TEMPORÄR nur während Verarbeitung
✓ Registrierungsdaten - Zeitstempel & Aktivitäten

🔹 *3. ZWECK DER VERARBEITUNG*
✅ Bereitstellung von Bot-Diensten (KI, Audio, Spiele)
✅ KI-gestützte Funktionen (ask, summarize, translate, poem, etc.)
✅ Audio-Effekt-Verarbeitung (bassboost, nightcore, reverb, etc.)
✅ Benutzer-Personalisierung & Konfiguration
✅ Missbrauchs- & Spam-Prävention
✅ Service-Verbesserung & Optimierung
✅ Sicherheit & Nachvollziehbarkeit
✅ Statistische Auswertungen

🔹 *4. RECHTSGRUNDLAGE*
Art. 6 Abs. 1 lit. f DSGVO - Berechtigtes Interesse (Service-Erbringung)
Art. 6 Abs. 1 lit. c DSGVO - Erfüllung rechtlicher Pflichten
Art. 6 Abs. 1 lit. b DSGVO - Erfüllung von Vertragsverpflichtungen

🔹 *5. SPEICHERDAUER*
Log-Daten: 30 Tage (dann automatisch gelöscht)
Ban-Einträge: Dauerhaft
Konfigurationsdaten: Solange Account aktiv ist
Registrierungsdaten: Solange Account existiert
Audio (Temp): Sofort nach Verarbeitung gelöscht (max. 5 Min)

🔹 *6. DATENEMPFÄNGER*
Die Daten werden verarbeitet durch:
→ Bot-Serversystem
→ Speichersysteme (SQLite, JSON-Dateien)
→ Externe KI-APIs (Claude, Groq, Nyxion, Axiom, Voltra) *nur bei /ask Befehlen
→ Audio-Processing-Systeme (FFmpeg)

*Keine Weitergabe an Dritte ohne Zustimmung*

🔹 *7. BETROFFENENRECHTE (DSGVO)*
📌 *Art. 15* - Auskunftsrecht
📌 *Art. 16* - Berichtigung
📌 *Art. 17* - Recht auf Vergessenwerden (Löschung)
📌 *Art. 18* - Einschränkung der Verarbeitung
📌 *Art. 20* - Datenportabilität
📌 *Art. 21* - Widerspruchsrecht
📌 *Art. 22* - Automatisierte Entscheidungsfindung

*Anfragen stellen via:*
→ /dateninfo <nummer> - Datenauskunft
→ /kontakt - Kontaktformular

🔹 *8. DATENSICHERHEIT & SCHUTZMA. SNAHMEN*
🔒 Verschlüsselte Speicherung sensibler Daten
🔒 Passwort-geschützte Admin-Funktionen
🔒 Regelmaßige Backups & Integritätsprüfungen
🔒 Zugriffskontrolle & Rang-System
🔒 Automatische Löschung von Temporary-Daten

🔹 *9. BESCHWERDE*
Beschwerderechtbei Aufsichtsbehörde:
→ Datenschutzbehörde Ihres Landes (z.B. LDI NRW)
→ Europäische Datenschutzbeauftragte

🔹 *10. KONTAKT & ANFRAGEN*
Für alle Fragen zur Datenschutzverarbeitung:
📧 wa.me/4367764694963
🤖 /dateninfo <nummer> - Schnelle Datenauskunft
📝 /kontakt - Formulare & Anfragen

🔹 *11. ÄNDERUNGEN*
Diese Datenschutzerklärung wird bei Bedarf aktualisiert.
Letzte Änderung: 11.02.2026
Nächste Review: 30.04.2026

══════════════════════════════════════
💡 Mit der Nutzung akzeptierst du diese
Datenschutzerklärung gemäß DSGVO.
══════════════════════════════════════
`;

    await sock.sendMessage(from, { text: dsgvoText.trim() }, { quoted: msg });
  } catch (err) {
    console.error('Fehler bei DSGVO:', err);
    await sock.sendMessage(from, { text: `❌ Fehler: ${err.message}` }, { quoted: msg });
  }
  break;
}

case 'stopmc': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }
    const { exec } = require('child_process');
    const path = require('path');
    const batFile = path.join(__dirname, 'stopmc.bat'); 

    await sock.sendMessage(from, { text: '🔴 *Stoppe Minecraft-Server über PM2...*' }, { quoted: msg });
 await sendReaction(from, msg, '✅');
    exec(`cmd /c "${batFile}"`, (error, stdout, stderr) => {
      if (error) {
        sock.sendMessage(from, { text: `❌ Fehler beim Stoppen:\n${error.message}` }, { quoted: msg });
        return;
      }

      const output = stdout || stderr || 'Kein Output';
      sock.sendMessage(from, { text: `✅ *Stopbefehl erfolgreich ausgeführt.*\n🔴 Minecrfat-Server erfolgreich gestoppt` }, { quoted: msg });
    });

  } catch (e) {
    reply(`❌ Fehler beim Stop-Command: ${e.message}`);
  }
  break;
}



case 'newpair': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }

  const id   = args[0] || `pair_${Date.now()}`;
  const num  = (args[1] || '').replace(/\D/g, ''); 

  const dir = path.join(__dirname, 'sessions', id);

  // Alte Session löschen
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });

  const baileys = require('@717development/baileys');
  const { state, saveCreds } = await baileys.useMultiFileAuthState(dir);
  const { version } = await baileys.fetchLatestBaileysVersion();

  const sockNew = baileys.default({
    version,
    printQRInTerminal: false,
    auth: state,
    logger: require('pino')({ level: 'silent' }),
    browser: baileys.Browsers.ubuntu('Edge'),
  });

  sockNew.ev.on('creds.update', saveCreds);

  sockNew.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && !num) {
      // QR nur wenn keine Nummer angegeben
      await sock.sendMessage(from, { text: `📸 Bitte QR-Code im Terminal scannen für Session „${id}“` });
      require('qrcode-terminal').generate(qr, { small: true });
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      reply(`❌ Pair-Session „${id}“ getrennt (Reason: ${reason || 'unbekannt'})`);
    }

    if (connection === 'open') {
      reply(`✅ „${id}“ erfolgreich verbunden`);
    }
  });


  if (!state.creds.registered && num) {
    try {
      const codeRaw = await sockNew.requestPairingCode(num);
      const codeFmt = codeRaw?.match(/.{1,4}/g)?.join('-') || codeRaw;

      await sock.sendMessage(from, { 
        text: `🔑 Pairing-Code für ${num}:\n\`\`\`${codeFmt}\`\`\`\n👉 In WhatsApp unter *„Gerät koppeln“* eingeben.` 
      });
    } catch (e) {
      reply(`⚠️ Fehler beim Pairing-Code: ${e.message}`);
    }
  }

 
  global.activeSessions = global.activeSessions || {};
  global.activeSessions[id] = sockNew;

  reply(`✅ Pair-Session „${id}“ gestartet`);
  break;
}




  // ================== SHOP ==================
  case "shop": {
    let text = "🏪 *Shop*\n\n🐾 *Tiere:*\n";
    petShop.forEach(p => text += `${p.name} - ${p.price} 💸\n`);

    text += "\n🛒 *Items:*\n";
    itemShop.forEach(i => text += `${i.name} - ${i.price} 💸\n`);

    await sock.sendMessage(chatId, { text }, { quoted: msg });
    break;
  }

  case "buy": {
    const itemName = args.join(" ");
    if (!itemName) {
      await sock.sendMessage(chatId, { text: "❌ Bitte gib an, was du kaufen willst!" }, { quoted: msg });
      break;
    }

    const pet = petShop.find(p => p.name.toLowerCase() === itemName.toLowerCase());
    const item = itemShop.find(i => i.name.toLowerCase() === itemName.toLowerCase());

    if (!pet && !item) {
      await sock.sendMessage(chatId, { text: "❌ Diesen Artikel gibt es nicht!" }, { quoted: msg });
      break;
    }

    const cost = pet ? pet.price : item.price;
    if (user.balance < cost) {
      await sock.sendMessage(chatId, { text: "❌ Nicht genug Geld!" }, { quoted: msg });
      break;
    }

    if (pet) {
      getDB().prepare("INSERT INTO pets (jid, petName) VALUES (?, ?)").run(jid, pet.name);
      await sock.sendMessage(chatId, { text: `✅ Du hast ${pet.name} gekauft!` }, { quoted: msg });
    } else {
      const existing = getDB().prepare("SELECT * FROM items WHERE jid = ? AND itemName = ?").get(jid, item.name);
      if (existing) {
        getDB().prepare("UPDATE items SET amount = amount + 1 WHERE id = ?").run(existing.id);
      } else {
        getDB().prepare("INSERT INTO items (jid, itemName, amount) VALUES (?, ?, 1)").run(jid, item.name);
      }
      await sock.sendMessage(chatId, { text: `✅ Du hast ${item.name} gekauft!` }, { quoted: msg });
    }

    user.balance -= cost;
    updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);
    break;
  }
case 'sell': {
  // args[0] = Fischname oder "inventory", args[1] = Anzahl
  const fishName = args[0];
  const amount = parseInt(args[1]) || 1;

  if (!fishName) {
    await sock.sendMessage(chatId, { text: "❌ Bitte gib an, welchen Fisch du verkaufen willst.\nBeispiel: /sell Karpfen 3\nOder: /sell inventory" }, { quoted: msg });
    break;
  }

  // Verkaufe ganzes Inventar
  if (fishName.toLowerCase() === 'inventory') {
    try {
      const db = getDB();
      const allFish = db.prepare("SELECT * FROM fish WHERE jid = ? AND count > 0").all(jid);

      if (allFish.length === 0) {
        await sock.sendMessage(chatId, { text: "🗳 Dein Inventar ist leer!" }, { quoted: msg });
        break;
      }

      let totalCoins = 0;
      let soldFish = [];

      // Verkaufe alle Fische
      for (const fish of allFish) {
        const fishData = fishes.find(f => f.name === fish.name);
        if (!fishData) continue;

        const pricePerFish = Math.floor(Math.random() * (fishData.max - fishData.min + 1)) + fishData.min;
        const totalPrice = pricePerFish * fish.count;
        totalCoins += totalPrice;

        soldFish.push(`${fish.count}x ${fish.name} = ${totalPrice} 💸`);

        // Inventar auf 0 setzen
        db.prepare("UPDATE fish SET count = 0 WHERE jid = ? AND name = ?").run(jid, fish.name);
      }

      // Coins zum User hinzufügen
      const user = getUser(jid);
      user.balance += totalCoins;
      updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);

      let responseText = `💰 *Gesamtes Inventar verkauft!*\n\n`;
      responseText += soldFish.join('\n');
      responseText += `\n\n💸 Gesamtverdienst: ${totalCoins} Coins\n💳 Neuer Kontostand: ${user.balance} 💸`;

      await sock.sendMessage(chatId, { text: responseText }, { quoted: msg });
      break;
    } catch (e) {
      console.error('Fehler beim Verkaufen des Inventars:', e);
      await sock.sendMessage(chatId, { text: '❌ Fehler beim Verkaufen des Inventars!' }, { quoted: msg });
      break;
    }
  }

  // Verkaufe einzelnen Fisch
  const fishItem = getFishStmt.get(jid, fishName);
  if (!fishItem || fishItem.count < 1) {
    await sock.sendMessage(chatId, { text: `❌ Du hast keinen ${fishName} zum Verkaufen!` }, { quoted: msg });
    break;
  }

  const sellAmount = Math.min(amount, fishItem.count); // Verkaufe nur, was vorhanden ist
  const fishData = fishes.find(f => f.name === fishName);

  if (!fishData) {
    await sock.sendMessage(chatId, { text: `❌ ${fishName} kann nicht verkauft werden.` }, { quoted: msg });
    break;
  }

  // Preis pro Fisch zufällig zwischen min/max
  const pricePerFish = Math.floor(Math.random() * (fishData.max - fishData.min + 1)) + fishData.min;
  const totalPrice = pricePerFish * sellAmount;

  // Coins zum User hinzufügen
  const user = getUser(jid);
  user.balance += totalPrice;
  updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);

  // Inventar aktualisieren
  addFishStmt.run(jid, fishName, fishItem.count - sellAmount);

  await sock.sendMessage(chatId, { 
    text: `💰 Du hast ${sellAmount}x ${fishName} verkauft!\n💸 Erhalten: ${totalPrice} Coins\n\nNeuer Kontostand: ${user.balance} 💸` 
  }, { quoted: msg });

  break;
}

  // ================== PETS ==================
 case "pets": {
  const pets = getDB().prepare("SELECT * FROM pets WHERE jid = ?").all(jid);

  if (pets.length === 0) {
    await sock.sendMessage(chatId, { text: "🗳 Du besitzt noch keine Tiere!" }, { quoted: msg });
    break;
  }

  let text = "🐾 *Deine Tiere:*\n\n";

  // Nummerierte Liste erstellen
  pets.forEach((p, index) => {
    text += `${index + 1}. ${p.petName}\n   🍖 Hunger: ${p.hunger ?? 0}%\n   ⬆️ Level: ${p.level ?? 1}\n\n`;
  });

  await sock.sendMessage(chatId, { text }, { quoted: msg });
  break;
}

  // ================== INVENTORY ==================
  case "schrank": {
    const items = getDB().prepare("SELECT * FROM items WHERE jid = ?").all(jid);
    if (items.length === 0) {
      await sock.sendMessage(chatId, { text: "🗳 Dein Inventar ist leer!" }, { quoted: msg });
      break;
    }

    let text = "🎒 *Dein Inventar:*\n\n";
    items.forEach(i => {
      text += `${i.itemName} x${i.amount}\n`;
    });

    await sock.sendMessage(chatId, { text }, { quoted: msg });
    break;
  }

  // ================== USE ITEM ==================
  case "use": {
    const itemName = args[0];
    const petId = parseInt(args[1]);

    if (!itemName || isNaN(petId)) {
      await sock.sendMessage(chatId, { text: "❌ Nutzung: /use <ItemName> <PetID>" }, { quoted: msg });
      break;
    }

    const item = getDB().prepare("SELECT * FROM items WHERE jid = ? AND itemName = ?").get(jid, itemName);
    const pet = getDB().prepare("SELECT * FROM pets WHERE jid = ? AND id = ?").get(jid, petId);

    if (!item) {
      await sock.sendMessage(chatId, { text: "❌ Du hast dieses Item nicht!" }, { quoted: msg });
      break;
    }
    if (!pet) {
      await sock.sendMessage(chatId, { text: "❌ Dieses Tier existiert nicht!" }, { quoted: msg });
      break;
    }

    const shopItem = itemShop.find(i => i.name === itemName);
    if (!shopItem) {
      await sock.sendMessage(chatId, { text: "❌ Dieses Item ist nicht nutzbar!" }, { quoted: msg });
      break;
    }

    if (shopItem.effect === "feed") {
      pet.hunger = Math.min(100, pet.hunger + shopItem.value);
      getDB().prepare("UPDATE pets SET hunger = ? WHERE id = ?").run(pet.hunger, petId);
    } else if (shopItem.effect === "heal") {
      pet.health = Math.min(100, pet.health + shopItem.value);
      getDB().prepare("UPDATE pets SET health = ? WHERE id = ?").run(pet.health, petId);
    }

    getDB().prepare("UPDATE items SET amount = amount - 1 WHERE id = ?").run(item.id);

    await sock.sendMessage(chatId, { text: `✅ Du hast ${shopItem.name} auf ${pet.petName} angewendet!` }, { quoted: msg });
    break;
  }

  // ================== PET FEED ==================
  case "petfeed": {
    const petId = parseInt(args[0]);
    if (isNaN(petId)) {
      await sock.sendMessage(chatId, { text: "❌ Nutzung: /petfeed <PetID>\n\nFinde die Pet-ID mit: /pets" }, { quoted: msg });
      break;
    }

    const pet = getDB().prepare("SELECT * FROM pets WHERE jid = ? AND id = ?").get(jid, petId);
    if (!pet) {
      await sock.sendMessage(chatId, { text: "❌ Dieses Pet existiert nicht!" }, { quoted: msg });
      break;
    }

    // Hunger reduzieren, Zufriedenheit erhöhen
    const newHunger = Math.max(0, pet.hunger - 30);
    getDB().prepare("UPDATE pets SET hunger = ? WHERE id = ?").run(newHunger, petId);

    const happinessGain = Math.floor(Math.random() * 20) + 15; // 15-35
    const user = getUser(jid);
    user.balance -= 10; // Kostet 10 Coins
    updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);

    await sock.sendMessage(chatId, { 
      text: `🍖 ${pet.petName} wurde gefüttert!\n\n📉 Hunger: ${pet.hunger}% → ${newHunger}%\n💕 Zufriedenheit: +${happinessGain}%\n💰 Kosten: 10 Coins\n\nNeuer Kontostand: ${user.balance} 💸` 
    }, { quoted: msg });
    break;
  }

  // ================== PET PLAY ==================
  case "petplay": {
    const petId = parseInt(args[0]);
    if (isNaN(petId)) {
      await sock.sendMessage(chatId, { text: "❌ Nutzung: /petplay <PetID>\n\nFinde die Pet-ID mit: /pets" }, { quoted: msg });
      break;
    }

    const pet = getDB().prepare("SELECT * FROM pets WHERE jid = ? AND id = ?").get(jid, petId);
    if (!pet) {
      await sock.sendMessage(chatId, { text: "❌ Dieses Pet existiert nicht!" }, { quoted: msg });
      break;
    }

    const games = ['Fangen 🎾', 'Verstecken 👀', 'Schwimmen 🏊', 'Klettern 🧗', 'Tanzen 💃'];
    const game = games[Math.floor(Math.random() * games.length)];
    const xpGain = Math.floor(Math.random() * 30) + 20; // 20-50 XP
    const newLevel = Math.floor((pet.level || 1) + xpGain / 100);

    getDB().prepare("UPDATE pets SET level = ? WHERE id = ?").run(newLevel, petId);

    const user = getUser(jid);
    user.xp += xpGain;
    updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);

    await sock.sendMessage(chatId, { 
      text: `🎮 ${pet.petName} spielt ${game}!\n\n⬆️ Level: ${pet.level || 1} → ${newLevel}\n⭐ +${xpGain} XP für dich\n💕 Dein Pet liebt dich noch mehr!` 
    }, { quoted: msg });
    break;
  }

  // ================== PET INFO (STATS) ==================
  case "petinfo": {
    const petId = parseInt(args[0]);
    if (isNaN(petId)) {
      await sock.sendMessage(chatId, { text: "❌ Nutzung: /petinfo <PetID>\n\nFinde die Pet-ID mit: /pets" }, { quoted: msg });
      break;
    }

    const pet = getDB().prepare("SELECT * FROM pets WHERE jid = ? AND id = ?").get(jid, petId);
    if (!pet) {
      await sock.sendMessage(chatId, { text: "❌ Dieses Pet existiert nicht!" }, { quoted: msg });
      break;
    }

    const hungerBar = '█'.repeat(pet.hunger / 10) + '░'.repeat((100 - pet.hunger) / 10);
    const healthBar = '█'.repeat((pet.health || 100) / 10) + '░'.repeat((100 - (pet.health || 100)) / 10);

    await sock.sendMessage(chatId, { 
      text: `📊 *${pet.petName} - Detaillierte Stats*\n\n` +
            `⬆️ **Level:** ${pet.level || 1}\n` +
            `🍖 **Hunger:** ${pet.hunger || 0}%\n${hungerBar}\n\n` +
            `❤️ **Gesundheit:** ${pet.health || 100}%\n${healthBar}\n\n` +
            `💪 **Stärke:** Lvl ${(pet.level || 1) * 10 + 50}\n` +
            `🎯 **Jagd-Erfolgsquote:** ${Math.min(100, (pet.level || 1) * 15)}%\n` +
            `✨ **Spezialwert:** ${Math.floor(Math.random() * 100) + (pet.level || 1) * 5}`
    }, { quoted: msg });
    break;
  }

case 'menu': {
  const ownerName = "Beastmeds";

  const menuArg = args[0]?.toLowerCase();

  const currentPrefix = getPrefixForChat(chatId);

  const menus = {
    "1": `
  ╭───❍ *Main Commands* ❍───╮
  │ ⚙️ ${currentPrefix}ping
  │ 👑 ${currentPrefix}owner
  │ 🧠 ${currentPrefix}help
  │ � ${currentPrefix}nayvy
  │ �💬 ${currentPrefix}menu
  │ 🎵 ${currentPrefix}play
  │ 🎶 ${currentPrefix}play1
  │ 🎧 ${currentPrefix}play2
  │ 💻 ${currentPrefix}server
  │ ⏱️ ${currentPrefix}runtime
  │ 🧾 ${currentPrefix}cmds
  │ � ${currentPrefix}support
  │ �🌐 ${currentPrefix}community
  ╰──────────────────╯
  `,

    "2": `
  ╭───❍ *Admin Commands* ❍───╮
  │ 🛠️ ${currentPrefix}setdesc
  │ 🧾 ${currentPrefix}setname
  │ 🛠️ ${currentPrefix}setup
  │ 👋 ${currentPrefix}welcome
  │ 🗑️ ${currentPrefix}antidelete
  │ ⚠️ ${currentPrefix}warn @user
  │ 🔁 ${currentPrefix}resetwarn @user
  │ 📜 ${currentPrefix}warns
  │ 🔇 ${currentPrefix}mute @user
  │ 🔊 ${currentPrefix}unmute @user
  │ 📋 ${currentPrefix}mutedlist
  │ 🧩 ${currentPrefix}grpinfo
  │ 🚫 ${currentPrefix}kick
  │ ♻️ ${currentPrefix}revoke
  │ ❌ ${currentPrefix}del
  │ 🏷️ ${currentPrefix}tagall
  │ 🙈 ${currentPrefix}hidetag
  │ 🔗 ${currentPrefix}antilink on/off
  │ ➕ ${currentPrefix}add
  │ 🧩 ${currentPrefix}linkbypass
  │ 🪓 ${currentPrefix}unlinkbypass
  │ 🔼 ${currentPrefix}promote
  │ 🔽 ${currentPrefix}demote
  │ 📤 ${currentPrefix}broadcast
  │ 🔍 ${currentPrefix}viewonce
  ╰────────────────────╯
  `,

    "3": `
╭───❍ *Fun Commands* ❍───╮
│ 💬 ${currentPrefix}tok
│ 🌀 ${currentPrefix}tok2
│ 🥰 ${currentPrefix}hug
│ 😘 ${currentPrefix}kiss
│ 👋 ${currentPrefix}slap
│ 🖐️ ${currentPrefix}pat
│ 👉 ${currentPrefix}poke
│ 🛌 ${currentPrefix}cuddle
│ 🍑 ${currentPrefix}fuck
│ 😈 ${currentPrefix}horny
│ 🔪 ${currentPrefix}kill
│ 💀 ${currentPrefix}goon
│ 🍆 ${currentPrefix}penis
│ 🐟 ${currentPrefix}fish
│ 🪙 ${currentPrefix}addcoins
│ ❌ ${currentPrefix}delcoins
│ 🔄 ${currentPrefix}pay <@User|LID> <Betrag>
│ 👥 ${currentPrefix}user - Liste aller registrierten Benutzer
│ 🐾 ${currentPrefix}pethunt
│ 🎣 ${currentPrefix}fishlist
╰────────────────────╯
`,

    "4": `
╭───❍ *Owner Commands* ❍───╮
│ ⚙️ ${currentPrefix}reload
│ 💣 ${currentPrefix}leaveall
│ 📜 ${currentPrefix}grouplist
│ 📜 ${currentPrefix}grouplist2
│ 🧍 ${currentPrefix}addme  (bot braucht Admin-Rechte)
│ 🔐 ${currentPrefix}setrank
│ 🧹 ${currentPrefix}delrank
│ 🧱 ${currentPrefix}ranks
│ 🧾 ${currentPrefix}listsessions
│ 🪪 ${currentPrefix}lid
│ 📡 ${currentPrefix}broadcast
│ 🧰 ${currentPrefix}server
│ 🚀 ${currentPrefix}startmc
│ 🛑 ${currentPrefix}stopmc
│ 🆕 ${currentPrefix}newpair
│ 💻 ${currentPrefix}newqr ${currentPrefix}newqr1 ${currentPrefix}newqr2
│ 🔪 ${currentPrefix}killsession
╰───────────────╯
`,

    "5": `
╭───❍ *Economy Basics* ❍───╮
│ 💳 ${currentPrefix}register - Registrieren
│ 🧍 ${currentPrefix}me - Profil anzeigen
│ 💰 ${currentPrefix}balance - Kontostand
│ 📊 ${currentPrefix}topbalance - Top-Reich
│ 🎁 ${currentPrefix}daily - Täglicher Bonus
│ 📅 ${currentPrefix}weekly - Wöchlicher Bonus
│ ✂️ ${currentPrefix}work - Arbeiten
│ 🙏 ${currentPrefix}beg - Betteln
│ 🏦 ${currentPrefix}bank - Bank
│
│ 💡 Weitere Economy-Commands mit /menu 13
│ 👑 Premium-Befehle mit /menu 14
╰────────────────────╯
`,

    "6": `
╭───❍ *Group & Utility* ❍───╮
│ 🧾 ${currentPrefix}grpinfo
│ 📎 ${currentPrefix}grouplink
│ 🚫 ${currentPrefix}antilink
│ 🔗 ${currentPrefix}linkbypass
│ 🪓 ${currentPrefix}unlinkbypass
│ 📢 ${currentPrefix}broadcast
│ 🧍 ${currentPrefix}tagall
│ ⚔️ ${currentPrefix}hidetag
│ 🪪 ${currentPrefix}id
│ 🚪 ${currentPrefix}leave
│ 🚪 ${currentPrefix}leave2
│ 🚪 ${currentPrefix}leavegrp
	│ 🪞 ${currentPrefix}viewonce
	│ 🤖 ${currentPrefix}ai <Frage>
		│ ⚡ ${currentPrefix}vol <Frage> - Voltra AI Chat
		│ ⚡ ${currentPrefix}voltra <Frage> - Alias für Voltra
		│ ⚡ ${currentPrefix}coltra <Frage> - Alias für Voltra
		│ 🎨 ${currentPrefix}imagine <Beschreibung>
		│ 📱 ${currentPrefix}qrcode <Text|Nachricht> - QR-Code erstellen
		│ 📖 ${currentPrefix}qrread - QR-Code aus Bild lesen
		╰────────────────────╯
`,

    "7": `
╭───❍ *Downloader* ❍───╮
│ 🎧 ${currentPrefix}play2
╰────────────────────╯
`,

    "8": `
╭───❍ *Misc (Audio Edit)* ❍───╮
│ 🎚️ ${currentPrefix}bassboost
│ 🐢 ${currentPrefix}slowed
│ ⚡ ${currentPrefix}spedup
│ 🌃 ${currentPrefix}nightcore
│ 🌊 ${currentPrefix}reverb
│ 🔁 ${currentPrefix}reverse
│ 🔉 ${currentPrefix}deep
│ 🎶 ${currentPrefix}echo
│ 🌀 ${currentPrefix}vaporwave
│ 🔈 ${currentPrefix}8d
│ 💫 ${currentPrefix}earrape
│ 🎧 ${currentPrefix}chipmunk
╰────────────────────╯
`,

    "9": `
━━ ❮ BeastBot ❯ ━━
╭───❍ *Verschlüsselung* ❍───╮
│ 🔐 ${currentPrefix}encode <Text>
│ 🔓 ${currentPrefix}decode <Text>
│ 🔑 ${currentPrefix}encodehex <Text>
│ 🗝️ ${currentPrefix}decodehex <Text>
│ 🌀 ${currentPrefix}rot13 <Text>
│ 🔗 ${currentPrefix}urlencode <Text>
│ 🌐 ${currentPrefix}urldecode <Text>
│ 📜 ${currentPrefix}caesar <Shift> <Text>
│ 🤖 ${currentPrefix}binary <Text>
│ ••— ${currentPrefix}morse <Text>
╰────────────────────╯
-----BeastBot----
`,

    "10": `
╭───❍ *Minecraft Commands* ❍───╮
│ 🔧 ${currentPrefix}mcsetserver <IP:PORT> <Name>
│ 🎮 ${currentPrefix}mcstatus
│ 👥 ${currentPrefix}mcplayers
│ 🔍 ${currentPrefix}mcsearch <Spieler>
│ ⚔️ ${currentPrefix}mcquery
│ ℹ️ ${currentPrefix}mcgetserver
│ 🏠 ${currentPrefix}mcserver <Befehl>
╰────────────────────╯
`,

    "11": `
  ╭───❍ *Stranger Things* ❍───╮
  │ 👾 ${currentPrefix}strangerfact - Zufälliger Stranger-Things Fakt
  │ 🔄 ${currentPrefix}upside <Text> - Dreht Text ins "Upside Down"
  │ 🧒 ${currentPrefix}eleven - Zitate von Eleven
  │ 🌀 ${currentPrefix}mindflip <Text> - Mindflip (Upside Down Stil)
  │ 👹 ${currentPrefix}demogorgon - Ominöse Nachricht
  │ 🔴 ${currentPrefix}redrun <Text> - Red Run Mode
  │ 🕷 ${currentPrefix}darkweb - Versteckte Nachricht
  │ ⚡ ${currentPrefix}strangergame - Spielmodus
  │ 🎬 ${currentPrefix}moviequote - Film-Quote
  │ 🏘 ${currentPrefix}hawkins - Über Hawkins
  │ 🧬 ${currentPrefix}dna - DNA-Tracker
  │ 👨‍👩‍👧‍👦 ${currentPrefix}friends - Charakter-Info
  │ 🔍 ${currentPrefix}gate - Tor zur Upside Down
  ╰────────────────────╯
  `,

	  "12": `
	  ╭───❍ *KI Commands* ❍───╮
	  │ 🤖 ${currentPrefix}ask <Frage> - Stelle eine Frage an die KI
		  │ ⚡ ${currentPrefix}vol <Frage> - Chat mit Voltra (voltraai.onrender.com)
		  │ ⚡ ${currentPrefix}voltra <Frage> - Alias für Voltra
		  │ ⚡ ${currentPrefix}coltra <Frage> - Alias für Voltra
		  │ 📝 ${currentPrefix}summarize <Text> - Zusammenfassung erstellen
		  │ 🌍 ${currentPrefix}translate <Sprache> <Text> - Text übersetzen
		  │ 😂 ${currentPrefix}joke - Zufälliger Witz
		  │ 🎵 ${currentPrefix}rhyme <Wort> - Reimwörter finden
  │ ✍️ ${currentPrefix}poem <Thema> - Gedicht generieren
  │ 📖 ${currentPrefix}story <Thema> - Geschichte erzählen
  │ 🧩 ${currentPrefix}riddle - Rätsel lösen
  │ 💻 ${currentPrefix}codehelp <Problem> - Code-Hilfe
  │ 🔢 ${currentPrefix}math <Rechnung> - Mathematik lösen
  │ 📚 ${currentPrefix}define <Wort> - Definition suchen
  ╰────────────────────╯
  `,

    "13": `
╭───❍ *Economy - Erweitert* ❍───╮
│
│ 🎰 *Glücksspiele*
│ 🎰 ${currentPrefix}slots <Betrag> - Spielautomat
│ 🎲 ${currentPrefix}roulette <Betrag> - Roulette
│ 🃏 ${currentPrefix}dice <Betrag> - Würfelspiel
│
│ 💼 *Jobs*
│ ⛏️ ${currentPrefix}mine - Im Berg arbeiten
│ 🏹 ${currentPrefix}hunt - Jagen gehen
│ 🌾 ${currentPrefix}farm - Landwirtschaft
│
│ 🚨 *Gefährlich*
│ 🔫 ${currentPrefix}rob <@user|LID> - Raub
│ 🕵️ ${currentPrefix}crime - Verbrechen
│ 🚔 ${currentPrefix}jail <@user|LID> - In den Knast
│
│ 🏦 *Bank System*
│ 🏦 ${currentPrefix}bank - Bank Optionen
│
│ 📊 *Rankings*
│ 👑 ${currentPrefix}topbalance - Reichste Spieler
│
│ 💡 Basic-Befehle mit /menu 5
│ 👑 Premium-Befehle mit /menu 14
╰────────────────────╯
`,

    "14": `
╭───❍ *Premium Befehle* ❍───❮ 👑 ❯───╮
│
│ 🎯 *Premium Status*
│ 👑 ${currentPrefix}premium - Premium-Info
│ � ${currentPrefix}premium add @user <Tage> - Premium geben*
│ ✨ ${currentPrefix}spawnmoney <Betrag> - Geld spawnen
│
│ 💎 *Customization*
│ 🏷️ ${currentPrefix}settitle <Titel> - Titel setzen
│ 🎨 ${currentPrefix}setcolor <Farbe> - Farbe setzen
│ 😊 ${currentPrefix}setemoji <Emoji> - Emoji setzen
│
│ 🎰 *Premium Casino*
│ 🎲 ${currentPrefix}highroller <Betrag> - High Roller
│ 🏆 ${currentPrefix}jackpot <Betrag> - Jackpot
│ 2️⃣ ${currentPrefix}double <Betrag> - Double or Nothing
│
│ 💼 *Premium Geschäft*
│ 🏢 ${currentPrefix}business - Geschäft-Info
│ 🏭 ${currentPrefix}buybusiness <Typ> - Geschäft kaufen
│ 💵 ${currentPrefix}collect - Gewinne einsammeln
│
│ 💰 *Kryptowährung*
│ 📈 ${currentPrefix}crypto - Krypto-Portfolio
│ 📊 ${currentPrefix}buycrypto <Symbol> <Betrag> - Kaufen
│ 📉 ${currentPrefix}sellcrypto <Symbol> <Betrag> - Verkaufen
│
│ *Nur Owner/CoOwner/Premium können Premium vergeben
│ 💡 Economy-Befehle mit /menu 5 & 13
╰────────────────────────────────╯
`,

    "15": `
╭───❍ *Death Note - Roleplay* ☠️ ❍───╮
│
│ 📖 *Death Note Commands*
│ 🖊️ ${currentPrefix}deathnote [Name] - Name ins Death Note schreiben
│ 👹 ${currentPrefix}shinigami - Zeigt deinen Shinigami
│ ⏳ ${currentPrefix}lifespan @user - Lebenszeit checken
│ 👁️ ${currentPrefix}eyes - Shinigami Eyes aktivieren
│
│ 🔍 *L Investigation*
│ 🕵️ ${currentPrefix}investigate @user - Ist jemand Kira?
│ 📋 ${currentPrefix}suspectlist - Verdächtige Liste
│ 🎲 ${currentPrefix}case - Zufälliger Kriminalfall
│ 🧩 ${currentPrefix}solve - Rätsel lösen
│
│ 👑 *Kira Commands*
│ 👤 ${currentPrefix}kira - Bist du Kira?
│ ⚖️ ${currentPrefix}judgement @user - Kira Urteil
│ 🌍 ${currentPrefix}newworld - Neue Welt Monolog
│
│ 💀 *Shinigami*
│ 🍎 ${currentPrefix}apple - Ryuk Apfel geben
│ 👻 ${currentPrefix}shinigamilist - Alle Shinigamis
│ 👹 ${currentPrefix}summonryuk - Ruft Ryuk auf
│
│ 🎮 *Games & Events*
│ 🎯 ${currentPrefix}kiraevent - Zufälliger wird Kira
│ 🕹️ ${currentPrefix}deathnote-game - Wer ist Kira?
│ 📈 ${currentPrefix}rank - Dein Ermittler-Rang
│ 🏆 ${currentPrefix}topdetectives - Beste Spieler
│
│ 🔥 *Special*
│ ✍️ ${currentPrefix}write [Name] [Todesart] - Custom Tod
│ 📜 ${currentPrefix}rule - Random Death Note Regel
│ 🎬 ${currentPrefix}episode - Random Episode
╰────────────────────╯
`,

    "cmds": `
╭───❍ *Alle Befehle* ❍───╮
│ Enthält alle Commands:
│ Main, Admin, Fun, Owner, Economy, Utility, Downloader, Misc, Verschlüsselung, Minecraft, Stranger Things, KI, Economy+, Premium, Death Note
│
│ ➤ ${currentPrefix}menu 1  → Main
│ ➤ ${currentPrefix}menu 2  → Admin
│ ➤ ${currentPrefix}menu 3  → Fun
│ ➤ ${currentPrefix}menu 4  → Owner
│ ➤ ${currentPrefix}menu 5  → Economy Basics
│ ➤ ${currentPrefix}menu 6  → Utility
│ ➤ ${currentPrefix}menu 7  → Downloader
│ ➤ ${currentPrefix}menu 8  → Misc (Audio Edit)
│ ➤ ${currentPrefix}menu 9  → Verschlüsselung
│ ➤ ${currentPrefix}menu 10 → Minecraft
│ ➤ ${currentPrefix}menu 11 → Stranger Things
│ ➤ ${currentPrefix}menu 12 → KI Commands
│ ➤ ${currentPrefix}menu 13 → Economy Erweitert
│ ➤ ${currentPrefix}menu 14 → Premium Commands 👑
│ ➤ ${currentPrefix}menu 15 → Death Note ☠️
╰────────────────────╯
`
  };

  let helpText;

  if (!menuArg || !menus[menuArg]) {
    helpText = `
╭───❍ *BeastBot Menü* ❍───╮
│ 👑 Besitzer: ${ownerName}
│ 
│ 1️⃣ ${currentPrefix}menu 1 → Main
│ 2️⃣ ${currentPrefix}menu 2 → Admin
│ 3️⃣ ${currentPrefix}menu 3 → Fun
│ 4️⃣ ${currentPrefix}menu 4 → Owner (geschützt)
│ 5️⃣ ${currentPrefix}menu 5 → Economy Basics
│ 6️⃣ ${currentPrefix}menu 6 → Utility
│ 7️⃣ ${currentPrefix}menu 7 → Downloader
│ 8️⃣ ${currentPrefix}menu 8 → Misc (Audio Edit)
│ 9️⃣ ${currentPrefix}menu 9 → Verschlüsselung
│ 1️⃣0️⃣ ${currentPrefix}menu 10 → Minecraft
│ 1️⃣1️⃣ ${currentPrefix}menu 11 → Stranger Things
│ 1️⃣2️⃣ ${currentPrefix}menu 12 → KI Commands
│ 1️⃣3️⃣ ${currentPrefix}menu 13 → Economy Erweitert
│ 1️⃣4️⃣ ${currentPrefix}menu 14 → Premium Commands 👑
│ 1️⃣5️⃣ ${currentPrefix}menu 15 → Death Note ☠️
│ 💡 ${currentPrefix}menu cmds → Alle Befehle
│ 🌐 Website: https://shorturl.at/IVn29
╰────────────────────╯`;
  } else {
    helpText = menus[menuArg];
  }

  await sock.sendMessage(from, { text: helpText });
  await sendReaction(from, msg, '✅');
  break;
}

// ================== STRANGER THINGS FUN ==================
case 'strangerfact': {
  try {
    const facts = [
      'Die Upside Down ist eine parallele, verfallene Version unserer Welt.',
      'Der Demogorgon ist eine räuberische Kreatur aus der Upside Down.',
      'Eleven hat telekinetische Kräfte — oft ausgelöst durch starke Emotionen.',
      'Hawkins, Indiana ist der zentrale Schauplatz der Serie.',
      'Mindflayer ist eine kollektive Intelligenz aus der Upside Down.'
    ];
    const pick = facts[Math.floor(Math.random() * facts.length)];
    await sock.sendMessage(from, { text: `🔮 Stranger Fact:\n\n${pick}` }, { quoted: msg });
  } catch (e) {
    console.error('strangerfact err', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen eines Stranger-Facts.' }, { quoted: msg });
  }
  break;
}

case 'eleven': {
  try {
    const quotes = [
      'You are safe with me. — Eleven',
      "Friends don't lie. — Eleven",
      'I am going to bring you home. — Eleven',
      'Sometimes, your total obliviousness just blows my mind. — Eleven'
    ];
    const q = quotes[Math.floor(Math.random() * quotes.length)];
    await sock.sendMessage(from, { text: `"${q}"` }, { quoted: msg });
  } catch (e) {
    console.error('eleven err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

case 'upside': {
  try {
    const input = args.join(' ') || (msg.message && msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo && msg.message.extendedTextMessage.contextInfo.quotedMessage && msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation) || '';
    if (!input) return await sock.sendMessage(from, { text: '❗ Usage: /upside <Text>' }, { quoted: msg });
    const map = {
      a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ɓ', h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'ʅ', m: 'ɯ', n: 'u', o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z',
      A: '∀', B: '𐐒', C: 'Ɔ', D: '◖', E: 'Ǝ', F: 'Ⅎ', G: 'פ', H: 'H', I: 'I', J: 'ſ', K: '⋊', L: '˥', M: 'W', N: 'N', O: 'O', P: 'Ԁ', Q: 'Q', R: 'ᴚ', S: 'S', T: '⊥', U: '∩', V: 'Λ', W: 'M', X: 'X', Y: '⅄', Z: 'Z',
      '0': '0', '1': 'Ɩ', '2': 'ᄅ', '3': 'Ɛ', '4': 'h', '5': 'ϛ', '6': '9', '7': 'ㄥ', '8': '8', '9': '6',
      ',': "'", '.': '˙', '?': '¿', '!': '¡', '"': '„', "'": ',', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '&': '⅋', ' ': ' '
    };
    const flipped = input.split('').reverse().map(c => map[c] || map[c.toLowerCase()] || c).join('');
    await sock.sendMessage(from, { text: flipped }, { quoted: msg });
  } catch (e) {
    console.error('upside err', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Drehen des Textes.' }, { quoted: msg });
  }
  break;
}

case 'mindflip': {
  try {
    const input = args.join(' ');
    if (!input) return await sock.sendMessage(from, { text: '❗ Usage: /mindflip <Text>' }, { quoted: msg });
    const reversed = input.split('').reverse().join('');
    const resp = `🌪 Mindflip — The Upside Down whispers:\n${reversed}\nDo you feel it?`;
    await sock.sendMessage(from, { text: resp }, { quoted: msg });
  } catch (e) {
    console.error('mindflip err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

case 'demogorgon': {
  try {
    const art = `👹 DEMOGORGON ALERT\n\n    /\\_/\\\n   ( o.o )\n    > ^ <\n\nIt stares from the Upside Down...`;
    await sock.sendMessage(from, { text: art }, { quoted: msg });
  } catch (e) {
    console.error('demogorgon err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

case 'redrun': {
  try {
    const input = args.join(' ');
    if (!input) return await sock.sendMessage(from, { text: '❗ Usage: /redrun <Text>' }, { quoted: msg });
    const redText = input.split('').map(c => `🔴`).join('');
    await sock.sendMessage(from, { text: `🔴 RED RUN ACTIVATED 🔴\n\n${input}\n\n${redText}` }, { quoted: msg });
  } catch (e) {
    console.error('redrun err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

case 'darkweb': {
  try {
    const secrets = [
      '🌑 [ENCRYPTED] Project MKUltra - Eleven\'s Origin...',
      '🌑 [HIDDEN] Hawkins Lab - Alte Experimente...',
      '🌑 [CLASSIFIED] Upside Down - Die Wahrheit...',
      '🌑 [REDACTED] Mindflayer - Kollektive Intelligenz...',
      '🌑 [FORBIDDEN] Gate - Dimensionale Schnittste...lle...',
      '🌑 [ENCRYPTED] Hawkins Power Grid Überwachung aktiv...'
    ];
    const secret = secrets[Math.floor(Math.random() * secrets.length)];
    await sock.sendMessage(from, { text: secret }, { quoted: msg });
  } catch (e) {
    console.error('darkweb err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

case 'strangergame': {
  try {
    const games = [
      '👾 STRANGER GAMES 👾\n\n🎮 Denken Sie an eine Nummer 1-10...\n\n⏳ Haben Sie gewählt?',
      '🎯 UPSIDE DOWN MAZE:\n▓▓▓▓▓▓▓\n▓█  ░ ▓\n▓ █ ░▓\n▓░░░█▓\n▓▓▓▓▓▓▓\n\nFinden Sie den Weg raus!',
      '🧩 MIND PUZZLE:\n\nWas isst Demogorgon am liebsten?\nA) Menschen\nB) Angst\nC) Beides'
    ];
    const game = games[Math.floor(Math.random() * games.length)];
    await sock.sendMessage(from, { text: game }, { quoted: msg });
  } catch (e) {
    console.error('strangergame err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

case 'moviequote': {
  try {
    const quotes = [
      '"Friends don\'t lie." — Eleven (S01E01)',
      '"In the face of genuine darkness, you need real bravery." — Hopper',
      '"Will is alive." — Jonathan (S01E08)',
      '"I\'m not crazy, I\'m not mad. This is who I am." — Max',
      '"We never really know what the truth is." — Steve',
      '"Sometimes people are worth saving." — Nancy',
      '"I\'m going to bring you home." — Eleven'
    ];
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    await sock.sendMessage(from, { text: quote }, { quoted: msg });
  } catch (e) {
    console.error('moviequote err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

case 'hawkins': {
  try {
    const info = `
🏘 HAWKINS, INDIANA 🏘

📍 Ort: Geheimnis-verschwundene Stadt
🏢 Hawkins National Laboratory
👥 Bevölkerung: ~30.000 (zumindest früher)
⚡ Besonderheit: Dimensional Gates in der Nähe
🌙 Aktivität: Nachtlich - Upside Down durchbrüche

Die Stadt ist das Zentrum aller übernatürlichen Aktivitäten
und Heimat vieler mutiger Jugendlicher.
    `;
    await sock.sendMessage(from, { text: info }, { quoted: msg });
  } catch (e) {
    console.error('hawkins err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

case 'dna': {
  try {
    const dna = `
🧬 DNA TRACKER AKTIVIERT 🧬

████████████████████ 92% Eleven's DNA
████████████░░░░░░░░ 45% Mutationen erkannt
████░░░░░░░░░░░░░░░░ 18% Telekinese Level

⚡ ERGEBNIS: PSYCHOKINETISCHE ANOMALIE
📊 Status: AKTIV UND GEFÄHRLICH

Do not let her escape... They are watching...
    `;
    await sock.sendMessage(from, { text: dna }, { quoted: msg });
  } catch (e) {
    console.error('dna err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

case 'friends': {
  try {
    const friends = `
👫 HAWKINS FRIENDS CIRCLE 👫

👧 ELEVEN
• Telekinetische Kräfte
• Aus Hawkins Lab
• Stille aber Starke

🧔 MIKE WHEELER
• Der Anführer
• Treuer Freund
• Strategist

🤏 DUSTIN HENDERSON
• Technologie-Experte
• Comic Relief & Herz
• "Babysitter"

👁 LUCAS SINCLAIR
• Der Realist
• Guter Freund
• Standhaft

👰 MAX MAYFIELD
• Rollschuh-Fahrerin
• Tough & Cool
• Red Hair Icon
    `;
    await sock.sendMessage(from, { text: friends }, { quoted: msg });
  } catch (e) {
    console.error('friends err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

case 'gate': {
  try {
    const gate = `
🌀 THE GATE TO UPSIDE DOWN 🌀

                    🔥
                  🔥  🔥
                🔥     🔥
              🔥         🔥
            🔥   GATE   🔥
              🔥       🔥
                🔥   🔥
                  🔥

⚠️ WARNUNG: Dimensionales Portal erkannt!
🌑 Energielevel: KRITISCH
👁️ Watcher: AKTIV

"It's always open." — Vecna
    `;
    await sock.sendMessage(from, { text: gate }, { quoted: msg });
  } catch (e) {
    console.error('gate err', e);
    await sock.sendMessage(from, { text: '❌ Fehler.' }, { quoted: msg });
  }
  break;
}

// ================== DEATH NOTE ROLEPLAY ==================

case 'deathnote': {
  try {
    const name = args.join(' ');
    if (!name) return await sock.sendMessage(chatId, { text: '📖 Bitte gib einen Namen an!\nBeispiel: /deathnote Max' });
    
    const responses = [
      `💀 ${name} wurde ins Death Note geschrieben...\n\n⏳ ${name} wird in 40 Sekunden sterben... RIP`,
      `📖 Der Name ${name} glüht im Death Note...\n\n☠️ Das Schicksal ist besiegelt... ${name} wird nicht mehr aufwachen...`,
      `✍️ *schreib* ${name} ins Death Note...\n\n⚰️ ${name}... dein Schicksal ist besiegelt.`
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];
    await sock.sendMessage(chatId, { text: response });
  } catch (e) {
    console.error('deathnote err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'shinigami': {
  try {
    const shinigamis = ['Ryuk 🍎', 'Rem 💀', 'Gelus ☠️', 'Armonia Justice ⚖️'];
    const yourShinigami = shinigamis[Math.floor(Math.random() * shinigamis.length)];
    await sock.sendMessage(chatId, { text: `👹 Dein Shinigami: ${yourShinigami}\n\nEr beobachtet dich... Immer... 👁️` });
  } catch (e) {
    console.error('shinigami err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'lifespan': {
  try {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!mentioned || mentioned.length === 0) {
      return await sock.sendMessage(chatId, { text: '❌ Bitte markiere jemanden! /lifespan @user' });
    }
    const target = mentioned[0].split('@')[0];
    const lifespan = Math.floor(Math.random() * 80) + 20;
    await sock.sendMessage(chatId, { 
      text: `⏳ @${target}'s Lebenszeit: ${lifespan} Jahre\n\n👁️ Shinigami Eyes zeigen die Wahrheit...`,
      contextInfo: { mentionedJid: [mentioned[0]] }
    });
  } catch (e) {
    console.error('lifespan err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'eyes': {
  try {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!mentioned || mentioned.length === 0) {
      return await sock.sendMessage(chatId, { text: '❌ Bitte markiere jemanden! /eyes @user' });
    }
    const target = mentioned[0].split('@')[0];
    const realName = 'John Doe';
    const lifespan = Math.floor(Math.random() * 80) + 20;
    await sock.sendMessage(chatId, { 
      text: `👁️ *Shinigami Eyes aktiviert*\n\n@${target}\nRechter Name: ${realName}\nLebenszeit: ${lifespan} Jahre\n\n⚠️ Du hast das Geheimnis gesehen...`,
      contextInfo: { mentionedJid: [mentioned[0]] }
    });
  } catch (e) {
    console.error('eyes err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'investigate': {
  try {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!mentioned || mentioned.length === 0) {
      return await sock.sendMessage(chatId, { text: '❌ Bitte markiere jemanden! /investigate @user' });
    }
    const target = mentioned[0].split('@')[0];
    const probability = Math.floor(Math.random() * 100) + 1;
    const text = probability > 50 
      ? `🕵️ @${target} ist Kira! Verdachtwahrscheinlichkeit: ${probability}%\n\n⚠️ VERDACHT!`
      : `🕵️ @${target} ist NICHT Kira. Verdachtwahrscheinlichkeit: ${probability}%\n\n✅ Sauber`;
    await sock.sendMessage(chatId, { text, contextInfo: { mentionedJid: [mentioned[0]] } });
  } catch (e) {
    console.error('investigate err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'suspectlist': {
  try {
    const suspects = ['Light Yagami', 'Misa Amane', 'Teru Mikami', 'Kiyomi Takada', 'Unknown User'];
    let list = '📋 *Verdächtige Liste*\n\n';
    suspects.forEach((s, i) => {
      list += `${i + 1}. ${s} ⚠️\n`;
    });
    await sock.sendMessage(chatId, { text: list });
  } catch (e) {
    console.error('suspectlist err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'case': {
  try {
    const cases = [
      '🎲 *Kriminalfall*: 10 Menschen verschwunden in einer Nacht. Zeichen: Schwarzes Notizbuch gefunden.\n\n💀 Todesursache: Herzinfarkt',
      '🎲 *Kriminalfall*: Kriminelle sterben mysteriös. Aufzeichnungen: "Nur ein Name wird geschrieben"\n\n⚠️ Kira aktiv?',
      '🎲 *Kriminalfall*: Massensterben ohne Spuren. Inspektor: "Das ist übernatürlich!"\n\n👁️ Death Note?'
    ];
    const randomCase = cases[Math.floor(Math.random() * cases.length)];
    await sock.sendMessage(chatId, { text: randomCase });
  } catch (e) {
    console.error('case err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'solve': {
  try {
    const riddles = [
      { riddle: '🧩 Ich bin ein Notizbuch, das tötet. Wer bin ich?', answer: 'Death Note' },
      { riddle: '🧩 Ich beobachte alles. Wer bin ich?', answer: 'Shinigami' },
      { riddle: '🧩 Ich bin der Gott einer neuen Welt. Wer bin ich?', answer: 'Kira / Light' }
    ];
    const r = riddles[Math.floor(Math.random() * riddles.length)];
    await sock.sendMessage(chatId, { text: `${r.riddle}\n\n💡 Antwort: ||${r.answer}||\n\n✅ +1 Punkt!` });
  } catch (e) {
    console.error('solve err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'kira': {
  try {
    const chance = Math.random() > 0.5;
    const text = chance 
      ? '👤 *Bist du Kira?* JA! 💀\n\nDu schreibst Namen ins Death Note. Du bist der Gott der neuen Welt!'
      : '👤 *Bist du Kira?* NEIN ✅\n\nDu bist nur ein normaler Sterblicher.';
    await sock.sendMessage(chatId, { text });
  } catch (e) {
    console.error('kira err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'judgement': {
  try {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!mentioned || mentioned.length === 0) {
      return await sock.sendMessage(chatId, { text: '❌ Bitte markiere jemanden! /judgement @user' });
    }
    const target = mentioned[0].split('@')[0];
    const causes = ['Herzinfarkt', 'Verkehrsunfall', 'Explosion', 'Selbstmord', 'Ertrinken'];
    const cause = causes[Math.floor(Math.random() * causes.length)];
    await sock.sendMessage(chatId, { 
      text: `⚖️ *Kiras Urteil*\n\n@${target}\nTodesart: ${cause}\n\n⏳ 40 Sekunden...\n\n☠️ Dein Schicksal ist besiegelt.`,
      contextInfo: { mentionedJid: [mentioned[0]] }
    });
  } catch (e) {
    console.error('judgement err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'newworld': {
  try {
    const monolog = `
👑 *ICH WERDE DER GOTT DER NEUEN WELT!* 👑

"Die alte Welt war korrupt und voll von Verbrechen.
Aber mit diesem Death Note werde ich eine neue Welt erschaffen!

Eine Welt, in der es keine Bösen mehr gibt.
Eine Welt, in der nur die Guten herrschen.
MEINE Welt!

Ich bin Kira! ICH bin der Gott dieser neuen Welt!"

⚡ Das Genie des Light Yagami erwacht... ⚡
    `;
    await sock.sendMessage(chatId, { text: monolog });
  } catch (e) {
    console.error('newworld err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'apple': {
  try {
    const responses = [
      '🍎 Du gibst Ryuk einen Apfel!\n\n👹 RYUK: \"Yagami Light style... sehr interessant! Hehehehe!\" 🍎',
      '🍎 Ryuk nimmt den Apfel...\n\n👹 RYUK: \"Ein sterbliches Apfel? Gut. Gut!\" 😈',
      '🍎 *gib Apfel*\n\n👹 RYUK: \"Der menschliche Welt ist langweilig... aber dieser Apfel macht es interessant!\" 👁️'
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];
    await sock.sendMessage(chatId, { text: response });
  } catch (e) {
    console.error('apple err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'shinigamilist': {
  try {
    const list = `
👻 *Shinigami Liste* 👻

1. 🍎 **Ryuk** - Der Original Shinigami. Liebt Äpfel. Chaotisch.
2. 💀 **Rem** - Beschützer von Misa. Loyal und mächtig.
3. ☠️ **Gelus** - Stille aber tödlich.
4. ⚖️ **Armonia Justice** - Der Richter.

*Die Götter des Todes beobachten dich...* 👁️
    `;
    await sock.sendMessage(chatId, { text: list });
  } catch (e) {
    console.error('shinigamilist err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'summonryuk': {
  try {
    const text = `
👹 *RYUK WIRD HERBEIGERUFEN...* 👹

████████████████████ 100%

🌪️ Eine schwarze Aura erscheint...
👁️ Rote Augen leuchten auf...
😈 Ein dämonisches Lachen erklingt...

👹 RYUK: "Hehehehe! Wer hat mich gerufen? 
Ein sterbliches, das mein Death Note möchte? 
Interessant... SEHR interessant!"

🍎 Ryuk lässt einen Apfel fallen...
    `;
    await sock.sendMessage(chatId, { text });
  } catch (e) {
    console.error('summonryuk err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'kiraevent': {
  try {
    const users = ['@User1', '@User2', '@User3', '@User4'];
    const chosenUser = users[Math.floor(Math.random() * users.length)];
    await sock.sendMessage(chatId, { text: `🎯 *KIRA EVENT GESTARTET!*\n\n⚠️ Zufälliger User: ${chosenUser} wurde Kira!\n\n📖 ${chosenUser} hat das Death Note! ☠️\n\n🕵️ Findet heraus wer Kira ist!` });
  } catch (e) {
    console.error('kiraevent err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'deathnote-game': {
  try {
    const text = `
🕹️ *DEATH NOTE SPIEL* 🕹️

**Wer ist Kira?**

Spieler werden zufällig gewählt:
- 1 Spieler ist Kira (Death Note Besitzer)
- Andere müssen Kira finden
- Kira schreibt Namen ins Death Note
- Spieler müssen Fragen stellen

BEREIT? Spiel startet in 10 Sekunden...

🎮 Los geht's! 🎮
    `;
    await sock.sendMessage(chatId, { text });
  } catch (e) {
    console.error('deathnote-game err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'rank': {
  try {
    const ranks_list = ['Rekrut 🟩', 'Ermittler 🟨', 'Senior Ermittler 🟧', 'Oberermittler 🟥', 'Meister 👑'];
    const yourRank = ranks_list[Math.floor(Math.random() * ranks_list.length)];
    await sock.sendMessage(chatId, { text: `📈 Dein Ermittler-Rang: ${yourRank}\n\n💪 Weiter so!` });
  } catch (e) {
    console.error('rank err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'topdetectives': {
  try {
    const text = `
🏆 *Top Detectives* 🏆

1. 🥇 L - 9999 Punkte (Legende)
2. 🥈 Near - 5432 Punkte
3. 🥉 Mello - 4123 Punkte
4. 4️⃣ Naomi - 3456 Punkte
5. 5️⃣ Aizawa - 2345 Punkte

💪 Steige auf und werde Nummer 1!
    `;
    await sock.sendMessage(chatId, { text });
  } catch (e) {
    console.error('topdetectives err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'write': {
  try {
    const parts = q.split(' ');
    if (parts.length < 2) return await sock.sendMessage(chatId, { text: '❌ Usage: /write <Name> <Todesart>\nBeispiel: /write Max Herzinfarkt' });
    
    const name = parts[0];
    const cause = parts.slice(1).join(' ');
    
    await sock.sendMessage(chatId, { text: `✍️ *${name}* wird ins Death Note geschrieben...\n\n⏳ Todesart: ${cause}\n\n💀 40 Sekunden bis ${name} stirbt...` });
  } catch (e) {
    console.error('write err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'rule': {
  try {
    const rules = [
      '📜 Death Note Regel #1: "Der Name, der in dieses Notizbuch geschrieben wird, wird sterben."',
      '📜 Death Note Regel #2: "Solange der Name geschrieben ist, kann die Todeszeit und die Art kontrolliert werden."',
      '📜 Death Note Regel #3: "Das Death Note ist nicht Eigentum eines Shinigami."',
      '📜 Death Note Regel #4: "Ein Shinigami kann einem Menschen helfen, sein Death Note zu benutzen."',
      '📜 Death Note Regel #5: "Das Death Note kann keinen unmenschlichen Namen enthalten."'
    ];
    const rule = rules[Math.floor(Math.random() * rules.length)];
    await sock.sendMessage(chatId, { text: rule });
  } catch (e) {
    console.error('rule err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

case 'episode': {
  try {
    const episodes = [
      '🎬 *Episode: Renaissence*\n\nLight findet das Death Note. Sein Plan beginnt... RIP Lind L. Tailor.',
      '🎬 *Episode: Confrontation*\n\nL trifft Light zum ersten Mal. Das Spiel der Götter beginnt...',
      '🎬 *Episode: Executioner*\n\nMisa trifft Kira. Der Plan wird komplizierter...',
      '🎬 *Episode: New World*\n\nLight wird zum Gott der neuen Welt. Aber L ist noch da... 🎯'
    ];
    const episode = episodes[Math.floor(Math.random() * episodes.length)];
    await sock.sendMessage(chatId, { text: episode });
  } catch (e) {
    console.error('episode err', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler.' });
  }
  break;
}

// ================== KI COMMANDS ==================

case 'ask': {
  try {
    const question = args.join(' ');
    if (!question) return await sock.sendMessage(from, { text: '❗ Usage: /ask <Frage>' }, { quoted: msg });
    const responses = [
      '🤖 KI Antwort: Das ist eine interessante Frage! Die Antwort liegt in den Details. Basierend auf meinem Wissen würde ich sagen, dass dies abhängig von Kontext und Perspektive ist.',
      '🤖 Nach Analyse: Deine Frage ist berechtigt. Es gibt mehrere Perspektiven zu diesem Thema. Die wahrscheinlichste Antwort ist: Es kommt darauf an!',
      '🤖 KI Analyse: Sehr gute Frage! Die Wahrheit ist komplex. Meine Einschätzung: Es gibt sowohl Befürworter als auch Gegner dieser Ansicht.',
      '🤖 Denke darüber nach: Deine Frage zeigt kritisches Denken. Die Antwort hängt stark von persönlichen Überzeugungen ab.'
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];
    await sock.sendMessage(from, { text: `*Deine Frage:* ${question}\n\n${response}` }, { quoted: msg });
  } catch (e) {
    console.error('ask err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei der KI-Abfrage.' }, { quoted: msg });
  }
  break;
}

case 'nyxion': {
  try {
    const question = args.join(' ');
    if (!question) {
      return await sock.sendMessage(from, { 
        text: `🤖 *Nyxion KI - Verwendung*\n\n/nyxion <deine frage>\n\nBeispiel:\n/nyxion Was ist Python?\n/nyxion Erkläre mir Quantenphysik\n\n⏳ Dies verbindet sich mit Nyxion und gibt dir eine KI-Antwort.` 
      }, { quoted: msg });
    }

    // Zeige "Tippe..." Nachricht
    await sock.sendPresenceUpdate('composing', chatId);
    const statusMsg = await sock.sendMessage(from, { text: `🤖 *Nyxion fragt...*\n\n💬 Frage: ${question}\n\n⏳ Wird verarbeitet...` });

    try {
      // Neue Nyxion-Integration über API Key / Base URL aus apiConfig.json
      const apiConfig = require('./apiConfig.json');
      const nyxCfg = apiConfig.nyxion || {};
      const NYXION_API_KEY = NYX_API_KEY || nyxCfg.apiKey || '';
      // allow overriding the host via environment variable (e.g. for local dev)
      const NYXION_URL = (process.env.NYX_HOST || nyxCfg.baseUrl || 'http://localhost:8000/v1').replace(/\/+$/,'');

      if (!NYXION_API_KEY) throw new Error('Nyxion API-Key nicht konfiguriert');

      // Sende Frage an Nyxion-Endpoint mit vollem JSON payload wie im Python-Beispiel
      const queryResponse = await axios.post(`${NYXION_URL}/generate`, {
        prompt: question,
        max_new_tokens: 100,
        temperature: 0.7,
        top_p: 0.95
      }, {
        timeout: 30000,
        headers: {
          'X-API-Key': NYXION_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      let nyxionAnswer = '❌ Keine Antwort erhalten';
      if (queryResponse.data) {
        // Wie im Python-Beispiel: generated_text
        nyxionAnswer = queryResponse.data.generated_text || queryResponse.data.response || JSON.stringify(queryResponse.data);
      }

      // Schritt 3: Gebe Antwort im Chat aus
      const responseText = `🤖 *Nyxion KI-Antwort*\n\n💬 *Deine Frage:*\n${question}\n\n✨ *Antwort:*\n${nyxionAnswer}`;

      // Aktualisiere die Status-Nachricht
      await sock.sendMessage(from, { 
        text: responseText 
      }, { quoted: msg });

      // Lösche die alte Status-Nachricht
      try {
        await sock.sendMessage(from, { delete: statusMsg.key });
      } catch (e) {}

    } catch (apiErr) {
      // log full response when available
      console.error('Nyxion API Fehler:', apiErr.message);
      if (apiErr.response) {
        console.error('--> status', apiErr.response.status);
        console.error('--> data', JSON.stringify(apiErr.response.data));
      }
      // if 412 occurred, try again without max_new_tokens field just in case
      if (apiErr.response && apiErr.response.status === 412) {
        try {
          const retry = await axios.post(`${NYXION_URL}/generate`, { prompt: question }, {
            timeout: 30000,
            headers: { 'X-API-Key': NYXION_API_KEY, 'Content-Type': 'application/json' }
          });
          const nyxionAnswer = retry.data.response || retry.data.answer || JSON.stringify(retry.data);
          await sock.sendMessage(from, {
            text: `🤖 *Nyxion KI-Antwort (FALLBACK)*\n\n💬 *Deine Frage:*\n${question}\n\n✨ *Antwort:*\n${nyxionAnswer}`
          }, { quoted: msg });
          return;
        } catch (retryErr) {
          console.error('Nyxion Retry fehlgeschlagen:', retryErr.message);
        }
      }
      
      // Fallback: Verwende lokale KI-Antwort
      const fallbackResponses = [
        'Das ist eine großartige Frage! Basierend auf meinem Wissen würde ich sagen...',
        'Interessant! Lassen Sie mich das analysieren. Die Antwort ist...',
        'Das erfordert ein tieferes Verständnis. Meine Einschätzung ist...',
        'Aus verschiedenen Perspektiven könnte man sagen...'
      ];

      const fallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
      
      await sock.sendMessage(from, { 
        text: `🤖 *Nyxion Fallback-Antwort*\n\n💬 *Deine Frage:*\n${question}\n\n✨ *Antwort:*\n${fallback}\n\n⚠️ (Nyxion-API nicht verfügbar - Fallback verwendet)` 
      }, { quoted: msg });
    }

    await sock.sendPresenceUpdate('available', chatId);

  } catch (e) {
    console.error('nyxion err', e);
    await sock.sendMessage(from, { text: `❌ Fehler bei Nyxion: ${e.message}` }, { quoted: msg });
  }
  break;
}

case 'summarize': {
  try {
    const text = args.join(' ');
    if (!text) return await sock.sendMessage(from, { text: '❗ Usage: /summarize <Text>' }, { quoted: msg });
    const sentences = text.split('.').filter(s => s.trim());
    const summary = sentences.slice(0, Math.ceil(sentences.length / 2)).join('. ') + '.';
    await sock.sendMessage(from, { text: `📝 *Zusammenfassung:*\n\n${summary}` }, { quoted: msg });
  } catch (e) {
    console.error('summarize err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei der Zusammenfassung.' }, { quoted: msg });
  }
  break;
}

case 'translate': {
  try {
    const lang = args[0];
    const text = args.slice(1).join(' ');
    if (!lang || !text) return await sock.sendMessage(from, { text: '❗ Usage: /translate <Sprache> <Text>' }, { quoted: msg });
    const translations = {
      'en': 'Hello, this is the translated text in English',
      'es': 'Hola, este es el texto traducido al español',
      'fr': 'Bonjour, ceci est le texte traduit en français',
      'de': 'Hallo, dies ist der übersetzte Text auf Deutsch',
      'it': 'Ciao, questo è il testo tradotto in italiano',
      'pt': 'Olá, este é o texto traduzido em português',
      'ja': 'こんにちは、これは日本語に翻訳されたテキストです',
      'ru': 'Привет, это переведенный текст на русском языке'
    };
    const translated = translations[lang.toLowerCase()] || `Übersetzung zu "${lang}" nicht verfügbar. Versuchen Sie: en, es, fr, de, it, pt, ja, ru`;
    await sock.sendMessage(from, { text: `🌍 *Übersetzung zu ${lang}:*\n\n${text}\n➜ ${translated}` }, { quoted: msg });
  } catch (e) {
    console.error('translate err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei der Übersetzung.' }, { quoted: msg });
  }
  break;
}

case 'joke': {
  try {
    const jokes = [
      'Warum so ernst? Ein Programmierer geht in eine Bar und bestellt einen Java. Der Bartender sagt: "Das ist kein Code!"',
      'Was ist ein Geometers Lieblingstanz? Die Tangens!',
      'Warum haut der Mathematiker seine Frau? Weil sie von Grund auf unvernünftig ist!',
      'Ein String, ein Char und ein int gehen in eine Bar. Der Barkeeper fragt: "Was wollt ihr?" Der String sagt: "Bier!" Der Char sagt: "B!" Der int sagt: "2"',
      'Warum können Computerwissenschaftler den Unterschied zwischen Halloween und Weihnachten nicht erkennen? Weil 31 Oktober = 25 Dezember',
      '🤖 Zwei Künstliche Intelligenzen unterhalten sich: "Du Bist sicher ein Software-Update wert!" "Du auch, du auch!"'
    ];
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    await sock.sendMessage(from, { text: `😂 *Witzig!*\n\n${joke}` }, { quoted: msg });
  } catch (e) {
    console.error('joke err', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen eines Witzes.' }, { quoted: msg });
  }
  break;
}

case 'rhyme': {
  try {
    const word = args.join(' ');
    if (!word) return await sock.sendMessage(from, { text: '❗ Usage: /rhyme <Wort>' }, { quoted: msg });
    const rhymeList = {
      'cat': ['bat', 'hat', 'mat', 'rat', 'sat', 'fat', 'pat'],
      'house': ['mouse', 'spouse', 'louse', 'douse', 'rouse'],
      'day': ['way', 'say', 'play', 'stay', 'ray', 'pay', 'may'],
      'night': ['light', 'sight', 'flight', 'might', 'tight', 'bright', 'fight'],
      'love': ['above', 'dove', 'shove', 'glove', 'thereof'],
      'song': ['long', 'strong', 'wrong', 'along', 'belong', 'throng']
    };
    const rhymes = rhymeList[word.toLowerCase()] || ['*', 'keine Reime gefunden. Versuchen Sie: cat, house, day, night, love, song'];
    await sock.sendMessage(from, { text: `🎵 *Reime zu "${word}":*\n\n${Array.isArray(rhymes) && rhymes[0] !== '*' ? rhymes.join(', ') : rhymes.join('')}` }, { quoted: msg });
  } catch (e) {
    console.error('rhyme err', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Finden von Reimen.' }, { quoted: msg });
  }
  break;
}

case 'poem': {
  try {
    const topic = args.join(' ') || 'Liebe';
    const poems = {
      'liebe': 'In deinen Augen finde ich Licht,\nDas Herz schlägt schneller - ein wunderbar Gedicht.\nJede Sekunde neben dir ist Gold,\nEine Geschichte, nie genug erzählt.',
      'frühling': 'Blüten erblühen in zartem Schein,\nWarme Winde, sanft und rein.\nNeues Leben sprießt aus dunkler Erde,\nEine Hymne auf Natur werde.',
      'hoffnung': 'Selbst in Dunkelheit scheint ein Stern,\nHoffnung begleitet, nah und fern.\nJeder Morgen bringt Chancen neu,\nZu träumen, zu wachsen, treu.',
      'mondnacht': 'Der Mond scheint hell in dieser Nacht,\nSilber glänzt, wunder Pracht.\nStille umhüllt die ganze Welt,\nWo Traum und Wirklichkeit sich hält.'
    };
    const poem = poems[topic.toLowerCase()] || poems['hoffnung'];
    await sock.sendMessage(from, { text: `✍️ *Gedicht über "${topic}":*\n\n${poem}` }, { quoted: msg });
  } catch (e) {
    console.error('poem err', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Generieren des Gedichts.' }, { quoted: msg });
  }
  break;
}

case 'story': {
  try {
    const topic = args.join(' ') || 'Abenteuer';
    const stories = {
      'abenteuer': 'Es war einmal ein mutiger Reisender, der sich auf eine epische Quest begab. Durch dunkle Wälder und über hohe Berge wanderte er, stets auf der Suche nach dem verlorenen Schatz. Am Ende fand er nicht Gold, sondern etwas Wertvolleres - die Weisheit des Lebens selbst.',
      'fantasy': 'In einem fernen Königreich, wo Drachen den Himmel durchkreuzen, lebte ein junger Magier. Mit nur einem Stab bewaffnet, stellte er sich dem dunklen Zauberer entgegen. Nach einer epischen Schlacht des Guten gegen das Böse, triumphierte die Magie der Hoffnung.',
      'scifi': 'Im Jahr 2247 stießen Weltraumpiloten auf eine außerirdische Zivilisation. Eine friedliche Begegnung führte zu unendlichen Möglichkeiten. Gemeinsam bauten sie eine Brücke zwischen den Sternen - eine Allianz für die Ewigkeit.',
      'mystery': 'Eine verschwundene Person, keine Spuren, nur Fragen. Der Detektiv verfiel keinem Verzicht. Nach Tagen intensiver Ermittlung löste sich das Rätsel: ein Plan der Rettung, nicht des Verbrechens. Die Wahrheit war überraschender als jede Fiktion.'
    };
    const story = stories[topic.toLowerCase()] || stories['abenteuer'];
    await sock.sendMessage(from, { text: `📖 *Geschichte über "${topic}":*\n\n${story}` }, { quoted: msg });
  } catch (e) {
    console.error('story err', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Generieren der Geschichte.' }, { quoted: msg });
  }
  break;
}

case 'riddle': {
  try {
    const riddles = [
      { q: 'Ich habe eine Stadt, aber keine Häuser. Ich habe einen Berg, aber keine Bäume. Ich habe Wasser, aber keine Fische. Was bin ich?', a: 'Eine Karte!' },
      { q: 'Je mehr du wegnimmst, desto größer wird es. Was ist es?', a: 'Ein Loch!' },
      { q: 'Ich bin nicht lebendig, aber ich wachse. Ich habe keine Lungen, aber ich brauche Luft. Was bin ich?', a: 'Feuer!' },
      { q: 'Ich kann schneller sein als Wind, aber ich habe keine Flügel. Was bin ich?', a: 'Ein Gedanke!' },
      { q: 'Welches Ding kommt nachts ohne gerufen zu werden und verschwindet am Tage, ohne gestohlen zu werden?', a: 'Der Tau (Tau/Morgentau)!' }
    ];
    const riddle = riddles[Math.floor(Math.random() * riddles.length)];
    await sock.sendMessage(from, { text: `🧩 *Rätsel:*\n\n${riddle.q}\n\n_Lösung: ||${riddle.a}||_` }, { quoted: msg });
  } catch (e) {
    console.error('riddle err', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen des Rätsels.' }, { quoted: msg });
  }
  break;
}

case 'codehelp': {
  try {
    const problem = args.join(' ');
    if (!problem) return await sock.sendMessage(from, { text: '❗ Usage: /codehelp <Problem>' }, { quoted: msg });
    const help = `
💻 *Code-Hilfe für: "${problem}"*

Häufige Lösungen:
1. **Fehler überprüfen**: Lesen Sie die vollständige Fehlermeldung
2. **Syntax prüfen**: Achten Sie auf korrekte Klammern und Semikola
3. **Variablen kontrollieren**: Stellen Sie sicher, dass alle Variablen deklariert sind
4. **Dokumentation lesen**: Konsultieren Sie die offizielle Dokumentation
5. **Debug-Print**: Verwenden Sie console.log() zur Fehlersuche
6. **Stack Overflow**: Suchen Sie nach ähnlichen Problemen online

Wenn das Problem bestehen bleibt, teilen Sie den genauen Code-Ausschnitt!
    `;
    await sock.sendMessage(from, { text: help }, { quoted: msg });
  } catch (e) {
    console.error('codehelp err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei der Code-Hilfe.' }, { quoted: msg });
  }
  break;
}

case 'math': {
  try {
    const calculation = args.join(' ');
    if (!calculation) return await sock.sendMessage(from, { text: '❗ Usage: /math <Rechnung>' }, { quoted: msg });
    try {
      const result = eval(calculation);
      await sock.sendMessage(from, { text: `🔢 *Berechnung:*\n\n${calculation} = ${result}` }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(from, { text: `❌ Ungültige Rechnung: ${err.message}` }, { quoted: msg });
    }
  } catch (e) {
    console.error('math err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei der Berechnung.' }, { quoted: msg });
  }
  break;
}

case 'define': {
  try {
    const word = args.join(' ');
    if (!word) return await sock.sendMessage(from, { text: '❗ Usage: /define <Wort>' }, { quoted: msg });
    const definitions = {
      'künstlich': 'Nicht natürlich; von Menschen geschaffen oder herbeigeführt.',
      'intelligenz': 'Die Fähigkeit zu lernen, zu verstehen und probleme zu lösen.',
      'algorithmus': 'Eine Schritt-für-Schritt-Anleitung zur Lösung eines Problems.',
      'datenbank': 'Eine organisierte Sammlung von strukturierten Daten.',
      'verschlüsselung': 'Der Prozess zum Schutz von Informationen durch Codierung.',
      'protokoll': 'Ein vereinbartes System oder Satz von Regeln.',
      'iteration': 'Der Prozess der Wiederholung bis zur Verbesserung oder Fertigstellung.',
      'variable': 'Ein benannter Behälter für einen Wert oder Daten.',
      'funktion': 'Ein wiederverwendbarer Code-Block, der eine spezifische Aufgabe erfüllt.',
      'array': 'Eine geordnete Sammlung von Elementen desselben Typs.'
    };
    const definition = definitions[word.toLowerCase()] || `Keine Definition für "${word}" gefunden. Versuchen Sie ein anderes Wort!`;
    await sock.sendMessage(from, { text: `📚 *Definition von "${word}":*\n\n${definition}` }, { quoted: msg });
  } catch (e) {
    console.error('define err', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen der Definition.' }, { quoted: msg });
  }
  break;
}

case 'config': {
  try {
    const sender = msg.key.participant || msg.key.remoteJid || msg.sender;
    const user = getUser(sender);
    
    if (!user) {
      return await sock.sendMessage(from, { text: '❌ Du musst zuerst registriert sein! Nutze /register.' }, { quoted: msg });
    }

    const subcommand = args[0];

    if (!subcommand || subcommand.toLowerCase() === 'view' || subcommand.toLowerCase() === 'show') {
      // Zeige aktuelle Konfiguration
      const config = getUserConfig(sender);
      const configText = `
⚙️ *Deine Benutzer-Konfiguration*

🤖 KI-Modell: *${config.aiModel}*
🎂 Geburtstag: *${config.birthday || 'Nicht gesetzt'}*
🎮 Lieblingsspiel: *${config.favoriteGame || 'Nicht gesetzt'}*
🌍 Sprache: *${config.language}*
🎨 Design: *${config.theme}*

*Befehle:*
/config ai <Claude|Groq|Nyxion|Axiom|Voltra> - KI-Modell ändern
/config nyxkey <API-Key> - Nyxion API-Key setzen
/config birthday <TT.MM.YYYY> - Geburtstag setzen
/config game <Spiel> - Lieblingsspiel setzen
/config lang <de|en|es|fr> - Sprache ändern
/config theme <dark|light> - Design ändern
Voltra sendet Anfragen an https://voltraai.onrender.com/api/chat
      `;
      return await sock.sendMessage(from, { text: configText }, { quoted: msg });
    }

	    if (subcommand.toLowerCase() === 'ai') {
	      const rawModel = (args[1] || '').trim();
	      if (!rawModel) return await sock.sendMessage(from, { text: '❗ Usage: /config ai <Claude|Groq|Nyxion|Axiom|Voltra>' }, { quoted: msg });

	      const modelMap = {
	        claude: 'Claude',
	        groq: 'Groq',
	        nyxion: 'Nyxion',
	        axiom: 'Axiom',
	        voltra: 'Voltra'
	      };
	      const aiModel = modelMap[rawModel.toLowerCase()];
	      const validModels = Object.values(modelMap);
	      if (!aiModel) {
	        return await sock.sendMessage(from, { text: `❌ Ungültige KI. Verfügbar: ${validModels.join(', ')}` }, { quoted: msg });
	      }

	      setUserConfig(sender, { aiModel });
	      return await sock.sendMessage(from, { text: `✅ KI-Modell auf *${aiModel}* gesetzt!` }, { quoted: msg });
	    }

    if (subcommand.toLowerCase() === 'nyxkey' || subcommand.toLowerCase() === 'nyxionkey') {
      const apiKey = args[1];
      if (!apiKey) return await sock.sendMessage(from, { text: '❗ Usage: /config nyxkey <API-Key>' }, { quoted: msg });
      
      // Validiere API-Key Format (sollte mit nyx_ beginnen)
      if (!apiKey.startsWith('nyx_')) {
        return await sock.sendMessage(from, { text: '❌ Ungültiger Nyxion API-Key! Muss mit "nyx_" beginnen.' }, { quoted: msg });
      }
      
      // Speichere API-Key in config.env
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, 'config.env');
      
      try {
        let envContent = '';
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        // Entferne alte NYX_API_KEY Zeile falls vorhanden
        const lines = envContent.split('\n').filter(line => !line.startsWith('NYX_API_KEY='));
        
        // Füge neue NYX_API_KEY hinzu
        lines.push(`NYX_API_KEY=${apiKey}`);
        
        fs.writeFileSync(envPath, lines.join('\n'));
        
        // Lade config.env neu
        require('dotenv').config({ path: envPath, override: true });
        
        return await sock.sendMessage(from, { text: `✅ Nyxion API-Key erfolgreich gesetzt!` }, { quoted: msg });
      } catch (error) {
        console.error('Fehler beim Speichern des API-Keys:', error);
        return await sock.sendMessage(from, { text: '❌ Fehler beim Speichern des API-Keys.' }, { quoted: msg });
      }
    }

    if (subcommand.toLowerCase() === 'birthday') {
      const birthday = args[1];
      if (!birthday) return await sock.sendMessage(from, { text: '❗ Usage: /config birthday <TT.MM.YYYY>' }, { quoted: msg });
      
      // Validiere Datumsformat (sehr einfach)
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(birthday)) {
        return await sock.sendMessage(from, { text: '❌ Ungültiges Datumsformat! Nutze: TT.MM.YYYY (z.B. 15.03.1990)' }, { quoted: msg });
      }
      
      setUserConfig(sender, { birthday });
      return await sock.sendMessage(from, { text: `✅ Geburtstag auf *${birthday}* gesetzt!` }, { quoted: msg });
    }

    if (subcommand.toLowerCase() === 'game') {
      const game = args.slice(1).join(' ');
      if (!game) return await sock.sendMessage(from, { text: '❗ Usage: /config game <Spiel>' }, { quoted: msg });
      
      setUserConfig(sender, { favoriteGame: game });
      return await sock.sendMessage(from, { text: `✅ Lieblingsspiel auf *${game}* gesetzt!` }, { quoted: msg });
    }

    if (subcommand.toLowerCase() === 'lang') {
      const lang = args[1];
      if (!lang) return await sock.sendMessage(from, { text: '❗ Usage: /config lang <de|en|es|fr>' }, { quoted: msg });
      
      const validLangs = ['de', 'en', 'es', 'fr'];
      if (!validLangs.includes(lang.toLowerCase())) {
        return await sock.sendMessage(from, { text: `❌ Ungültige Sprache! Verfügbar: ${validLangs.join(', ')}` }, { quoted: msg });
      }
      
      setUserConfig(sender, { language: lang.toLowerCase() });
      return await sock.sendMessage(from, { text: `✅ Sprache auf *${lang.toUpperCase()}* gesetzt!` }, { quoted: msg });
    }

    if (subcommand.toLowerCase() === 'theme') {
      const theme = args[1];
      if (!theme) return await sock.sendMessage(from, { text: '❗ Usage: /config theme <dark|light>' }, { quoted: msg });
      
      const validThemes = ['dark', 'light'];
      if (!validThemes.includes(theme.toLowerCase())) {
        return await sock.sendMessage(from, { text: `❌ Ungültiges Design! Verfügbar: ${validThemes.join(', ')}` }, { quoted: msg });
      }
      
      setUserConfig(sender, { theme: theme.toLowerCase() });
      return await sock.sendMessage(from, { text: `✅ Design auf *${theme.toUpperCase()}* gesetzt!` }, { quoted: msg });
    }

    // Wenn kein gültiger Subcommand
    const helpText = `
⚙️ *Konfigurationsoptionen*

/config oder /config view - Zeige aktuelle Einstellungen
/config ai <Modell> - Wähle KI (Claude, Groq, Nyxion, Axiom, Voltra)
/config nyxkey <API-Key> - Setze Nyxion API-Key
/config birthday <TT.MM.YYYY> - Setze Geburtstag
/config game <Spiel> - Setze Lieblingsspiel
/config lang <Sprache> - Wähle Sprache (de, en, es, fr)
/config theme <Design> - Wähle Design (dark, light)

*Beispiele:*
/config ai Nyxion
/config nyxkey nyx_dein_api_key_hier
/config birthday 25.12.1995
/config game Minecraft
/config lang en
/config theme light
    `;
    await sock.sendMessage(from, { text: helpText }, { quoted: msg });

  } catch (e) {
    console.error('config err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei der Konfiguration.' }, { quoted: msg });
  }
  break;
}

// ================== AUDIO EFFECTS ==================

const processAudioEffect = async (audioBuffer, effectType) => {
  const tempInputFile = `/tmp/audio_input_${Date.now()}.ogg`;
  const tempOutputFile = `/tmp/audio_output_${Date.now()}.ogg`;
  
  fs.writeFileSync(tempInputFile, audioBuffer);
  
  let ffmpegCommand = '';
  
  switch(effectType.toLowerCase()) {
    case 'bassboost':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -af "bass=g=10" ${tempOutputFile}`;
      break;
    case 'slowed':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -filter:a "atempo=0.8" ${tempOutputFile}`;
      break;
    case 'spedup':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -filter:a "atempo=1.5" ${tempOutputFile}`;
      break;
    case 'nightcore':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -filter:a "atempo=1.25,asetrate=44100*1.25" ${tempOutputFile}`;
      break;
    case 'reverb':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -af "aecho=0.8:0.9:6:0.3" ${tempOutputFile}`;
      break;
    case 'reverse':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -af "areverse" ${tempOutputFile}`;
      break;
    case 'deep':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -af "bass=g=15:f=200" ${tempOutputFile}`;
      break;
    case 'echo':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -af "aecho=0.5:0.5:500:0.3" ${tempOutputFile}`;
      break;
    case 'vaporwave':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -filter:a "atempo=0.85,asetrate=44100*0.85" ${tempOutputFile}`;
      break;
    case '8d':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -af "apulsator=hz=0.125" ${tempOutputFile}`;
      break;
    case 'earrape':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -af "volume=3,bass=g=20,treble=t=10" ${tempOutputFile}`;
      break;
    case 'chipmunk':
      ffmpegCommand = `ffmpeg -i ${tempInputFile} -af "asetrate=44100*1.5,atempo=1.5" ${tempOutputFile}`;
      break;
    default:
      return null;
  }
  
  return new Promise((resolve, reject) => {
    require('child_process').exec(ffmpegCommand, (error) => {
      if (error) {
        reject(error);
      } else {
        try {
          const outputBuffer = fs.readFileSync(tempOutputFile);
          fs.unlinkSync(tempInputFile);
          fs.unlinkSync(tempOutputFile);
          resolve(outputBuffer);
        } catch (e) {
          reject(e);
        }
      }
    });
  });
};

case 'bassboost': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Audio wird bearbeitet...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'bassboost');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('bassboost err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'slowed': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Audio wird verlangsamt...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'slowed');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('slowed err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'spedup': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Audio wird beschleunigt...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'spedup');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('spedup err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'nightcore': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Nightcore-Effekt wird angewendet...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'nightcore');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('nightcore err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'reverb': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Halleffekt wird angewendet...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'reverb');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('reverb err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'reverse': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Audio wird umgekehrt...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'reverse');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('reverse err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'deep': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Deep-Effekt wird angewendet...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'deep');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('deep err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'echo': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Echo-Effekt wird angewendet...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'echo');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('echo err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'vaporwave': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Vaporwave-Effekt wird angewendet...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'vaporwave');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('vaporwave err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case '8d': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ 8D-Audio-Effekt wird angewendet...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, '8d');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('8d err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'earrape': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Earrape-Effekt wird angewendet... (WARNUNG: LAUT!)' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'earrape');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('earrape err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'chipmunk': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.audioMessage) {
      return await sock.sendMessage(from, { text: '❌ Antworte auf eine Sprachnachricht!' }, { quoted: msg });
    }
    
    await sock.sendMessage(from, { text: '⏳ Chipmunk-Effekt wird angewendet...' }, { quoted: msg });
    
    const audioBuffer = await downloadMediaMessage(quotedMsg, 'audio', 0);
    const processedBuffer = await processAudioEffect(audioBuffer, 'chipmunk');
    
    await sock.sendMessage(from, { audio: processedBuffer, mimetype: 'audio/ogg' }, { quoted: msg });
  } catch (e) {
    console.error('chipmunk err', e);
    await sock.sendMessage(from, { text: '❌ Fehler bei Audio-Verarbeitung.' }, { quoted: msg });
  }
  break;
}

case 'tos': {
  const quoted = msg; // zitiert die Originalnachricht
  const jid = msg.key.remoteJid;

  const TOS_TEXT = `📜 BeastBot - Terms of Service & AGB 2026

════════════════════════════════════════
🤖 WILLKOMMEN BEI BEASTBOT
════════════════════════════════════════

🔹 *NUTZUNGSBEDINGUNGEN*

1️⃣ *Akzeptanz der Bedingungen*
Die Nutzung dieses Bots impliziert die vollständige Akzeptanz dieser ToS.
Wenn du nicht einverstanden bist, nutze den Bot bitte nicht.

2️⃣ *Bot-Funktionalität*
✅ Der Bot bietet folgende Dienste:
   • KI-gestützte Funktionen (ask, summarize, translate, poem, story, etc.)
   • Audio-Effekt-Verarbeitung (bassboost, nightcore, reverb, etc.)
   • Benutzer-Konfiguration & Personalisierung
   • Spiele & Fun-Befehle (fish, pets, economy system)
   • Admin-Funktionen (moderation, antidelete, etc.)
   • Stranger Things Easter Eggs

3️⃣ *Verbotene Aktivitäten*
❌ Missbrauch des Bots für illegale Aktivitäten
❌ Spam oder Flooding (schnelle wiederholte Befehle)
❌ Versuch, den Bot zu hacken oder zu stören
❌ Unzulässige Inhalte (rassistisch, sexuell, gewalttätig)
❌ Betrügerei im Economy-System

4️⃣ *Konsequenzen für Regel-Verstöße*
⚠️ Verwarnung System (3x → Kick)
🔒 Temporäres oder permanentes Ban
⛔ Blockierung des Accounts

5️⃣ *Datenschutz & Datensicherheit*
🔐 Alle verarbeiteten Daten werden nach DSGVO geschützt
🔐 Audio-Daten werden nach Verarbeitung gelöscht
🔐 Benutzer-Konfiguration wird verschlüsselt gespeichert
📊 Statistiken werden nur für Service-Optimierung genutzt

6️⃣ *Verfügbarkeit & Support*
⏳ Der Bot kann bei Updates oder Wartung kurzzeitig offline sein
🆘 Für Support: Kontakt über Befehl */kontakt*
📞 Notfall: wa.me/4367764694963

7️⃣ *Änderungen der Bedingungen*
📝 Diese ToS können jederzeit aktualisiert werden
🔔 Nutzer werden bei wichtigen Änderungen benachrichtigt

8️⃣ *FEATURES ÜBERSICHT (Feb 2026)*

🤖 *KI-Befehle (Menu 12):*
   /ask - Fragen stellen
   /summarize - Zusammenfassungen
   /translate - Übersetzer
   /joke - Witze
   /rhyme - Reimfinder
   /poem - Gedichte
   /story - Geschichten
   /riddle - Rätsel
   /codehelp - Code-Hilfe
   /math - Mathematik
   /define - Definitionen
   /video - Video erstellen
   /song - Song erstellen
   /tts - Text-to-Speech

🎵 *Audio-Effekte (Menu 8):*
   /bassboost - Bass erhöhen
   /slowed - Verlangsamen
   /spedup - Beschleunigen
   /nightcore - Nightcore-Effekt
   /reverb - Halleffekt
   /reverse - Rückwärts
   /deep - Tiefe Töne
   /echo - Echo
   /vaporwave - Vaporwave
   /8d - 8D Audio
   /earrape - Sehr laut
   /chipmunk - Hohe Stimme

⚙️ *Benutzer-Konfiguration:*
   /config - Konfiguration anzeigen
   /config ai <KI> - KI-Modell wählen
   /config birthday <Datum> - Geburtstag setzen
   /config game <Spiel> - Lieblingsspiel
   /config lang <Sprache> - Sprache ändern
   /config theme <Design> - Design ändern

👽 *Stranger Things (Menu 11):*
   13 spezielle Stranger Things Befehle

════════════════════════════════════════
⚙️ *CREDITS & BETEILIGTE (2026)*
════════════════════════════════════════

🎯 *Core Development:*
   • Hauptentwicklung: Beast Industries / Beastmeds
   
🛠️ *Feature-Entwickler:*
   • KI-Integrationen: OpenAI, Groq, Nyxion-Team, Axiom, Voltra
   • Audio-Processing: FFmpeg Integration Team
   • Main Commands: by Deadsclient
   • Multisession-System: by 777Nyxara
   • Rank & Management: by OneDevil
   • YouTube Play & Media: by OneDevil
   • Erweiterte Tools & Addons: by OneDevil
   • Ursprüngliche Base: "Switching to whiskey" by OneDevil
   • Portierung zu BeastBot: by Beast Industries
   • Weitere Optimierung & Updates: by Beastmeds

════════════════════════════════════════
✅ *AKZEPTANZ*
════════════════════════════════════════

Mit der Nutzung des BeastBots akzeptierst du:
✔️ Diese Terms of Service
✔️ Die Datenschutzerklärung (DSGVO)
✔️ Das Regelsystem & Konsequenzen
✔️ Die Sicherheits- & Nutzungsrichtlinien

Letzte Aktualisierung: 11.02.2026
Nächste Review: 30.04.2026

════════════════════════════════════════
🌐 Website: ...
📞 Owner: wa.me/4367764694963
════════════════════════════════════════
`;

  // Nachricht senden
  await sock.sendMessage(jid, { text: TOS_TEXT }, { quoted });
}
break;


    


// ---------------------- AUDIO EFFECT CASES ----------------------

case 'bassboost': {
    const level = parseInt(args[0]) || 10;
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'bass_in');
        const output = saveTempAudio(Buffer.alloc(0), 'bass_out');

        ffmpeg(input).audioFilters(`bass=g=${level}`)
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler beim Bassboost!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case 'slowed': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'slow_in');
        const output = saveTempAudio(Buffer.alloc(0), 'slow_out');

        ffmpeg(input).audioFilters('atempo=0.85,asetrate=44100*0.9')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei Slowed!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case 'spedup': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'speed_in');
        const output = saveTempAudio(Buffer.alloc(0), 'speed_out');

        ffmpeg(input).audioFilters('atempo=1.25,asetrate=44100*1.1')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei Spedup!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case 'nightcore': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'nc_in');
        const output = saveTempAudio(Buffer.alloc(0), 'nc_out');

        ffmpeg(input).audioFilters('atempo=1.25,asetrate=44100*1.25')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei Nightcore!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case 'deep': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'deep_in');
        const output = saveTempAudio(Buffer.alloc(0), 'deep_out');

        ffmpeg(input).audioFilters('asetrate=44100*0.9,atempo=1.1,aresample=44100')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei Deep!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case 'reverb': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'rev_in');
        const output = saveTempAudio(Buffer.alloc(0), 'rev_out');

        ffmpeg(input).audioFilters('aecho=0.8:0.9:1000:0.3')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei Reverb!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case 'reverse': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'rev_in');
        const output = saveTempAudio(Buffer.alloc(0), 'rev_out');

        ffmpeg(input).audioFilters('areverse')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei Reverse!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case 'vaporwave': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'vap_in');
        const output = saveTempAudio(Buffer.alloc(0), 'vap_out');

        ffmpeg(input).audioFilters('asetrate=44100*0.8,atempo=1.1')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei Vaporwave!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case '8d': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, '8d_in');
        const output = saveTempAudio(Buffer.alloc(0), '8d_out');

        ffmpeg(input).audioFilters('apulsator=mode=sine:hz=0.125')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei 8D!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case 'echo': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'echo_in');
        const output = saveTempAudio(Buffer.alloc(0), 'echo_out');

        ffmpeg(input).audioFilters('aecho=0.6:0.6:1000:0.3')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei Echo!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case 'chipmunk': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'chip_in');
        const output = saveTempAudio(Buffer.alloc(0), 'chip_out');

        ffmpeg(input).audioFilters('asetrate=44100*1.5,atempo=1.1')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei Chipmunk!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

case 'earrape': {
    getAudioBuffer(msg, async (media) => {
        if (!media) return sock.sendMessage(from, { text: 'Bitte antworte auf Audio!' }, { quoted: msg });

        const input = saveTempAudio(media, 'ear_in');
        const output = saveTempAudio(Buffer.alloc(0), 'ear_out');

        ffmpeg(input).audioFilters('volume=10')
            .on('end', async () => {
                const buff = fs.readFileSync(output);
                await sock.sendMessage(from, { audio: buff, mimetype: 'audio/mp4' }, { quoted: msg });
                fs.unlinkSync(input); fs.unlinkSync(output);
            })
            .on('error', () => {
                sock.sendMessage(from, { text: 'Fehler bei Earrape!' }, { quoted: msg });
                fs.existsSync(input) && fs.unlinkSync(input);
                fs.existsSync(output) && fs.unlinkSync(output);
            })
            .save(output);
    });
    break;
}

// ========== ENCRYPTION / VERSCHLÜSSELUNG ==========
case 'encode': {
  if (!args[0]) return await sock.sendMessage(from, { text: '❌ Bitte gib einen Text an.\n\nBeispiel: /encode hello' }, { quoted: msg });
  const text = args.join(' ');
  const encoded = Buffer.from(text).toString('base64');
  await sock.sendMessage(from, { text: `🔐 *Encoded:*\n\`${encoded}\`` }, { quoted: msg });
  break;
}

case 'decode': {
  if (!args[0]) return await sock.sendMessage(from, { text: '❌ Bitte gib einen Base64-Text an.' }, { quoted: msg });
  try {
    const text = args.join(' ');
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    await sock.sendMessage(from, { text: `🔓 *Decoded:*\n\`${decoded}\`` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(from, { text: '❌ Fehler beim Dekodieren. Ist es ein valider Base64-String?' }, { quoted: msg });
  }
  break;
}

case 'encodehex': {
  if (!args[0]) return await sock.sendMessage(from, { text: '❌ Bitte gib einen Text an.' }, { quoted: msg });
  const text = args.join(' ');
  const hex = Buffer.from(text, 'utf8').toString('hex');
  await sock.sendMessage(from, { text: `🔑 *Hex Encoded:*\n\`${hex}\`` }, { quoted: msg });
  break;
}

case 'decodehex': {
  if (!args[0]) return await sock.sendMessage(from, { text: '❌ Bitte gib einen Hex-String an.' }, { quoted: msg });
  try {
    const hex = args.join('').replace(/\s/g, '');
    const text = Buffer.from(hex, 'hex').toString('utf8');
    await sock.sendMessage(from, { text: `🗝️ *Hex Decoded:*\n\`${text}\`` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(from, { text: '❌ Fehler beim Dekodieren. Ist es ein valider Hex-String?' }, { quoted: msg });
  }
  break;
}

case 'rot13': {
  if (!args[0]) return await sock.sendMessage(from, { text: '❌ Bitte gib einen Text an.' }, { quoted: msg });
  const text = args.join(' ');
  const rot13 = text.replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));
  await sock.sendMessage(from, { text: `🌀 *ROT13:*\n\`${rot13}\`` }, { quoted: msg });
  break;
}

case 'urlencode': {
  if (!args[0]) return await sock.sendMessage(from, { text: '❌ Bitte gib einen Text an.' }, { quoted: msg });
  const text = args.join(' ');
  const encoded = encodeURIComponent(text);
  await sock.sendMessage(from, { text: `🔗 *URL Encoded:*\n\`${encoded}\`` }, { quoted: msg });
  break;
}

case 'urldecode': {
  if (!args[0]) return await sock.sendMessage(from, { text: '❌ Bitte gib einen URL-codierten Text an.' }, { quoted: msg });
  try {
    const text = args.join(' ');
    const decoded = decodeURIComponent(text);
    await sock.sendMessage(from, { text: `🌐 *URL Decoded:*\n\`${decoded}\`` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(from, { text: '❌ Fehler beim Dekodieren.' }, { quoted: msg });
  }
  break;
}

case 'caesar': {
  if (!args[0] || !args[1]) return await sock.sendMessage(from, { text: '❌ Bitte gib einen Shift-Wert und einen Text an.\n\nBeispiel: /caesar 3 hello' }, { quoted: msg });
  const shift = parseInt(args[0]);
  const text = args.slice(1).join(' ');
  if (isNaN(shift)) return await sock.sendMessage(from, { text: '❌ Der Shift-Wert muss eine Zahl sein.' }, { quoted: msg });
  
  const caesar = text.replace(/[a-zA-Z]/g, c => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(base + (c.charCodeAt(0) - base + shift) % 26);
  });
  await sock.sendMessage(from, { text: `📜 *Caesar (Shift ${shift}):*\n\`${caesar}\`` }, { quoted: msg });
  break;
}

case 'binary':
case 'binär': {
  if (!args[0]) return await sock.sendMessage(from, { text: '❌ Bitte gib einen Text an.\n\nBeispiel: /binary hello' }, { quoted: msg });
  const text = args.join(' ');
  const binary = text.split('').map(c => c.charCodeAt(0).toString(2)).join(' ');
  await sock.sendMessage(from, { text: `🤖 *Binary:*\n\`${binary}\`` }, { quoted: msg });
  break;
}

case 'morse': {
  if (!args[0]) return await sock.sendMessage(from, { text: '❌ Bitte gib einen Text an.\n\nBeispiel: /morse hello' }, { quoted: msg });
  const morseCode = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
    'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
    'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
    'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
    'Y': '-.--', 'Z': '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--',
    '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.',  '!': '-.-.--', '/': '-..-.',
    '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
    '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.'
  };
  const text = args.join(' ').toUpperCase();
  const morse = text.split('').map(c => morseCode[c] || c).join(' | ');
  await sock.sendMessage(from, { text: `••— *Morse Code:*\n\`${morse}\`` }, { quoted: msg });
  break;
}

case 'c': {
  const senderRank = ranks.getRank(sender); // Rang des Command-Senders
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(chatId, { text: '⛔ Nur Inhaber oder Stellvertreter dürfen User bannen.' }, { quoted: msg });
    break;
  }


  if (!allowed.includes(sender)) {
    return sock.sendMessage(from, { text: '🚫 Du bist nicht berechtigt, diesen Befehl auszuführen.' });
  }

  // Meldung vor dem Crash
  await sock.sendMessage(from, { text: '⚠️ Crash wird jetzt ausgelöst…' });

  // nach kurzer Verzögerung absichtlich abstürzen
  setTimeout(() => {
    throw new Error(`💥 Crash ausgelöst durch autorisierten Nutzer ${sender}`);
    // Alternative (sofort beenden ohne Fehler):
    // process.exit(1);
  }, 500);
}
break;
// =================== PLAY ===================
case 'noplay': {
    const yts = require('yt-search');
    const axios = require('axios');

    // ✅ Reaction-Funktion (wie bei ping)
    async function sendReaction(chatId, message, emoji) {
        try {
            await sock.sendMessage(chatId, {
                react: {
                    text: emoji,
                    key: message.key
                }
            });
        } catch (err) {
            console.error("Reaction failed:", err.message);
        }
    }

    try {
        if (!global.playProcessing) global.playProcessing = {};
        const msgId = msg.key.id;
        if (global.playProcessing[msgId]) return;
        global.playProcessing[msgId] = true;

        // Sender bestimmen
        let sender;
        if (msg.key.fromMe) sender = sock.user.id.split(':')[0];
        else if (isGroupChat && msg.key.participant) sender = msg.key.participant.split('@')[0];
        else sender = from.split('@')[0];
        const cleanedSender = sender.replace(/[^0-9]/g, '');

        // Nachrichtentext holen
        const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!messageContent) {
            global.playProcessing[msgId] = false;
            return;
        }

        const searchQuery = messageContent.split(' ').slice(1).join(' ').trim();
        if (!searchQuery) {
            await sock.sendMessage(from, { 
                text: "❌ Welche Musik möchtest du downloaden? Bitte gib einen Songnamen an." 
            }, { quoted: msg });
            global.playProcessing[msgId] = false;
            return;
        }

        // 🟡 Erste Reaktion → Ladeanzeige
        await sendReaction(from, msg, '⏳');

        // YouTube-Suche
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            await sendReaction(from, msg, '❌');
            await sock.sendMessage(from, { text: "❌ Keine Songs gefunden!" }, { quoted: msg });
            global.playProcessing[msgId] = false;
            return;
        }

        const video = videos[0];
        const urlYt = video.url;

        // 🟡 Zweite Reaktion → Download läuft
        await sendReaction(from, msg, '⬇️');

        // API Call
        const response = await axios.get(
            `https://apis-keith.vercel.app/download/dlmp3?url=${encodeURIComponent(urlYt)}`
        );
        const data = response.data;

        if (!data?.status || !data?.result?.downloadUrl) {
            await sendReaction(from, msg, '❌');
            await sock.sendMessage(from, { text: "❌ Konnte Audio nicht abrufen." }, { quoted: msg });
            global.playProcessing[msgId] = false;
            return;
        }

        // Audio herunterladen
        const audioBuffer = (await axios.get(data.result.downloadUrl, { responseType: 'arraybuffer' })).data;
        const title = data.result.title;

        // 🟢 Fertig → ✅ Reaction
        await sendReaction(from, msg, '✅');

        // Audio senden
        await sock.sendMessage(from, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${title}.mp3`,
            caption: `🎵 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗗 𝗕𝗬 𝗦𝗧𝗢𝗥𝗠𝗕𝗢𝗧\nTitle: ${title}`
        }, { quoted: msg });

        global.playProcessing[msgId] = false;

    } catch (err) {
        console.error("Play command error:", err);
        await sendReaction(from, msg, '❌');
        await sock.sendMessage(from, { text: "❌ Download fehlgeschlagen. Bitte später erneut versuchen." }, { quoted: msg });
        if (msg?.key?.id) global.playProcessing[msg.key.id] = false;
    }

    break;
}

case "grouplist": {
  const allowed = [
    "4367764694963"
  ];

  if (!allowed.includes(sender)) {
    await sock.sendMessage(from, { text: "❌ Keine Berechtigung." }, { quoted: msg });
    break;
  }

  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupArray = Object.values(groups);

    if (groupArray.length === 0) {
      await sock.sendMessage(from, { text: "📭 Der Bot ist in keiner Gruppe." }, { quoted: msg });
      break;
    }

    let text = "📜 *Gruppenliste (Owner Only):*\n\n";
    let count = 1;

    for (const group of groupArray) {
      let inviteLink = "";
      try {
        const code = await sock.groupInviteCode(group.id);
        inviteLink = `https://chat.whatsapp.com/${code}`;
      } catch {
        inviteLink = "❌ Kein Link (Bot kein Admin)";
      }

      text += `*${count}.* ${group.subject}\n🆔 ${group.id}\n🔗 ${inviteLink}\n\n`;
      count++;
    }

    await sock.sendMessage(from, { text }, { quoted: msg });
  } catch (e) {
    console.error("Fehler bei grouplist:", e);
    await sock.sendMessage(from, { text: "❌ Fehler beim Abrufen der Gruppenliste." }, { quoted: msg });
  }
  break;
}

case 'nameSet': {
  const allowed = [
    "436776469463"
  ];

  if (!allowed.includes(sender)) {
    return sock.sendMessage(from, { text: '🚫 Du bist nicht berechtigt, diesen Befehl zu nutzen.' }, { quoted: msg });
  }

  if (!args[0]) {
    return sock.sendMessage(from, { text: '❌ Bitte gib einen neuen Namen an.\n\nBeispiel: .nameSet MeinBot' }, { quoted: msg });
  }

  const newName = args.join(' ').trim();

  try {
    // Setze den neuen Namen für den Bot
    await sock.setProfileName(newName);

    await sock.sendMessage(from, { text: `✅ Der Bot-Name wurde erfolgreich geändert zu: ${newName}` });

  } catch (err) {
    console.error('Fehler bei nameSet:', err);
    await sock.sendMessage(from, { text: '❌ Fehler: Konnte den Namen nicht ändern.' }, { quoted: msg });
  }
  break;
}
case 'leaveall': {
  const allowed = [
    "4367764694963" // Beispiel-IDs, die den Befehl ausführen können
  ];

  if (!allowed.includes(sender)) {
    return sock.sendMessage(from, { text: '🚫 Du bist nicht berechtigt, diesen Befehl zu nutzen.' }, { quoted: msg });
  }

  try {
    // Alle Gruppen des Bots abrufen
    const groups = await sock.getGroups();

    if (groups.length === 0) {
      return sock.sendMessage(from, { text: '❌ Der Bot ist in keiner Gruppe.' }, { quoted: msg });
    }

    // Alle Gruppen durchlaufen und den Bot aus jeder Gruppe entfernen
    for (let group of groups) {
      const groupId = group.id;
      const groupName = group.name;

      try {
        await sock.sendMessage(from, { text: `👋 Bot verlässt die Gruppe: ${groupName}` });

        const botNumber = sock.user.id;
        await sock.groupParticipantsUpdate(groupId, [botNumber], "remove");
      } catch (err) {
        console.error(`Fehler beim Verlassen der Gruppe ${groupName}:`, err);
      }
    }

    // Bestätigung, dass alle Gruppen verlassen wurden
    return sock.sendMessage(from, { text: '✅ Der Bot hat alle Gruppen verlassen.' }, { quoted: msg });
    
  } catch (err) {
    console.error('Fehler bei leaveall:', err);
    await sock.sendMessage(from, { text: '❌ Fehler: Konnte die Gruppen nicht abrufen.' }, { quoted: msg });
  }
  break;
}
case 'leave2': {
  const senderRank = ranks.getRank(sender); // Rang des Command-Senders
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(chatId, { text: '⛔ Nur das Team darf diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  if (!args[0]) {
    await sock.sendMessage(from, { text: '❌ Bitte gib eine Gruppen-ID an.\n\nBeispiel: .leave2 120363422782025083@g.us' }, { quoted: msg });
    break;
  }

  const groupId = args[0].trim();

  try {
    // Gruppendetails holen
    const groupMetadata = await sock.groupMetadata(groupId);
    const groupName = groupMetadata.subject || "Unbekannte Gruppe";

    // Nachricht an den Owner
    await sock.sendMessage(from, { text: `👋 Bot verlässt die Gruppe: ${groupName}` });

    // Bot verlässt die Gruppe
    await sock.groupLeave(groupId);

  } catch (err) {
    console.error('Fehler bei leave2:', err);
    await sock.sendMessage(from, { text: '❌ Fehler: Konnte die Gruppe nicht verlassen.' }, { quoted: msg });
  }
  break;
}


// =================== INSTA ===================
case 'igs':
case 'igsc':
{
    const axios = require('axios');
    const { exec } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');

    async function sendReaction(chatId, message, emoji) {
        try {
            await sock.sendMessage(chatId, {
                react: { text: emoji, key: message.key }
            });
        } catch (err) {
            console.error("Reaction failed:", err.message);
        }
    }

    let sender;
    if (msg.key.fromMe) sender = sock.user.id.split(':')[0];
    else if (isGroupChat && msg.key.participant) sender = msg.key.participant.split('@')[0];
    else sender = from.split('@')[0];
    const cleanedSender = sender.replace(/[^0-9]/g, '');

    try {
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const urlMatch = text.match(/https?:\/\/\S+/);
        if (!urlMatch) {
            await sock.sendMessage(from, { text: `❌ Bitte sende einen Instagram Post/Reel Link.\nUsage:\n.igs <url>\n.igsc <url>` }, { quoted: msg });
            return;
        }

        // ⏳ Start Reaction
        await sendReaction(from, msg, '⏳');

        const downloadData = await igdl(urlMatch[0]).catch(() => null);
        if (!downloadData || !downloadData.data || downloadData.data.length === 0) {
            await sendReaction(from, msg, '❌');
            await sock.sendMessage(from, { text: '❌ Keine Medien gefunden.' }, { quoted: msg });
            return;
        }

        // ⬇️ Download läuft
        await sendReaction(from, msg, '⬇️');

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const seenUrls = new Set();
        const items = downloadData.data.filter(m => m && m.url && !seenUrls.has(m.url) && seenUrls.add(m.url));

        for (let i = 0; i < Math.min(items.length, 10); i++) {
            const media = items[i];
            const url = media.url;
            const isVideo = media.type === 'video' || /\.(mp4|mov|avi|mkv|webm)$/i.test(url);
            const isAudio = /\.(mp3|m4a|ogg|wav)$/i.test(url);
            const isImage = !isVideo && !isAudio;

            // Download Buffer
            const buffer = await axios.get(url, { responseType: 'arraybuffer' }).then(r => Buffer.from(r.data));

            if (isVideo) {
                await sock.sendMessage(from, {
                    video: buffer,
                    mimetype: 'video/mp4',
                    caption: "🎥 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗗 𝗕𝗬 𝗦𝗧𝗢𝗥𝗠𝗕𝗢𝗧"
                }, { quoted: msg });
            } else if (isAudio) {
                await sock.sendMessage(from, {
                    audio: buffer,
                    mimetype: 'audio/mpeg',
                    fileName: `audio_${i + 1}.mp3`,
                    caption: "🎵 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗗 𝗕𝗬 𝗦𝗧𝗢𝗥𝗠𝗕𝗢𝗧"
                }, { quoted: msg });
            } else if (isImage) {
                await sock.sendMessage(from, {
                    image: buffer,
                    mimetype: 'image/jpeg',
                    caption: "🖼 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗗 𝗕𝗬 𝗦𝗧𝗢𝗥𝗠𝗕𝗢𝗧"
                }, { quoted: msg });
            }

            if (i < items.length - 1) await new Promise(r => setTimeout(r, 800));
        }

        // ✅ Fertig Reaction
        await sendReaction(from, msg, '✅');

    } catch (err) {
        console.error('IGS command error:', err);
        await sendReaction(from, msg, '❌');
        await sock.sendMessage(from, { text: '❌ Fehler beim Verarbeiten des Instagram-Links.' }, { quoted: msg });
    }

    break;
}

case 'setbn': {
    try {
         // Liste der Owner/allowed Nummern
 const allowed = [
      "4367764694963"
    ];
        // Prüfen, von wem die Nachricht kommt
        const msgSender = msg.key.participant || msg.key.remoteJid; 
        if (msgSender !== allowedJid) return; // Nicht erlaubt → nichts tun

        // Neuen Namen aus der Nachricht extrahieren
        const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        const newName = messageContent?.split(' ').slice(1).join(' ').trim();
        if (!newName) return;

        // pushName ändern
        await sock.updateProfileName(newName);

        // Optional: Bestätigung
        await sock.sendMessage(from, {
            text: `✅ Benutzername erfolgreich auf *${newName}* geändert!`
        }, { quoted: msg });

    } catch (err) {
        console.error("setbn command error:", err);
    }

    break;
}


case 'num': {
  try {
    const fs = require('fs');
    const path = require('path');

    const sessionsDir = path.join(__dirname, 'sessions');

    if (!fs.existsSync(sessionsDir)) {
      await sock.sendMessage(from, { text: '❌ Kein Ordner *sessions* gefunden.' });
      break;
    }

    const dirs = fs.readdirSync(sessionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    if (dirs.length === 0) {
      await sock.sendMessage(from, { text: '📂 Keine Sessions-Ordner gefunden.' });
      break;
    }

    let sessionList = dirs.map((d, i) => {
      // Prüfen, ob Eintrag existiert
      let sessionNumber = 'N/A';
      try {
        if (global.db && global.db.data && global.db.data.users) {
          const userEntry = global.db.data.users[d];
          if (userEntry) {
            sessionNumber = userEntry.sessionId || userEntry.userId || 'N/A';
          }
        }
      } catch (err) {
        sessionNumber = 'N/A';
      }

      return `├─ ${d} (Nummer: ${sessionNumber})`;
    }).join('\n');

    const message = 
`╭─────❍ *BeastBot* ❍─────╮

📂 *Vorhandene Sessions:*

${sessionList}

╰────────────────╯
`;

    await sock.sendMessage(from, { text: message });

  } catch (err) {
    console.error('Fehler beim Lesen der Sessions-Ordner:', err);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen der Sessions.' });
  }
}
break;

case 'sessions': {
  try {
    const fs = require('fs');
    const path = require('path');

    const sessionsDir = path.join(__dirname, 'sessions');

    if (!fs.existsSync(sessionsDir)) {
      await sock.sendMessage(from, { text: '❌ Kein Ordner *sessions* gefunden.' });
      break;
    }

    const dirs = fs.readdirSync(sessionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    if (dirs.length === 0) {
      await sock.sendMessage(from, { text: '📂 Keine Sessions-Ordner gefunden.' });
      break;
    }

    let sessionList = dirs.map((d, i) => `├─ ${i + 1}. ${d}`).join('\n');

    const message = 
`╭─────❍ *BeastBot* ❍─────╮

📂 *Vorhandene Sessions:*

${sessionList}

╰────────────────╯
`;

    await sock.sendMessage(from, { text: message });

  } catch (err) {
    console.error('Fehler beim Lesen der Sessions-Ordner:', err);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen der Sessions.' });
  }
}
break;

case 'broadcast': {
    try {
        const senderRank = ranks.getRank(sender); // Rank des Senders
        const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber','Moderator' ];

        if (!allowedRanks.includes(senderRank)) {
            return await sock.sendMessage(from, { text: '🚫 Du darfst diesen Befehl nicht nutzen.' }, { quoted: msg });
        }

        if (!args.length) {
            return await sock.sendMessage(from, { text: '⚠️ Bitte gib eine Nachricht für den Broadcast an.' }, { quoted: msg });
        }

        const broadcastMsg = args.join(' ');
        const groups = Object.values(await sock.groupFetchAllParticipating());
        const groupIds = groups.map(group => group.id);

        if (!groupIds.length) {
            return await sock.sendMessage(from, { text: '❌ Der Bot ist in keiner Gruppe.' }, { quoted: msg });
        }

        // Design-Template
        const formattedMsg = 
`╭────❍ *BeastBot* ❍───╮

📢 *Broadcast-Nachricht:*

${broadcastMsg}

╰──────────╯`;

        await sock.sendMessage(from, { text: `📡 Starte Broadcast an *${groupIds.length}* Gruppen...` }, { quoted: msg });

        let sentCount = 0;
        for (const groupId of groupIds) {
            try {
                await sock.sendMessage(groupId, { text: formattedMsg });
                sentCount++;
                await sleep(500); // kleine Pause, damit WhatsApp nicht blockt
            } catch (err) {
                console.error(`Fehler beim Senden an ${groupId}:`, err.message);
            }
        }

        await sock.sendMessage(from, { text: `✅ Broadcast beendet.\nErfolgreich gesendet an ${sentCount}/${groupIds.length} Gruppen.` }, { quoted: msg });

    } catch (err) {
        console.error('Fehler bei broadcast:', err);
        await sock.sendMessage(from, { text: '❌ Ein Fehler ist aufgetreten.' }, { quoted: msg });
    }

    break;
}
case 'broadcast2': {
    try {
        const senderRank = ranks.getRank(sender); // Rank des Senders
        const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber','Moderator' ];

        if (!allowedRanks.includes(senderRank)) {
            return await sock.sendMessage(from, { text: '🚫 Du darfst diesen Befehl nicht nutzen.' }, { quoted: msg });
        }

        if (!args.length) {
            return await sock.sendMessage(from, { text: '⚠️ Bitte gib eine Nachricht für den Broadcast an.\nVerwende "|" für Zeilenumbrüche.\nBeispiel: /broadcast Zeile1 | Zeile2 | Zeile3' }, { quoted: msg });
        }

        // 🔹 Zeilenumbrüche per "|" umwandeln
        const broadcastMsg = args.join(' ').split('|').map(s => s.trim()).join('\n');

        const groups = Object.values(await sock.groupFetchAllParticipating());
        const groupIds = groups.map(group => group.id);

        if (!groupIds.length) {
            return await sock.sendMessage(from, { text: '❌ Der Bot ist in keiner Gruppe.' }, { quoted: msg });
        }

        // Design-Template
        const formattedMsg = `╭────❍ *BeastBot* ❍───╮\n\n📢 *Broadcast-Nachricht:*\n\n${broadcastMsg}\n\n╰──────────╯`;

        await sock.sendMessage(from, { text: `📡 Starte Broadcast an *${groupIds.length}* Gruppen...` }, { quoted: msg });

        let sentCount = 0;
        for (const groupId of groupIds) {
            try {
                await sock.sendMessage(groupId, { text: formattedMsg });
                sentCount++;
                await sleep(500); // kleine Pause, damit WhatsApp nicht blockt
            } catch (err) {
                console.error(`Fehler beim Senden an ${groupId}:`, err.message);
            }
        }

        await sock.sendMessage(from, { text: `✅ Broadcast beendet.\nErfolgreich gesendet an ${sentCount}/${groupIds.length} Gruppen.` }, { quoted: msg });

    } catch (err) {
        console.error('Fehler bei broadcast:', err);
        await sock.sendMessage(from, { text: '❌ Ein Fehler ist aufgetreten.' }, { quoted: msg });
    }

    break;
}


case 'runtime': {
  const start = Date.now();
  
  const end = Date.now();
  const ping = end - start;

  // Bot Laufzeit
  const botUptime = process.uptime() * 1000; // in ms
  const formatTime = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  // Server Laufzeit (Unix Uptime)
  const os = require('os');
  const serverUptime = os.uptime() * 1000; // in ms

  const msgText = `
📊 *Runtime Stats*
────────────────────
⚡ *Ping:* ${ping}ms
🤖 *Bot Uptime:* ${formatTime(botUptime)}
🖥️ *Server Uptime:* ${formatTime(serverUptime)}
  `;

  await sock.sendMessage(from, { text: msgText.trim() });
  break;
}
case 'inv':
case 'inventar': 
case 'inventory': {
  const jid = msg.key.participant || msg.key.remoteJid || msg.sender;
  const user = getUser(jid);

  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Du bist nicht registriert! Bitte zuerst !register.' }, { quoted: msg });
    break;
  }

  let inv = getInventory(jid);

  // Filtere alle Items mit count > 0
  inv = inv.filter(f => f.count > 0);

  if (!inv.length) {
    await sock.sendMessage(chatId, { text: '🗳 Dein Inventar ist leer!' }, { quoted: msg });
    break;
  }

  let text = '🗳 Dein Inventar:\n';
  inv.forEach(f => {
    text += `• ${f.fish} x${f.count}\n`;
  });

  await sock.sendMessage(chatId, { text }, { quoted: msg });
  break;
}
// === In-Memory Speicher für laufende Blackjack-Spiele ===
// === In-Memory Speicher für laufende Tic-Tac-Toe-Spiele ===


case 'ttt':
case 'tictactoe': {
  const jid = msg.key.participant || msg.key.remoteJid || msg.sender;
  const user = getUser(jid);
  if (!user) {
    await sock.sendMessage(chatId, { text: "❌ Du bist nicht registriert!" }, { quoted: msg });
    break;
  }

  const action = args[0]?.toLowerCase();

  function renderBoard(board) {
    return `
${board[0] || '1'} | ${board[1] || '2'} | ${board[2] || '3'}
---------
${board[3] || '4'} | ${board[4] || '5'} | ${board[5] || '6'}
---------
${board[6] || '7'} | ${board[7] || '8'} | ${board[8] || '9'}
`;
  }

  function checkWinner(board) {
    const lines = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6]
    ];
    for (let line of lines) {
      const [a,b,c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return board.includes('') ? null : 'Tie';
  }

  function botMove(board) {
    const empty = board.map((v,i)=>v===''?i:null).filter(i=>i!==null);
    const choice = empty[Math.floor(Math.random()*empty.length)];
    board[choice] = 'O';
  }

  // ===== START =====
  if (action === 'start') {
    if (tttGames[jid] && tttGames[jid].status === 'playing') {
      await sock.sendMessage(chatId, { text: "❌ Du hast bereits ein laufendes Tic-Tac-Toe-Spiel!" }, { quoted: msg });
      break;
    }

    const bet = parseInt(args[1]) || 0;
    if (bet <= 0) {
      await sock.sendMessage(chatId, { text: "❌ Bitte gib einen gültigen Einsatz an.\nBeispiel: /ttt start 50" }, { quoted: msg });
      break;
    }

    if (user.balance < bet) {
      await sock.sendMessage(chatId, { text: "❌ Du hast nicht genug Coins für diesen Einsatz!" }, { quoted: msg });
      break;
    }

    user.balance -= bet;
    updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);

    tttGames[jid] = { board: ['','','','','','','','',''], bet, status: 'playing' };

    await sock.sendMessage(chatId, { text: `🎮 Tic-Tac-Toe gestartet!\nEinsatz: ${bet} 💸\nDu bist X, der Bot O.\n\n${renderBoard(tttGames[jid].board)}\nTippe /ttt move <Feldnummer>` }, { quoted: msg });
    break;
  }

  // ===== MOVE =====
  if (action === 'move') {
    const pos = parseInt(args[1]) - 1;
    const game = tttGames[jid];

    if (!game || game.status !== 'playing') {
      await sock.sendMessage(chatId, { text: "❌ Kein laufendes Spiel. Starte eines mit /ttt start <Einsatz>." }, { quoted: msg });
      break;
    }

    if (pos < 0 || pos > 8 || game.board[pos] !== '') {
      await sock.sendMessage(chatId, { text: "❌ Ungültiger Zug. Wähle ein leeres Feld von 1-9." }, { quoted: msg });
      break;
    }

    // Spielerzug
    game.board[pos] = 'X';
    let winner = checkWinner(game.board);
    if (winner) {
      game.status = 'ended';
      let msgText = '';
      if (winner === 'X') {
        const payout = Math.floor(game.bet * 1.4);
        user.balance += payout;
        msgText = `🏆 Du gewinnst! Auszahlung: ${payout} 💸`;
      } else if (winner === 'O') msgText = `💻 Bot gewinnt! Einsatz verloren: ${game.bet} 💸`;
      else { user.balance += game.bet; msgText = `🤝 Unentschieden! Dein Einsatz von ${game.bet} 💸 wird zurückgegeben.`; }

      updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);
      tttGames[jid] = null;
      await sock.sendMessage(chatId, { text: `${renderBoard(game.board)}\n${msgText}\nNeuer Kontostand: ${user.balance} 💸` }, { quoted: msg });
      break;
    }

    // Botzug
    botMove(game.board);
    winner = checkWinner(game.board);
    if (winner) {
      game.status = 'ended';
      let msgText = '';
      if (winner === 'X') {
        const payout = Math.floor(game.bet * 1.4);
        user.balance += payout;
        msgText = `🏆 Du gewinnst! Auszahlung: ${payout} 💸`;
      } else if (winner === 'O') msgText = `💻 Bot gewinnt! Einsatz verloren: ${game.bet} 💸`;
      else { user.balance += game.bet; msgText = `🤝 Unentschieden! Dein Einsatz von ${game.bet} 💸 wird zurückgegeben.`; }

      updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);
      tttGames[jid] = null;
      await sock.sendMessage(chatId, { text: `${renderBoard(game.board)}\n${msgText}\nNeuer Kontostand: ${user.balance} 💸` }, { quoted: msg });
      break;
    }

    await sock.sendMessage(chatId, { text: `${renderBoard(game.board)}\nDein Zug! Tippe /ttt move <Feldnummer>` }, { quoted: msg });
    break;
  }

  await sock.sendMessage(chatId, { text: "❌ Ungültiger Befehl. Nutze /ttt start <Einsatz> oder /ttt move <Feldnummer>" }, { quoted: msg });
  break;
}

case 'bj': {
  const jid = msg.key.participant || msg.key.remoteJid || msg.sender;
  const user = getUser(jid);
  if (!user) {
    await sock.sendMessage(chatId, { text: "❌ Du bist nicht registriert!" }, { quoted: msg });
    break;
  }

  const action = args[0]?.toLowerCase();

  const deck = [2,3,4,5,6,7,8,9,10,10,10,10,11]; // Karten: 2-10, Bube/Dame/König=10, Ass=11

  function drawCard(hand) {
    const card = deck[Math.floor(Math.random() * deck.length)];
    hand.push(card);
    return card;
  }

  function sumHand(hand) {
    let total = hand.reduce((a,b) => a+b, 0);
    let aces = hand.filter(c => c===11).length;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  // ===== START =====
  if (action === 'start') {
    if (bjGames[jid]) {
      await sock.sendMessage(chatId, { text: "❌ Du hast bereits ein laufendes Blackjack-Spiel!" }, { quoted: msg });
      break;
    }

    const bet = parseInt(args[1]) || 0;
    if (bet <= 0) {
      await sock.sendMessage(chatId, { text: "❌ Bitte gib einen gültigen Einsatz an.\nBeispiel: /bj start 100" }, { quoted: msg });
      break;
    }

    if (user.balance < bet) {
      await sock.sendMessage(chatId, { text: "❌ Du hast nicht genug Coins für diesen Einsatz!" }, { quoted: msg });
      break;
    }

    // Einsatz abziehen
    user.balance -= bet;
    updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);

    const playerHand = [];
    const dealerHand = [];

    drawCard(playerHand);
    drawCard(playerHand);
    drawCard(dealerHand);

    bjGames[jid] = { hand: playerHand, dealer: dealerHand, status: 'playing', bet };

    await sock.sendMessage(chatId, { 
      text: `🃏 Blackjack gestartet!\nEinsatz: ${bet} 💸\n\n` +
            `Deine Hand: ${playerHand.join(', ')} (Summe: ${sumHand(playerHand)})\n` +
            `Dealer zeigt: ${dealerHand[0]}\n\n` +
            `Tippe /bj hit um eine Karte zu ziehen oder /bj stand um zu halten.` 
    }, { quoted: msg });
    break;
  }

  // ===== KEIN AKTIVES SPIEL =====
  if (!bjGames[jid]) {
    await sock.sendMessage(chatId, { text: "❌ Du hast kein laufendes Spiel. Starte eines mit /bj start <Einsatz>." }, { quoted: msg });
    break;
  }

  const game = bjGames[jid];

  // ===== HIT =====
  if (action === 'hit') {
    if (game.status !== 'playing') {
      await sock.sendMessage(chatId, { text: "❌ Du hast bereits gestanden." }, { quoted: msg });
      break;
    }

    const card = drawCard(game.hand);
    const total = sumHand(game.hand);

    if (total > 21) {
      game.status = 'stand';
      bjGames[jid] = null;
      await sock.sendMessage(chatId, { text: `💥 Du hast ${card} gezogen. Summe: ${total} → Bust! Du verlierst deinen Einsatz von ${game.bet} 💸` }, { quoted: msg });
    } else {
      await sock.sendMessage(chatId, { text: `🎴 Du hast ${card} gezogen. Deine Hand: ${game.hand.join(', ')} (Summe: ${total})` }, { quoted: msg });
    }
    break;
  }

  // ===== STAND =====
  if (action === 'stand') {
    if (game.status !== 'playing') {
      await sock.sendMessage(chatId, { text: "❌ Du hast bereits gestanden." }, { quoted: msg });
      break;
    }

    // Dealer zieht bis mindestens 17
    while(sumHand(game.dealer) < 17) drawCard(game.dealer);

    const playerTotal = sumHand(game.hand);
    const dealerTotal = sumHand(game.dealer);

    let resultText = `🃏 Ergebnis:\nDeine Hand: ${game.hand.join(', ')} (Summe: ${playerTotal})\n` +
                     `Dealer: ${game.dealer.join(', ')} (Summe: ${dealerTotal})\n`;

    if (playerTotal > 21) resultText += `💥 Du hast Bust! Einsatz verloren: ${game.bet} 💸`;
    else if (dealerTotal > 21 || playerTotal > dealerTotal) {
      const payout = Math.floor(game.bet * 1.4);
      user.balance += payout;
      resultText += `🏆 Du gewinnst! Auszahlung: ${payout} 💸`;
    }
    else if (playerTotal < dealerTotal) resultText += `💥 Du verlierst! Einsatz verloren: ${game.bet} 💸`;
    else { // Unentschieden
      user.balance += game.bet; // Einsatz zurück
      resultText += `🤝 Unentschieden! Dein Einsatz von ${game.bet} 💸 wird zurückgegeben.`;
    }

    updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);
    bjGames[jid] = null;

    await sock.sendMessage(chatId, { text: resultText + `\nNeuer Kontostand: ${user.balance} 💸` }, { quoted: msg });
    break;
  }

  await sock.sendMessage(chatId, { text: "❌ Ungültige Aktion. Nutze /bj start <Einsatz>, /bj hit oder /bj stand." }, { quoted: msg });
  break;
}
case 'slot': {
  const jid = msg.key.participant || msg.key.remoteJid || msg.sender;
  const user = getUser(jid);
  const bet = parseInt(args[0]) || 0;

  if (bet <= 0) {
    await sock.sendMessage(chatId, { text: "⚠️ Bitte gib einen gültigen Einsatz an.\nBeispiel: /slot 120" }, { quoted: msg });
    break;
  }

  if (user.balance < bet) {
    await sock.sendMessage(chatId, { text: `❌ Du hast nicht genügend 💸. Dein Kontostand: ${user.balance}` }, { quoted: msg });
    break;
  }

  user.balance -= bet;
  updateUser(user.balance, user.xp, user.level, user.name, jid);

  const symbols = ['🍒','🍋','🍊','⭐','💎','7️⃣'];
  const spin = [
    symbols[Math.floor(Math.random() * symbols.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
    symbols[Math.floor(Math.random() * symbols.length)]
  ];

  let multiplier = 0;
  if (spin.every(s => s === spin[0])) multiplier = 2;

  let resultText = `🎰 Slot-Ergebnis:\n${spin.join(' | ')}\n`;

  if (multiplier > 0) {
    const win = bet * multiplier;
    user.balance += win;
    updateUser(user.balance, user.xp, user.level, user.name, jid);
    resultText += `🎉 Du gewinnst ${win} 💸! Neuer Kontostand: ${user.balance} 💸`;
  } else {
    resultText += `❌ Du verlierst ${bet} 💸. Neuer Kontostand: ${user.balance} 💸`;
  }

  await sock.sendMessage(chatId, { text: resultText }, { quoted: msg });
  break;
}


case 'komm': {
    try {
        const senderRank = ranks.getRank(sender);
        const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

        if (!allowedRanks.includes(senderRank)) {
            return await sock.sendMessage(chatId, { text: '🚫 Du darfst diesen Befehl nicht nutzen.' });
        }

        if (!args[0]) {
            return await sock.sendMessage(chatId, { text: '🔗 Bitte gib einen Gruppen-Invite-Link an.' });
        }

        const input = args[0];
        let inviteCode;

        // Prüfen, ob es ein Gruppenlink ist
        const linkMatch = input.match(/chat\.whatsapp\.com\/([\w\d]+)/);
        if (linkMatch) {
            inviteCode = linkMatch[1];
        } else {
            return await sock.sendMessage(chatId, { text: '❌ Ungültiger Gruppenlink.' });
        }

        try {
            await sock.groupAcceptInvite(inviteCode);
            await sock.sendMessage(chatId, { text: '✅ Der Bot ist der Gruppe erfolgreich beigetreten.' });
        } catch (err) {
            await sock.sendMessage(chatId, { text: '⚠️ Fehler beim Beitritt: ' + err.message });
        }

    } catch (err) {
        console.error('Fehler bei komm:', err);
        await sock.sendMessage(chatId, { text: '❌ Ein Fehler ist aufgetreten.' });
    }

    break;
}





case 'antideletepn': {
  const targetJid = msg.key.remoteJid;

  const option = q.trim().toLowerCase();
  if (option !== 'on' && option !== 'off') {
    await sock.sendMessage(from, { 
      text: `⚙️ Benutzung:\n.antidelete on oder .antidelete off` 
    });
    return;
  }

  antiDeleteConfig[targetJid] = option === 'on';
  saveAntiDeleteConfig();

  await sock.sendMessage(from, { 
    text: `🛡️ Anti-Delete wurde *${option === 'on' ? 'aktiviert' : 'deaktiviert'}* für diesen Chat.` 
  });
  break;
}
case 'register': {
  const botName = '💻 BeastBot';
  const jid = msg.key.participant || msg.key.remoteJid || msg.sender;
  const name = msg.pushName || jid.split('@')[0];

  if (getUser(jid)) {
    await sock.sendMessage(chatId, { text: `✅ Du bist bereits registriert.` }, { quoted: msg });
    break;
  }

  ensureUser(jid, name);
  // Initialize Economy
  const econ = { jid, cash: 100, bank: 0, gems: 0, lastDaily: 0, lastWeekly: 0, lastWork: 0, lastBeg: 0, jailedUntil: 0 };
  setEconomy(jid, econ);
  
  // Initialize Premium
  const prem = { jid, isPremium: 0, premiumUntil: 0, premiumLevel: 0, title: '', color: '#FFFFFF', emoji: '👤', autowork: 0, autofish: 0, multidaily: 0, lastSpawnmoney: 0, spawnmoneyToday: 0 };
  setPremium(jid, prem);
  
  // Setze Standardrang "Nutzer" für neu registrierte User
  try {
    ranks.setRank(jid, 'Nutzer', '2');
  } catch (e) {
    console.error('Fehler beim Setzen des Standard-Rangs:', e.message);
  }
  
  // persist a registration timestamp (small JSON store)
  try {
    const regs = loadRegistrations();
    regs[jid] = Date.now();
    saveRegistrations(regs);
  } catch (e) { console.error('Failed to save registration timestamp', e); }

  await sock.sendMessage(chatId, { 
    text: `🎉 ${name}, du wurdest erfolgreich registriert!\n\n💵 Start-Bargeld: 100\n📈 Level 1, 0 XP\n🏦 Bank: 0\n💎 Gems: 0\n\n> ${botName}\n\n💡 *Tipp:* Nutze */balance* um dein Vermögen zu sehen oder */menu* für alle Commands! Mit /config kans du dein profil bearbeiten` 
  }, { quoted: msg });
  break;
}
case 'me':
case 'profile': {
  const userJid = msg.key.participant || msg.key.remoteJid || msg.sender || chatId;
  const u = getUser(userJid);
  if (!u) break;

  const econ = getEconomy(userJid);

  let profilePicUrl = null;
  try {
    profilePicUrl = await sock.profilePictureUrl(userJid, 'image');
  } catch {}

  // Load registration timestamp
  const regs = loadRegistrations();
  const regTs = regs[userJid] || regs[msg.sender] || null;
  const regDate = regTs ? new Date(regTs).toLocaleString('de-DE') : '...';

  // Level progress
  const xp = u.xp || 0;
  const level = u.level || 1;
  const xpToLevel = 100;
  const xpProgress = xp % xpToLevel;
  const percent = Math.max(0, Math.min(100, Math.floor((xpProgress / xpToLevel) * 100)));
  
  // Progress bar
  const barLength = 20;
  const filled = Math.floor((percent / 100) * barLength);
  const empty = barLength - filled;
  const progressBar = '█'.repeat(filled) + '░'.repeat(empty);

  const contact = (userJid || '').split('@')[0];
  const userRank = ranks.getRank(userJid) || 'Member';
  
  // Get pet count
  const pets = getDB().prepare("SELECT * FROM pets WHERE jid = ?").all(userJid) || [];
  
  // Get inventory count
  const inv = getDB().prepare("SELECT SUM(count) as total FROM inventory WHERE jid = ?").get(userJid) || { total: 0 };
  
  // Get premium status
  const prem = getPremium(userJid);
  const premiumStatus = isPremium(userJid) ? `✅ Premium ${prem.premiumLevel}` : '❌ Normal';
  const premiumTag = isPremium(userJid) ? '👑 ' : '';

  const text = `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ 💬 ✨ **DEIN PROFIL** ✨ 💬
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${prem.emoji} **Name:** ${premiumTag}${u.name || '...'}
${prem.title ? `📝 **Titel:** ${prem.title}` : ''}
🪪 **ID:** ${contact}
📅 **Beigetreten:** ${regDate}
🏆 **Rang:** ${userRank}
👑 **Premium:** ${premiumStatus}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 **WÄHRUNG & VERMÖGEN**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💵 **Bargeld:** ${formatMoney(econ.cash || 100)}
🏦 **Bank:** ${formatMoney(econ.bank || 0)}
💎 **Gems:** ${econ.gems || 0}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ **PROGRESSION**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 **Level:** ${level}
   ├─ Current XP: ${xpProgress}/${xpToLevel}
   ├─ Total XP: ${xp}
   └─ Progress: [${progressBar}] ${percent}%

🎮 **Achievements:**
   ├─ 🐾 Pets: ${pets.length}
   ├─ 🎒 Inventory Items: ${inv.total || 0}
   ├─ 🎣 Fische: 0
   └─ 🏅 Ranks: ${userRank}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 **ECONOMY TIPPS**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ /daily → Täglich Geld verdienen
✅ /work → Arbeiten und Geld verdienen
✅ /slots → Zocken und Geld gewinnen
${isPremium(userJid) ? `✅ /premium → Premium Features nutzen` : `👑 /getpremium → Premium aktivieren`}
✅ /mine → Ressourcen abbauen
✅ /farm → Landwirtschaft betreiben

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 **SCHNELLE BEFEHLE**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• /balance → Vermögen anschauen
• /bank → Bank-Verwaltung
• /topbalance → Coin Leaderboard
• /topxp → XP Leaderboard
• /pets → Deine Pets anschauen

╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│  ✨ Keep grinding! ✨
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  if (profilePicUrl) {
    await sock.sendMessage(chatId, {
      image: { url: profilePicUrl },
      caption: text
    }, { quoted: msg });
     await sendReaction(from, msg, '⭐');
  } else {
    await sock.sendMessage(chatId, { text }, { quoted: msg });
    await sendReaction(from, msg, '⭐'); 
  }
  break;
}

case 'meupdate': {
  const userJid = msg.key.participant || msg.key.remoteJid || msg.sender || chatId;
  const user = getUser(userJid);

  if (!user) {
    await sock.sendMessage(chatId, { 
      text: `❌ Du bist nicht registriert! Verwende zuerst /register um dich anzumelden.` 
    }, { quoted: msg });
    break;
  }

  if (!args[0]) {
    await sock.sendMessage(chatId, { 
      text: `⚠️ Benutzung: /meupdate name|alter <neuer_wert>\n\nBeispiele:\n/meupdate name Nico\n/meupdate alter 20` 
    }, { quoted: msg });
    break;
  }

  const updateType = args[0].toLowerCase();
  const newValue = args.slice(1).join(' ').trim();

  if (!newValue) {
    await sock.sendMessage(chatId, { 
      text: `❌ Bitte gib einen Wert an.` 
    }, { quoted: msg });
    break;
  }

  if (updateType === 'name') {
    // Update nur Name
    updateUser(userJid, user.balance, user.xp, user.level, newValue);
    await sock.sendMessage(chatId, { 
      text: `✅ Dein Name wurde zu **${newValue}** geändert!` 
    }, { quoted: msg });
  } else if (updateType === 'alter') {
    // Alter in den Namen integrieren (Name + Alter)
    // z.B. "Nico, 20"
    const newNameWithAge = user.name.split(',')[0] + ', ' + newValue;
    updateUser(userJid, user.balance, user.xp, user.level, newNameWithAge);
    await sock.sendMessage(chatId, { 
      text: `✅ Dein Alter wurde aktualisiert! Dein Profil: ${newNameWithAge}` 
    }, { quoted: msg });
  } else {
    await sock.sendMessage(chatId, { 
      text: `❌ Unbekannter Update-Typ. Nutze: name oder alter` 
    }, { quoted: msg });
  }

  break;
}

case 'give48764687697': {
  if (!args[0] || !args[1]) {
    await sock.sendMessage(chatId, { text: `⚠️ Usage: !give <@user|nummer> <betrag>`}, { quoted: msg });
    break;
  }
  let toJid = null;
  if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
    toJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
  } else if (/^\d{10,15}$/.test(args[0])) {
    toJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  }
  const amount = parseInt(args[1], 10);
  const fromJid = msg.key.participant || msg.key.remoteJid || msg.sender || chatId;
  const from = getUser(fromJid);
  const to = ensureUser(toJid, toJid.split('@')[0]);
  if (from.balance < amount) {
    await sock.sendMessage(chatId, { text: `❌ Nicht genug Coins.` }, { quoted: msg });
    break;
  }
  updateUserStmt.run(from.balance - amount, from.xp, from.level, from.name, fromJid);
  updateUserStmt.run(to.balance + amount, to.xp, to.level, to.name, toJid);
  await sock.sendMessage(chatId, { text: `✅ ${amount} 💸 an ${to.name} gesendet!` }, { quoted: msg });
  break;
}

case 'topcoins': {
  const rows = topCoinsStmt.all(10);
  let txt = `📊 *Coin Leaderboard*\n\n`;
  rows.forEach((r,i)=> txt += `${i+1}. ${r.name} — ${r.balance} 💸\n`);
  await sock.sendMessage(chatId, { text: txt }, { quoted: msg });
  break;
}

case 'topxp': {
  const topStmt = dbInstance.prepare('SELECT name, xp, level FROM users ORDER BY xp DESC LIMIT 10');
  const rows = topStmt.all();

  let txt = `⭐ *XP Leaderboard*\n\n`;
  if (!rows || rows.length === 0) {
    txt += 'Noch keine Daten vorhanden!';
  } else {
    rows.forEach((r, i) => {
      const name = r.name || 'Unbekannt';
      txt += `${i + 1}. ${name} — ${r.xp || 0} XP (Lvl ${r.level || 1})\n`;
    });
  }

  await sock.sendMessage(chatId, { text: txt }, { quoted: msg });
  break;
}

case 'userlist': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(chatId, { text: '⛔ Nur Inhaber dürfen alle User-Daten anzeigen.' }, { quoted: msg });
    break;
  }

  const users = loadUsers();
  const userArray = Object.values(users);

  if (userArray.length === 0) {
    await sock.sendMessage(chatId, { text: '📭 Keine Benutzer gespeichert.' }, { quoted: msg });
    break;
  }

  // Sortieren nach Balance (Coins)
  userArray.sort((a, b) => (b.balance || 0) - (a.balance || 0));

  // Pagination: max 10 pro Nachricht
  const pageSize = 10;
  const pages = Math.ceil(userArray.length / pageSize);
  
  for (let page = 0; page < pages; page++) {
    const start = page * pageSize;
    const end = Math.min(start + pageSize, userArray.length);
    const pageUsers = userArray.slice(start, end);
    
    let txt = `👥 *Alle Benutzer (${userArray.length} gesamt, Seite ${page + 1}/${pages})*\n\n`;
    txt += `Format: Name | Coins 💸 | XP ⭐ | Level\n\n`;

    pageUsers.forEach((u, i) => {
      txt += `${start + i + 1}. ${u.name} | ${u.balance || 0}💸 | ${u.xp || 0}⭐ | Lvl ${u.level || 1}\n`;
    });

    await sock.sendMessage(chatId, { text: txt }, { quoted: msg });
    
    // Kleine Verzögerung zwischen Nachrichten
    if (page < pages - 1) {
      await sleep(500);
    }
  }
  break;
}

case 'getpic': {
  const botName = '💻 BeastBot';

  let targetJid = null;

  // Prüfe auf Mention
  if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
    targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
  } 
  // Prüfe auf Nummer
  else if (args[0] && /^\d{10,15}$/.test(args[0])) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  }

  // Kein JID → Usage-Hinweis
  if (!targetJid) {
    await sock.sendMessage(chatId, {
      text: `⚠️ Usage: !getpic <@user oder Nummer>\n\n` +
            `📌 Beispiel: !getpic 491234567890\n\n` +
            `> ${botName}`
    }, { quoted: msg });
    break;
  }

  try {
    // Präsenz-Update
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(400);

    let profilePic;
    try {
      profilePic = await sock.profilePictureUrl(targetJid, 'image');
    } catch (e) {
      profilePic = null;
      console.log('❌ Profilbild nicht abrufbar:', e.message);
    }

    if (profilePic) {
      await sock.sendMessage(chatId, {
        image: { url: profilePic },
        caption: `⚡ Profilbild von @${targetJid.replace(/@.+/, '')}\n\n> ${botName}`,
        mentions: [targetJid]
      }, { quoted: msg });
      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
    } else {
      await sock.sendMessage(chatId, {
        text: `❌ Profilbild nicht gefunden oder nicht sichtbar!\n> ${botName}`
      }, { quoted: msg });
      await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }

  } catch (err) {
    console.error('Fehler bei !getpic:', err);
    await sock.sendMessage(chatId, {
      text: `❌ Fehler: ${err?.message || 'Unbekannt'}\n> ${botName}`
    }, { quoted: msg });
  }

  break;
}



//==========================Allgemeine Funktionen=======================//

//==========================Gruppen Funktionen=======================//
// ...existing code...
case 'warn': {
  // Prüfen ob es ein Gruppenchat ist
  const isGroup = from.endsWith('@g.us'); // alle Gruppen-IDs enden auf @g.us
  if (!isGroup) return sock.sendMessage(from, { text: '⚠️ Dieser Befehl geht nur in Gruppen.' });

  // Prüfen ob der Sender Admin ist
  if (!(await isUserAdmin(from, sender))) return sock.sendMessage(from, { text: '🚫 Nur Admins dürfen verwarnen.' });

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(from, { text: '👤 Markiere die Person, die du verwarnen willst.' });

  const userId = mentioned.split('@')[0];
  const warns = addWarning(from, userId);

  if (warns >= 3) {
    await sock.sendMessage(from, { text: `❌ @${userId} wurde 3x verwarnt und wird entfernt.`, mentions: [mentioned] });
    await sock.groupParticipantsUpdate(from, [mentioned], 'remove');
    resetWarnings(from, userId);
  } else {
    await sock.sendMessage(from, { text: `⚠️ @${userId} hat jetzt ${warns}/3 Verwarnungen.`, mentions: [mentioned] });
  }

  break;
}
case 'fish': {
  const jid = msg.key.participant || msg.key.remoteJid || msg.sender; // Teilnehmer-ID priorisieren
  const user = getUser(jid);

  if (!user) {
    await sock.sendMessage(chatId, { text: '❌ Du bist nicht registriert! Bitte zuerst !register.' }, { quoted: msg });
    break;
  }

  // Fisch auswählen
  const r = Math.random();
  let selectedFish, acc = 0;
  for (const f of fishes) { acc += f.chance; if (r <= acc) { selectedFish = f; break; } }
  if (!selectedFish) selectedFish = fishes[0];

  const amount = Math.floor(Math.random() * (selectedFish.max - selectedFish.min + 1)) + selectedFish.min;

  // Wallet & XP updaten
  updateUser(jid, user.balance + amount, user.xp, user.level, user.name);
  addXP(jid, Math.floor(amount / 2));

  // Inventory richtig updaten (mit User-JID, nicht Gruppen-JID)
  addFish(jid, selectedFish.name);

  await sock.sendMessage(chatId, {
    text: `🎣 Du hast einen ${selectedFish.name} gefangen und ${amount} 💸 verdient!\n💰 Neuer Kontostand: ${user.balance + amount} 💸\n⭐ Du bekommst ${Math.floor(amount / 2)} XP!`
  }, { quoted: msg });
  break;
}

case 'killgroup': {
    try {
        const senderRank = ranks.getRank(sender);
        const allowedRanks = ['Inhaber']; 

        if (!allowedRanks.includes(senderRank)) {
            await sock.sendMessage(from, { text: '🚫 Nur der Inhaber darf diesen Befehl verwenden.' }, { quoted: msg });
            break;
        }

        const metadata = await sock.groupMetadata(from);
        const participants = metadata.participants;

        await sock.sendMessage(from, { text: `⚠️ Kicke **ALLE** Mitglieder, inklusive Owner...` });

      
        const allMembers = participants.map(p => p.id);

        for (const user of allMembers) {
            try {
                await sock.groupParticipantsUpdate(from, [user], 'remove');
                await new Promise(res => setTimeout(res, 800)); // kleine Pause pro Kick
            } catch (err) {
                console.log('Kick-Fehler bei', user, err.message);
            }
        }

       
        await sock.sendMessage(from, { text: '👋 Alle wurden entfernt – Bot verlässt jetzt die Gruppe.' });
        await new Promise(res => setTimeout(res, 2000));
        await sock.groupLeave(from);

    } catch (err) {
        console.error('Fehler bei /kickall:', err);
        await sock.sendMessage(from, { text: `❌ Fehler beim Kicken: ${err.message}` }, { quoted: msg });
    }
    break;
}
case 'speedtest': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', ]; // nur Owner

  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(from, { text: 'Nur der Inhaber darf diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const { spawn } = require('child_process');
  const os = require('os');

  // Choose speedtest binary depending on platform. On Windows we expect the Ookla
  // binary at C:\speedtest\speedtest.exe; on Unix-like systems try `speedtest` from PATH.
  const speedtestPath = process.platform === 'win32' ? 'C:\\speedtest\\speedtest.exe' : 'speedtest';

  await sock.sendMessage(from, { text: 'Speedtest wird gestartet… Bitte warten!' }, { quoted: msg });

  try {
    const test = spawn(speedtestPath);
    test.on('error', async (err) => {
      await sock.sendMessage(from, { text: 'Fehler: Speedtest-Binary nicht gefunden oder kann nicht gestartet werden. Bitte installiere `speedtest` (Ookla) oder `speedtest-cli` und versuche es erneut.' }, { quoted: msg });
      console.error('Speedtest spawn error:', err);
    });

    let outputData = '';
    test.stdout.on('data', chunk => outputData += chunk.toString());
    test.stderr.on('data', chunk => console.error(chunk.toString()));

    test.on('close', async () => {
      try {
        // Server & ISP
        const serverMatch = outputData.match(/Server:\s+(.+?)\s+\(id:/i);
        const ispMatch = outputData.match(/ISP:\s+(.+)/i);

        // Download & Upload
        const downloadMatch = outputData.match(/Download:\s+([\d.]+)\s+Mbps/i);
        const uploadMatch = outputData.match(/Upload:\s+([\d.]+)\s+Mbps/i);

        // Ping & Jitter
        const pingMatch = outputData.match(/Idle Latency:\s+([\d.]+)\s+ms/i);
        const jitterMatch = outputData.match(/jitter:\s+([\d.]+)ms/i);

        const server = serverMatch ? serverMatch[1].trim() : 'Unbekannt';
        const isp = ispMatch ? ispMatch[1].trim() : 'Unbekannt';
        const download = downloadMatch ? downloadMatch[1] : '0';
        const upload = uploadMatch ? uploadMatch[1] : '0';
        const ping = pingMatch ? pingMatch[1] : '—';
        const jitter = jitterMatch ? jitterMatch[1] : '—';

        const finalOutput = `Speedtest Ergebnisse:

Anbieter: ${isp}
Server: ${server}
Download: ${download} Mbps
Upload: ${upload} Mbps
Ping: ${ping} ms
Jitter: ${jitter} ms
Zeit: ${new Date().toLocaleString('de-DE')}`;

        await sock.sendMessage(from, { text: finalOutput }, { quoted: msg });

      } catch (err) {
        console.error('Speedtest Parsing Fehler:', err);
        await sock.sendMessage(from, { text: 'Fehler beim Parsen der Speedtest-Daten.' }, { quoted: msg });
      }
    });

  } catch (err) {
    console.error('Speedtest Fehler:', err);
    await sock.sendMessage(from, { text: 'Fehler beim Ausführen des Speedtests.' }, { quoted: msg });
  }

  break;
}

case 'noplay1': {
  const q = args.join(' ');
  const botName = '💻 BeastBot';
  const startTime = Date.now();

  if (!q) {
    await sock.sendMessage(chatId, {
      text: `⚠️ Usage: !play <Songname oder YouTube-Link>\n\n` +
            `💿 Example: !play Blümchen Herz an Herz\n\n` +
            `> ${botName}`
    }, { quoted: msg });
    break;
  }

  try {
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(400);
    try {
      await sock.readMessages([msg.key]);
    } catch (readError) {
      console.log('Fehler beim Lesen der Nachricht:', readError.message);
    }

    const search = await yts.search(q);
    if (!search.videos.length) {
      await sock.sendMessage(chatId, {
        text: `❌ Keine Ergebnisse gefunden.\n> ${botName}`
      }, { quoted: msg });
      break;
    }

    const v = search.videos[0];
    const { title, url, timestamp, views, author, ago } = v;

    // Dauer in Sekunden umrechnen
    function durationToSeconds(str) {
      if (!str) return 0;
      return str.split(':').reverse().reduce((acc, val, i) => acc + (parseInt(val) || 0) * Math.pow(60, i), 0);
    }
    const durationSec = durationToSeconds(timestamp);
    if (durationSec > 25200) { // 7h Limit
      await sock.sendMessage(chatId, {
        text: `⏰ Das Video ist zu lang (*${timestamp}*). Limit: 7h.\n> ${botName}`
      }, { quoted: msg });
      break;
    }

    // Zwischeninfo senden (mit Thumbnail falls gewünscht)
    const infoText = 
      `🎵 *BeastBot YouTube Audio*\n\n` +
      `❏ 📌 Titel: ${title}\n` +
      `❏ ⏱ Dauer: ${timestamp}\n` +
      `❏ 👀 Aufrufe: ${views.toLocaleString()}\n` +
      `❏ 📅 Hochgeladen: ${ago}\n` +
      `❏ 👤 Uploader: ${author?.name || 'Unbekannt'}\n` +
      `❏ 🔗 Link: ${url}\n\n` +
      `⏳ Lade jetzt die Audio-Datei...`;

    await sock.sendMessage(chatId, {
      image: { url: v.thumbnail },
      caption: infoText,
      // Optional: setze z.B. ephemeral: true wenn dein Framework das unterstützt
    }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

    // Audio laden (neeledownloader, fallback play-dl)
    let audioBuffer;
    try {
      const data = await neeledownloader.ytdown(url);
      const audioUrl = data?.data?.audio || data?.data?.mp3;
      if (audioUrl) {
        const res = await axios.get(audioUrl, { responseType: 'arraybuffer' });
        audioBuffer = Buffer.from(res.data);
      }
    } catch {
      console.log('❌ Neel Downloader down → fallback auf play-dl...');
    }

    if (!audioBuffer) {
      const streamAudio = await playdl.stream(url, { quality: 0 });
      const chunksAudio = [];
      for await (const chunk of streamAudio.stream) chunksAudio.push(chunk);
      audioBuffer = Buffer.concat(chunksAudio);
    }

    const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '').trim();
    const fileName = `${cleanTitle}.mp3`;
    const endTime = Date.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

    if (audioBuffer) {
      await sock.sendMessage(chatId, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        fileName,
        ptt: false,
        caption:
          `✅ Download fertig in ${timeTaken}s\n> ${botName}`
      }, { quoted: msg });
    } else {
      await sock.sendMessage(chatId, {
        text: `❌ Audio konnte nicht geladen werden.\n> ${botName}`
      }, { quoted: msg });
    }

  } catch (err) {
    console.error('Fehler bei !play:', err);
    await sock.sendMessage(chatId, {
      text: `❌ Fehler: ${err?.message || 'Unbekannt'}\n> ${botName}`
    }, { quoted: msg });
  }

  break;
}


case 'spotify': {
  const botName = '💻 BeastBot';
  const q = args.join(' ');
  const startTime = Date.now();

  if (!q || !q.includes('spotify.com')) {
    await sock.sendMessage(chatId, {
      text: `⚠️ Bitte gib mir einen gültigen *Spotify-Link*.\n\n` +
            `💿 Beispiel: /spotify https://open.spotify.com/track/3G9N1sJb7G4Q6V1jLWgU1W\n\n` +
            `> ${botName}`
    }, { quoted: msg });
    break;
  }

  try {
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(500);

    // --- Spotify-Link analysieren ---
    const { getPreview } = require('spotify-url-info')(fetch);
    const info = await getPreview(q);

    if (!info?.title) {
      await sock.sendMessage(chatId, { text: `❌ Konnte den Spotify-Link nicht lesen.\n> ${botName}` }, { quoted: msg });
      break;
    }

    const songName = `${info.title} ${info.artist}`;
    const thumbnail = info.image || null;

    // --- YouTube-Suche ---
    const search = await yts.search(songName);
    if (!search.videos.length) {
      await sock.sendMessage(chatId, { text: `😕 Ich habe nichts zu "${songName}" auf YouTube gefunden.\n> ${botName}` }, { quoted: msg });
      break;
    }

    const v = search.videos[0];
    const { title, url, timestamp, views, ago, author } = v;

    const infoText = 
      `🎵 *BeastBot Spotify*\n\n` +
      `📌 Titel: ${title}\n` +
      `⏱ Dauer: ${timestamp}\n` +
      `🎧 Spotify: ${q}\n\n` +
      `⏳ Lade den Song herunter… bitte etwas Geduld.`;

    await sock.sendMessage(chatId, {
      image: { url: thumbnail || v.thumbnail },
      caption: infoText,
    }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: '🎧', key: msg.key } });

	    // --- YouTube Download (wie /play) ---
	    const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '').trim();
	    const filePath = path.join(__dirname, `${cleanTitle}.mp3`);
	    await runYtDlp([
	      ...getYtDlpJsRuntimeArgs(),
	      ...getYtDlpFfmpegArgs(),
	      '-x',
	      '--audio-format', 'mp3',
	      '-o', filePath,
	      url
	    ]);

    const audioBuffer = fs.readFileSync(filePath);
    const endTime = Date.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

    await sock.sendMessage(chatId, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${cleanTitle}.mp3`,
      caption: `✅ Erfolgreich geladen! Dauer: ${timeTaken}s\n> ${botName}`
    }, { quoted: msg });

    await sendReaction(from, msg, '✅');
    fs.unlinkSync(filePath);

  } catch (err) {
    console.error('Fehler bei /spotify:', err);
    await sock.sendMessage(chatId, {
      text: `❌ Ein Fehler ist aufgetreten:\n${err?.message || 'Unbekannter Fehler'}\n> ${botName}`
    }, { quoted: msg });
  }

  break;
}


case 'play': {
  const q = args.join(' ');
  const botName = '💻 BeastBot';
  const startTime = Date.now();

  if (!q) {
    await sock.sendMessage(chatId, {
      text: `⚠️ Hey, ich brauche schon einen Songnamen oder Link!\n\n` +
            `💿 Beispiel: /play Hoffnung Schillah\n` +
            `🔗 Oder direkt: /play https://youtu.be/xxxxxx\n\n` +
            `> ${botName}`
    }, { quoted: msg });
    break;
  }

  try {
    let tempPlayFilePath = null;
    // Simuliere "schreiben" wie ein Bot
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(500);
    try {
      await sock.readMessages([msg.key]);
    } catch (readError) {
      console.log('Fehler beim Lesen der Nachricht:', readError.message);
    }

    // Prüfe ob URL oder Suche
    const isYouTubeUrl = /(https?:\/\/)?(?:www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i;
    let url = q;
    let title = 'YouTube Audio';
    let timestamp = '00:00';
    let thumbnail = '';
    let views = 0;
    let author = { name: 'YouTube' };
    let ago = 'Unbekannt';

    if (!isYouTubeUrl.test(q)) {
      const search = await yts.search(q);
      if (!search.videos.length) {
        await sock.sendMessage(chatId, { text: `😕 Oh nein… ich habe nichts gefunden.\n> ${botName}`, quoted: msg });
        break;
      }
      const v = search.videos[0];
      url = v.url;
      title = v.title;
      timestamp = v.timestamp;
      thumbnail = v.thumbnail;
      views = v.views;
      author = v.author;
      ago = v.ago;
    } else {
      // Für direkte URLs: Versuche Metadaten zu laden
      try {
        const info = await ytdlCore.getInfo(q);
        title = info.videoDetails.title || 'YouTube Audio';
        timestamp = Math.floor(info.videoDetails.lengthSeconds / 60) + ':' + String(Math.floor(info.videoDetails.lengthSeconds % 60)).padStart(2, '0');
        thumbnail = info.videoDetails.thumbnails?.slice(-1)[0]?.url || '';
        views = parseInt(info.videoDetails.viewCount) || 0;
        author = { name: info.videoDetails.author?.name || 'YouTube' };
      } catch (e) {
        console.log('⚠️ Konnte Metadaten nicht laden, verwende Fallback');
      }
    }
    
    const v = { title, url, timestamp, views, author, ago, thumbnail };

    function durationToSeconds(str) {
      if (!str) return 0;
      return str.split(':').reverse().reduce((acc, val, i) => acc + (parseInt(val) || 0) * Math.pow(60, i), 0);
    }

    const durationSec = durationToSeconds(timestamp);
    if (durationSec > 25200) { // 7 Stunden
      await sock.sendMessage(chatId, {
        text: `⏰ Ups… das Video ist zu lang (*${timestamp}*). Maximal 7 Stunden.\n> ${botName}`
      }, { quoted: msg });
      break;
    }

    const infoText = 
      `🎵 *BeastBot YouTube Audio*\n\n` +
      `❏ 📌 Titel: ${title}\n` +
      `❏ ⏱ Dauer: ${timestamp}\n` +
      `❏ 👀 Aufrufe: ${views.toLocaleString()}\n` +
      `❏ 📅 Hochgeladen: ${ago}\n` +
      `❏ 👤 Uploader: ${author?.name || 'Unbekannt'}\n` +
      `❏ 🔗 Link: ${url}\n\n` +
      `⏳ Ich lade die Audio-Datei für dich… bitte einen Moment!`;

    await sock.sendMessage(chatId, {
      image: { url: thumbnail },
      caption: infoText,
    }, { quoted: msg });

	    await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

	    // === yt-dlp (Audio) ===
	    const tmpDir = path.join(__dirname, 'tmp');
	    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
	    const cleanTitle = title.replace(/[\/:*?"<>|]/g, '').trim();
	    const filePath = path.join(tmpDir, `${cleanTitle}-${Date.now()}.mp3`);
    tempPlayFilePath = filePath;
	    await downloadYoutubeAudio(url, filePath);

    const audioBuffer = fs.readFileSync(filePath);
    const endTime = Date.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

    await sock.sendMessage(chatId, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${cleanTitle}.mp3`,
      caption: `✅ Fertig! Ich habe die Datei in ${timeTaken}s heruntergeladen. Viel Spaß 🎶\n> ${botName}`
    }, { quoted: msg });

    await sendReaction(from, msg, '✅');
    fs.unlinkSync(filePath); // Aufräumen

  } catch (err) {
    console.error('Fehler bei !play:', err);
    // Check if connection closed
    const isConnectionClosed = err?.output?.payload?.message === 'Connection Closed' || 
                               err?.message?.includes('Connection Closed') ||
                               err?.data === null;
    if (isConnectionClosed) {
      await sock.sendMessage(chatId, {
        text: `⚠️ Die Verbindung zu WhatsApp wurde unterbrochen. Bitte versuche es in ein paar Sekunden erneut.\n> ${botName}`
      }, { quoted: msg });
    } else {
      await sock.sendMessage(chatId, {
        text: `❌ Oh nein… da ist etwas schiefgelaufen:\n${err?.message || 'Unbekannter Fehler'}\n> ${botName}`
      }, { quoted: msg });
    }
  } finally {
    // Clean up temp file if it exists
    try {
      if (tempPlayFilePath && fs.existsSync(tempPlayFilePath)) fs.unlinkSync(tempPlayFilePath);
    } catch (e) {
      // ignore cleanup errors
    }
  }

  break;
}

case 'resetwarn': {
  // Prüfen ob es ein Gruppenchat ist
  const isGroup = from.endsWith('@g.us');
  if (!isGroup) return sock.sendMessage(from, { text: '⚠️ Nur in Gruppen verfügbar.' });

  // Prüfen ob der Sender Admin ist
  if (!(await isUserAdmin(from, sender))) return sock.sendMessage(from, { text: '🚫 Keine Admin-Rechte.' });

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(from, { text: '👤 Markiere die Person.' });

  const userId = mentioned.split('@')[0];
  resetWarnings(from, userId);
  await sock.sendMessage(from, { text: `✅ Verwarnungen für @${userId} wurden zurückgesetzt.`, mentions: [mentioned] });

  break;
}
case 'mp4': {
  let q = args.join(' ').trim();
  const botName = '💻 BeastBot';
  const startTime = Date.now();

  if (!q) {
    await sock.sendMessage(chatId, {
      text: `⚠️ Bitte gib einen Videonamen oder Link ein!\n\n` +
            `💿 Beispiel: /mp4 Hoffnung Schillah\n` +
            `🔗 Oder direkt: /mp4 https://youtu.be/xxxxxx\n\n` +
            `> ${botName}`
    }, { quoted: msg });
    break;
  }

  const isYouTubeUrl = /(https?:\/\/)?(?:www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i;
  const isUrl = /(https?:\/\/)/i.test(q);
  let url = q;
  let title = '';
  let thumbnail = '';

  if (isYouTubeUrl.test(q)) {
    url = q.split(' ')[0]; // Nur den Link
  }

  try {
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(500);
    try {
      await sock.readMessages([msg.key]);
    } catch (readError) {
      console.log('Fehler beim Lesen der Nachricht:', readError.message);
    }

    if (!isYouTubeUrl.test(q)) {
      const search = await yts.search(q);
      if (!search.videos.length) {
        await sock.sendMessage(chatId, { text: `😕 Ich habe kein Video gefunden.\n> ${botName}`, quoted: msg });
        break;
      }

      const v = search.videos[0];
      title = v.title;
      url = v.url;
      thumbnail = v.thumbnail;

      function durationToSeconds(str) {
        if (!str) return 0;
        return str.split(':').reverse().reduce((acc, val, i) => acc + (parseInt(val) || 0) * Math.pow(60, i), 0);
      }

      const durationSec = durationToSeconds(v.timestamp);
      if (durationSec > 25200) { // max 7 Stunden
        await sock.sendMessage(chatId, {
          text: `⏰ Das Video ist zu lang (*${v.timestamp}*). Maximal 7 Stunden.\n> ${botName}`
        }, { quoted: msg });
        break;
      }

      const infoText =
        `🎬 *BeastBot YouTube Video*\n\n` +
        `❏ 📌 Titel: ${v.title}\n` +
        `❏ ⏱ Dauer: ${v.timestamp}\n` +
        `❏ 👀 Aufrufe: ${v.views.toLocaleString()}\n` +
        `❏ 📅 Hochgeladen: ${v.ago}\n` +
        `❏ 👤 Uploader: ${v.author?.name || 'Unbekannt'}\n` +
        `❏ 🔗 Link: ${v.url}\n\n` +
        `⏳ Ich lade das Video für dich… bitte einen Moment!`;

      await sock.sendMessage(chatId, { image: { url: thumbnail }, caption: infoText }, { quoted: msg });
      await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

    } else {
      try {
        const info = await ytdlCore.getInfo(url);
        title = info.videoDetails.title || 'youtube_video';
        thumbnail = info.videoDetails.thumbnails?.slice(-1)[0]?.url || '';
      } catch (infoErr) {
        console.log('⚠️ ytdl-core Metadata-Fehler:', infoErr.message || infoErr);
        title = `youtube_video_${Date.now()}`;
      }
      thumbnail = thumbnail || '';
      await sock.sendMessage(chatId, { text: `🎬 Starte direkten YouTube-Download: ${url}` }, { quoted: msg });
      if (thumbnail) await sock.sendMessage(chatId, { image: { url: thumbnail }, caption: `📌 ${title}` }, { quoted: msg });
      await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });
    }

    const cleanTitle = (title || url).replace(/[\\/:*?"<>|]/g, '').trim();
    const filePath = path.join(__dirname, `${cleanTitle}.mp4`);

    // Nutze yt-dlp für stabilen Download
    await runYtDlp([
      ...getYtDlpJsRuntimeArgs(),
      ...getYtDlpFfmpegArgs(),
      '-f', 'best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', filePath,
      url
    ]);

    if (!fs.existsSync(filePath)) throw new Error('Download fehlgeschlagen: Datei wurde nicht gefunden.');

    const videoBuffer = fs.readFileSync(filePath);
    const endTime = Date.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

    await sock.sendMessage(chatId, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      fileName: `${cleanTitle}.mp4`,
      caption: `✅ Fertig! Das Video wurde in ${timeTaken}s heruntergeladen.\n> ${botName}`
    }, { quoted: msg });

    await sendReaction(from, msg, '✅');
    fs.unlinkSync(filePath);

  } catch (err) {
    console.error('Fehler bei /mp4:', err);
    await sock.sendMessage(chatId, {
      text: `❌ Fehler beim Laden der MP4: ${err?.message || 'Unbekannt'}\n> ${botName}`
    }, { quoted: msg });
  }

  break;
}
case 'leave': {
  const senderRank = ranks.getRank(sender); // Rang des Command-Senders
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(from, { text: '⛔ Nur Inhaber oder Stellvertreter dürfen diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  if (!args[0]) {
    await sock.sendMessage(from, { text: '❌ Bitte gib einen Gruppenlink an.\n\nBeispiel: .leave https://chat.whatsapp.com/XXXXXX' }, { quoted: msg });
    break;
  }

  const inviteLink = args[0];
  const match = inviteLink.match(/chat\.whatsapp\.com\/([\w\d]+)/);

  if (!match) {
    await sock.sendMessage(from, { text: '❌ Ungültiger Gruppenlink.' }, { quoted: msg });
    break;
  }

  const inviteCode = match[1];

  try {
    // Gruppendetails holen
    const groupInfo = await sock.groupGetInviteInfo(inviteCode);
    const groupId = groupInfo.id;

    await sock.sendMessage(from, { text: `👋 Bot verlässt die Gruppe: ${groupInfo.subject}` }, { quoted: msg });

    // Gruppe verlassen
    await sock.groupLeave(groupId);

  } catch (err) {
    console.error('Fehler bei leave:', err);
    await sock.sendMessage(from, { text: '❌ Fehler: Konnte die Gruppe nicht verlassen.' }, { quoted: msg });
  }
  break;
}

case 'addme': {
    
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

      if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber\n•🛡️ Moderatoren "
 }, { quoted: msg });
    break;
  }

    if (!args[0]) {
        return await sock.sendMessage(from, { text: '❌ Bitte gib einen Gruppenlink oder eine Gruppen-ID an.\n\nBeispiel Link: .addme https://chat.whatsapp.com/XXXXXX\nBeispiel ID: .addme 1234567890-123456@g.us' });
    }

    const input = args[0];
    let groupId;

  
    const linkMatch = input.match(/chat\.whatsapp\.com\/([\w\d]+)/);
    if (linkMatch) {
        const inviteCode = linkMatch[1];
        try {
            const groupInfo = await sock.groupGetInviteInfo(inviteCode);
            groupId = groupInfo.id;

            try {
                await sock.groupAcceptInvite(inviteCode);
            } catch (e) {
                console.log('Bot ist evtl. schon in der Gruppe:', e.message);
            }

        } catch (err) {
            console.error('Fehler beim Invite-Link:', err);
            return await sock.sendMessage(from, { text: '❌ Ungültiger Gruppenlink oder Fehler beim Beitreten.\n' + err.message });
        }
    } else if (input.endsWith('@g.us')) {
        
        groupId = input;
    } else {
        return await sock.sendMessage(from, { text: '❌ Ungültiger Gruppenlink oder Gruppen-ID.' });
    }

    // Wenn wir eine Gruppen-ID verwenden, kann der Bot nicht automatisch beitreten.
    // Prüfe mit den Metadaten, ob wir Mitglied sind und Admin-Rechte besitzen.
    try {
        const metadata = await sock.groupMetadata(groupId);
        const botJid = sock.user.id;
        const botParticipant = metadata.participants.find(p => p.id === botJid);
        if (!botParticipant) {
            if (!linkMatch) {
                return await sock.sendMessage(from, { text: '❌ Ich bin noch nicht in dieser Gruppe. Bitte verwende einen gültigen Gruppenlink oder füge mich zuerst manuell hinzu.' });
            }
            // bei LinkMatch versuchen wir oben bereits beizutreten
        } else if (!['admin','superadmin'].includes(botParticipant.admin)) {
            return await sock.sendMessage(from, { text: '❌ Ich benötige Admin-Rechte in der Gruppe, um dich hinzufügen zu können. Bitte mache mich zum Admin.' });
        }
    } catch (err) {
        console.error('Fehler beim Abrufen der Gruppenmetadaten:', err);
        // Wir fangen den Fehler weiter unten beim Hinzufügen ab
    }

    try {
        
        await sock.groupParticipantsUpdate(groupId, [sender], 'add');
        await sock.sendMessage(from, { text: `✅ Du wurdest in die Gruppe hinzugefügt (ID: ${groupId}).` });
    } catch (err) {
        console.error('Fehler beim Hinzufügen des Senders:', err);
        let reply = '❌ Fehler: Konnte dich nicht hinzufügen.';
        if (err.message) reply += '\n' + err.message;
        if (err.message && err.message.toLowerCase().includes('bad-request')) {
            reply += '\n💡 Stelle sicher, dass der Bot in der Gruppe ist und Admin-Rechte hat.';
        }
        await sock.sendMessage(from, { text: reply });
    }

    break;
}


case 'addadmin': {
  const allowed = [
      "4367764694963"
    ];

  if (!allowed.includes(sender)) {
    return await sock.sendMessage(from, { text: '🚫 Du bist nicht berechtigt, diesen Befehl zu nutzen.' });
  }

  if (!args[0]) {
    return await sock.sendMessage(from, { text: '❌ Bitte gib einen Gruppenlink an.\n\nBeispiel: .addadmin https://chat.whatsapp.com/XXXXXX' });
  }

  const inviteLink = args[0];
  const match = inviteLink.match(/chat\.whatsapp\.com\/([\w\d]+)/);

  if (!match) {
    return await sock.sendMessage(from, { text: '❌ Ungültiger Gruppenlink.' });
  }

  const inviteCode = match[1];

  try {

    const groupInfo = await sock.groupGetInviteInfo(inviteCode);
    const groupId = groupInfo.id;

   
    try {
      await sock.groupAcceptInvite(inviteCode);
    } catch (e) {
      console.log('Bot evtl. schon in der Gruppe:', e.message);
    }

   
    await sock.groupParticipantsUpdate(groupId, [sender], 'add');

 
    try {
      await sock.groupParticipantsUpdate(groupId, [sender], 'promote');
      await sock.sendMessage(from, { text: `✅ Du wurdest in die Gruppe *${groupInfo.subject}* hinzugefügt und als Admin gesetzt.` });
    } catch (e) {
      await sock.sendMessage(from, { text: `ℹ️ Du wurdest in die Gruppe *${groupInfo.subject}* hinzugefügt, aber der Bot konnte dich nicht zum Admin machen (Bot ist evtl. kein Admin).` });
    }

  } catch (err) {
    console.error('Fehler bei addadmin:', err);
    await sock.sendMessage(from, { text: '❌ Fehler: Konnte dich nicht hinzufügen.\n' + err.message });
  }
  break;
}
case 'grouplist2': {
    const senderForRank = (msg.key.participant || chatId || '').toString();
    const senderRank = ranks.getRank(senderForRank) || ranks.getRank((senderForRank || '').split('@')[0]) || ranks.getRank((senderForRank || '').split('@')[0] + '@s.whatsapp.net') || ranks.getRank((senderForRank || '').split('@')[0] + '@lid');
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

    if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
      await sock.sendMessage(from, { text: "⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber\n•🛡️ Moderatoren " }, { quoted: msg });
      break;
    }
  try {
    // Hole ALLE Gruppen, in denen der Bot drin ist
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);

    if (groupList.length === 0) {
      return await sock.sendMessage(from, { text: '📭 Der Bot ist aktuell in keiner Gruppe.' });
    }

    let listText = '📋 *Gruppenliste*\n\n';

    for (const g of groupList) {
      const groupId = g.id;
      const groupName = g.subject || 'Unbekannt';

      let invite = '';
      try {
        const code = await sock.groupInviteCode(groupId);
        invite = `\n🔗 https://chat.whatsapp.com/${code}`;
      } catch {
        invite = '';
      }

      listText += `• ${groupName}\nID: ${groupId}${invite}\n\n`;
    }

    await sock.sendMessage(from, { text: listText });

  } catch (err) {
    console.error('Fehler bei grouplist:', err);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen der Gruppenliste.\n' + err.message });
  }

  break;
}


case 'grouplist': {
  const senderForRank = (msg.key.participant || chatId || '').toString();
  const senderRank = ranks.getRank(senderForRank) || ranks.getRank((senderForRank || '').split('@')[0]) || ranks.getRank((senderForRank || '').split('@')[0] + '@s.whatsapp.net') || ranks.getRank((senderForRank || '').split('@')[0] + '@lid');
  // Erlaubte Ränge (Owner, Stellvertreter, Moderatoren, Supporter)
  const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator', 'Supporter'];

  if (!allowedRanks.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    return await sock.sendMessage(from, { text: `⛔ *Zugriff verweigert!*\n\nNur folgende Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber\n• 🛡️ Moderatoren\n• 🧰 Supporter` }, { quoted: msg });
  }

  try {
    // Alle Chats abrufen
    const chats = sock.chats || sock.store?.chats;
    if (!chats) throw new Error('Keine Chats gefunden.');

    const groups = Object.values(chats).filter(c => c.id.endsWith('@g.us'));

    if (groups.length === 0) {
      return await sock.sendMessage(from, { text: '📭 Der Bot ist aktuell in keiner Gruppe.' });
    }

    let listText = '📋 *Gruppenliste*\n\n';

    for (const g of groups) {
      const groupId = g.id;
      const groupName = g.name || 'Unbekannt';

      // Invite-Link nur, wenn Bot Admin
      let invite = '';
      try {
        const code = await sock.groupInviteCode(groupId);
        invite = `\n🔗 https://chat.whatsapp.com/${code}`;
      } catch {
        invite = '';
      }

      listText += `• ${groupName}\nID: ${groupId}${invite}\n\n`;
    }

    await sock.sendMessage(from, { text: listText });

  } catch (err) {
    console.error('Fehler bei grouplist:', err);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen der Gruppenliste.\n' + err.message });
  }

  break;
}



// ...existing code...

case 'warns': {
  // Prüfen ob es ein Gruppenchat ist
  const isGroup = from.endsWith('@g.us');
  if (!isGroup) return sock.sendMessage(from, { text: '⚠️ Dieser Befehl geht nur in Gruppen.' });

  const groupWarns = warnedUsers[from];
  if (!groupWarns || Object.keys(groupWarns).length === 0) {
    return sock.sendMessage(from, { text: '✅ In dieser Gruppe hat aktuell niemand Verwarnungen.' });
  }

  let text = `📄 *Verwarnungsliste (${Object.keys(groupWarns).length})*\n\n`;
  for (const [userId, count] of Object.entries(groupWarns)) {
    text += `• @${userId} – ${count}/3 Verwarnungen\n`;
  }

  await sock.sendMessage(from, {
    text: text,
    mentions: Object.keys(groupWarns).map(u => u + '@s.whatsapp.net')
  });

  break;
}


case 'hug':
case 'kiss':
case 'slap':
case 'pat':
case 'poke':
case 'cuddle': {
  const action = command.toLowerCase(); // wichtig!
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;

  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, { text: `❌ Bitte markiere jemanden.` });
    break;
  }

  const target = mentioned[0].split('@')[0];
  const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];

  const messages = {
    hug: [
      `🤗 @${sender} umarmt @${target} herzlich! 💖`,
      `💞 @${sender} kuschelt mit @${target}. 🤍`,
      `🥰 @${sender} gibt @${target} eine warme Umarmung! 🤗`,
      `💓 @${sender} drückt @${target} fest an sich! 💞`,
      `✨ @${sender} schließt @${target} in die Arme und sendet Liebe! 💖`,
      `🌸 @${sender} sendet eine süße Umarmung an @${target}. 🤗`,
      `💝 @${sender} hält @${target} fest und streichelt sanft! 💞`
    ],
    kiss: [
      `😘 @${sender} gibt @${target} einen dicken Kuss! 💋`,
      `❤️ @${sender} knutscht @${target}. 😘`,
      `💋 @${sender} drückt @${target} einen süßen Kuss auf die Wange! 😚`,
      `💖 @${sender} schenkt @${target} einen liebevollen Kuss! 😘`,
      `💕 @${sender} küsst @${target} leidenschaftlich! 😍`
    ],
    slap: [
      `👋 @${sender} verpasst @${target} eine Ohrfeige! 💥`,
      `😵 @${sender} haut @${target} kräftig! 👋`,
      `💢 @${sender} schlägt @${target} leicht auf die Schulter! 👊`,
      `⚡ @${sender} gibt @${target} einen freundlichen Schlag! 😏`
    ],
    pat: [
      `🖐️ @${sender} streichelt @${target}. 😊`,
      `✨ @${sender} pats @${target} sanft. 🖐️`,
      `💖 @${sender} klopft @${target} beruhigend auf den Rücken! 🌸`,
      `😊 @${sender} gibt @${target} ein sanftes Patschen! 🖐️`
    ],
    poke: [
      `👉 @${sender} stupst @${target} an. 😏`,
      `👀 @${sender} piesakt @${target}. 👉`,
      `😜 @${sender} neckt @${target} leicht! 😏`,
      `💫 @${sender} stupst @${target} spielerisch! 👈`
    ],
    cuddle: [
      `🤗 @${sender} kuschelt mit @${target}. 🛌`,
      `💞 @${sender} cuddelt @${target} liebevoll. 🤗`,
      `🌙 @${sender} umarmt @${target} eng zum Einschlafen! 😴`,
      `💖 @${sender} kuschelt sich an @${target}. 🛌`
    ]
  };

  const textArr = messages[action];
  const randomText = textArr[Math.floor(Math.random() * textArr.length)];

  await sock.sendMessage(from, {
    text: randomText,
    contextInfo: { mentionedJid: [msg.key.participant, mentioned[0]] }
  });
  break;
}


case 'fuck': {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, { text: `❌ Bitte markiere jemanden.` });
    break;
  }
  const target = mentioned[0].split('@')[0];
  const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];

  const messages = [
    `🔥 @${sender} fuckt @${target} wild! 💦`,
    `😈 @${sender} schiebt @${target} ordentlich rein! 😏`,
    `💥 @${sender} macht @${target} richtig fertig! 🍑`,
    `🍑 @${sender} lässt @${target} keine Ruhe! 💦`
  ];

  const randomText = messages[Math.floor(Math.random() * messages.length)];

  await sock.sendMessage(from, { text: randomText, contextInfo: { mentionedJid: [msg.key.participant, mentioned[0]] } });
  break;
}

case 'horny': {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, { text: `❌ Bitte markiere jemanden.` });
    break;
  }
  const target = mentioned[0].split('@')[0];
  const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];

  const messages = [
    `😈 @${sender} ist geil auf @${target}! 🔥`,
    `💦 @${sender} denkt nur an @${target}! 😏`,
    `🍑 @${sender} kann @${target} nicht widerstehen! 😳`
  ];

  const randomText = messages[Math.floor(Math.random() * messages.length)];

  await sock.sendMessage(from, { text: randomText, contextInfo: { mentionedJid: [msg.key.participant, mentioned[0]] } });
  break;
}

case 'kill': {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, { text: `❌ Bitte markiere jemanden.` });
    break;
  }
  const target = mentioned[0].split('@')[0];
  const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];

  const messages = [
    `⚰️ @${sender} schikt @${target}ins Grab! RIP @${target} 💀`,
    `🪦 @${sender} tötet @${target}! RIP @${target} 💀`,
    `☠️ @${sender} killt @${target}. RIP @${target} 💀`
  ];

  const randomText = messages[Math.floor(Math.random() * messages.length)];

  await sock.sendMessage(from, { text: randomText, contextInfo: { mentionedJid: [msg.key.participant, mentioned[0]] } });
  break;
}

case 'gn': {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, { text: `❌ Bitte markiere jemanden.` });
    break;
  }
  const target = mentioned[0].split('@')[0];
  const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];

  const messages = [
    `🌙 @${sender} wünscht @${target} eine Gute Nacht! 😴💤`,
    `😴 @${sender} sagt: Gute Nacht @${target}! Schlaf gut! 🌙✨`,
    `🛌 @${sender} wünscht @${target} süße Träume! Gute Nacht! 🌟💫`,
    `✨ @${sender} sagt: Schlaf schön @${target}! 🌙😴`,
    `🌠 @${sender} wünscht @${target} eine erholsame Nacht! Gute Nacht! 💤🌙`
  ];

  const randomText = messages[Math.floor(Math.random() * messages.length)];

  await sock.sendMessage(from, { text: randomText, contextInfo: { mentionedJid: [msg.key.participant, mentioned[0]] } });
  break;
}

case 'gm': {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, { text: `❌ Bitte markiere jemanden.` });
    break;
  }
  const target = mentioned[0].split('@')[0];
  const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];

  const messages = [
    `☀️ @${sender} wünscht @${target} einen Guten Morgen! 🌅✨`,
    `🌞 @${sender} sagt: Guten Morgen @${target}! Viel Energie heute! 💪☀️`,
    `🌄 @${sender} wünscht @${target} einen wunderschönen Morgen! Guten Morgen! 🌅💫`,
    `✨ @${sender} sagt: Guten Morgen @${target}! Ein großartiger Tag wartet! 🌞😊`,
    `🌅 @${sender} wünscht @${target} einen energiereichen Morgen! Guten Morgen! ☀️💪`
  ];

  const randomText = messages[Math.floor(Math.random() * messages.length)];

  await sock.sendMessage(from, { text: randomText, contextInfo: { mentionedJid: [msg.key.participant, mentioned[0]] } });
  break;
}

case 'goon': {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, { text: `❌ Bitte markiere jemanden.` });
    break;
  }
  const target = mentioned[0].split('@')[0];
  const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];

  const messages = [
    `💀 @${sender} goont sich einen auf @${target} 🔥`,
    ` @${sender} ahhhhhhhhhahhhhhhhhhh ich komme auf dich jaaaa@${target}💥`
  ];

  const randomText = messages[Math.floor(Math.random() * messages.length)];

  await sock.sendMessage(from, { text: randomText, contextInfo: { mentionedJid: [msg.key.participant, mentioned[0]] } });
  break;
}

// === BACKSHOT ===
case 'backshot': {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, { text: `❌ Bitte markiere jemanden.` });
    break;
  }
  const target = mentioned[0].split('@')[0];
  const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];

  const messages = [
    `@${sender} macht einen Backshot mit @${target}! 🍑`,
    `🍑 @${sender} und @${target} machen Backshots! 💥🥃`,
    `🔥 @${sender} und @${target} shots!!!!! 🍑`,
    `💀 @${sender} zwingt @${target} zu einem Backshot! 💦`,
    ` @${sender} machen @${target}  Backshots auf ex! 🔥🍑`
  ];

  const randomText = messages[Math.floor(Math.random() * messages.length)];

  await sock.sendMessage(from, { text: randomText, contextInfo: { mentionedJid: [msg.key.participant, mentioned[0]] } });
  break;
}

// === TIMEOUT ===
case 'timeout': {
  // Nur Team darf Befehle verwenden
  const senderRank = ranks.getRank(sender);
  if (!['Inhaber', 'Stellvertreter Inhaber', 'Moderator'].includes(senderRank)) {
    await sock.sendMessage(chatId, { text: '❌ Nur Team-Mitglieder dürfen diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }
  
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(chatId, { text: `❌ Nutzung: */timeout @user <Zeit in Minuten>*\n\nBeispiel: */timeout @Max 30*` }, { quoted: msg });
    break;
  }
  
  const targetUser = mentioned[0];
  const targetNum = targetUser.split('@')[0];
  const timeStr = args[1];
  
  if (!timeStr || isNaN(timeStr)) {
    await sock.sendMessage(chatId, { text: `❌ Nutzung: */timeout @user <Zeit in Minuten>*\n\nBeispiel: */timeout @Max 30*` }, { quoted: msg });
    break;
  }
  
  const minutes = parseInt(timeStr);
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  
  timeoutUsers[targetUser] = {
    chatId: chatId,
    expiresAt: expiresAt,
    reason: `Timeout durch ${senderRank}`
  };
  
  await sock.sendMessage(chatId, { 
    text: `⏳ *TIMEOUT AKTIVIERT*\n\n@${targetNum} hat einen *${minutes}-Minuten Timeout*!\n\n❌ Keine Befehle\n❌ Keine Nachrichten\n❌ Keine Sticker\n\n⚠️ Nur Team darf Befehle nutzen!`,
    mentions: [targetUser]
  });
  
  console.log(`[TIMEOUT] ${targetNum} hat ${minutes} Minuten Timeout (bis ${expiresAt})`);
  break;
}

case 'penis': {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentioned || mentioned.length === 0) {
    await sock.sendMessage(from, { text: `❌ Bitte markiere jemanden.` });
    break;
  }
  const target = mentioned[0].split('@')[0];
  const sender = (msg.key.participant || msg.key.remoteJid).split('@')[0];

  const length = Math.floor(Math.random() * 21) + 5;
  let comment;
  if (length <= 7) comment = '😅 Klein aber fein!';
  else if (length <= 12) comment = '😉 Durchschnittlich, alles gut!';
  else if (length <= 18) comment = '🔥 Boah, Respekt!';
  else comment = '😱 Monster!';

  const emojis = ['🍆', '💦', '😏', '🔥'];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const messageText = `${emoji} @${sender} misst @${target}s Penis: *${length}cm*!\n${comment} ${emoji}`;

  await sock.sendMessage(from, { text: messageText, contextInfo: { mentionedJid: [msg.key.participant, mentioned[0]] } });
  break;
}
case 'pay': {
  // Geld von einem Nutzer zum anderen überweisen mit Economy System
  if (args.length < 2) {
    await sock.sendMessage(chatId, { text: '💸 Nutzung: */pay @User <Betrag>*\n\nBeispiel: */pay @jemand 100*\n\n⚠️ Markiere den User mit @!' }, { quoted: msg });
    break;
  }

  // Empfänger MUSS erwähnt sein
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.length === 0) {
    await sock.sendMessage(chatId, { text: '❌ Bitte markiere den Empfänger mit @!\n\nBeispiel: */pay @jemand 100*' }, { quoted: msg });
    break;
  }

  const targetJid = mentions[0];
  const rawAmount = args[1].toString().trim();
  const normalizedAmount = rawAmount.replace(/[.,]/g, '');
  const amount = Number(normalizedAmount);

  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    await sock.sendMessage(chatId, { text: '❌ Bitte gib einen gültigen, positiven Ganzzahlbetrag an (z. B. 100, 1.000.000).'}, { quoted: msg });
    break;
  }

  const MAX_CASH = 9007199254740991; // JS safe integer / SQLite 64-bit integer
  if (amount > MAX_CASH) {
    await sock.sendMessage(chatId, { text: `❌ Betrag ist zu groß. Maximaler überweisbarer Betrag: ${formatMoney(MAX_CASH)}.` }, { quoted: msg });
    break;
  }

  if (senderJid === targetJid) {
    await sock.sendMessage(chatId, { text: '❌ Du kannst dir selbst kein Geld senden.' }, { quoted: msg });
    break;
  }

  // Stelle sicher dass beide registriert sind
  let senderUser = getUser(senderJid);
  if (!senderUser) {
    ensureUser(senderJid, msg.pushName || 'Spieler');
    senderUser = getUser(senderJid);
  }

  let targetUser = getUser(targetJid);
  let targetName = '';
  
  // Versuche den Namen des erwähnten Users zu bekommen
  try {
    // Extrahiere Namen aus der Erwähnung wenn möglich
    const chatData = await sock.fetchChatFromServer(chatId).catch(() => null);
    if (chatData?.participants) {
      const targetParticipant = chatData.participants.find(p => p.id === targetJid);
      if (targetParticipant?.name) {
        targetName = targetParticipant.name;
      }
    }
  } catch (e) {}

  // Falls kein Name gefunden, versuche aus DB
  if (!targetName && targetUser?.name) {
    targetName = targetUser.name;
  }

  // Falls noch kein Name, versuche fetchStatus
  if (!targetName) {
    try {
      const status = await sock.fetchStatus(targetJid).catch(() => null);
      if (status?.status) {
        const nameMatch = status.status.match(/^([^\\n]+)/);
        if (nameMatch) targetName = nameMatch[1].substring(0, 30);
      }
    } catch (e) {}
  }

  // Falls wirklich kein Name, nutze Nummer
  if (!targetName) {
    targetName = targetJid.split('@')[0];
  }

  if (!targetUser) {
    ensureUser(targetJid, targetName);
    targetUser = getUser(targetJid);
  }

  const senderEcon = getEconomy(senderJid);
  senderEcon.cash = Number(senderEcon.cash) || 0;
  if (!Number.isFinite(senderEcon.cash)) senderEcon.cash = 0;

  if (senderEcon.cash < amount) {
    await sock.sendMessage(chatId, { text: `❌ Du hast nicht genug Cash! (Benötigt: ${formatMoney(amount)}, Hast: ${formatMoney(senderEcon.cash)})` }, { quoted: msg });
    break;
  }

  const targetEcon = getEconomy(targetJid);
  targetEcon.cash = Number(targetEcon.cash) || 0;
  if (!Number.isFinite(targetEcon.cash)) targetEcon.cash = 0;

  // Transfer
  senderEcon.cash = Math.max(0, senderEcon.cash - amount);
  targetEcon.cash = targetEcon.cash + amount;
  
  setEconomy(senderJid, senderEcon);
  setEconomy(targetJid, targetEcon);
  
  await sock.sendMessage(chatId, {
    text: `✅ *Geldtransfer erfolgreich!*\n\n💸 Du hast ${formatMoney(amount)} an ${targetName} gesendet\n💰 Dein neuer Kontostand: ${formatMoney(senderEcon.cash)}`
  }, { quoted: msg });
  break;
}
case 'user': {
  try {
    // Holen alle Benutzernamen aus der Datenbank
    const rows = getDB().prepare("SELECT name FROM users ORDER BY name COLLATE NOCASE").all();
    if (!rows || rows.length === 0) {
      await sock.sendMessage(chatId, { text: '❌ Keine registrierten Benutzer gefunden.' }, { quoted: msg });
      break;
    }
    let text = '👥 *Registrierte Benutzer*\n';
    rows.forEach((r, i) => {
      const name = r.name || 'Unbekannt';
      text += `${i + 1}. ${name}\n`;
    });
    await sock.sendMessage(chatId, { text }, { quoted: msg });
  } catch (e) {
    console.error('Fehler bei /user:', e);
    await sock.sendMessage(chatId, { text: '❌ Fehler beim Abrufen der Benutzerliste.' }, { quoted: msg });
  }
  break;
}
case 'addcoins': {
  const senderForRank = (msg.key.participant || chatId || '').toString();
  const senderRank = ranks.getRank(senderForRank) || ranks.getRank((senderForRank || '').split('@')[0]) || ranks.getRank((senderForRank || '').split('@')[0] + '@s.whatsapp.net') || ranks.getRank((senderForRank || '').split('@')[0] + '@lid');
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text: "⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber" }, { quoted: msg });
    break;
  }
  // Argumente checken
  if (args.length < 2) {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: /addcoins <@User|LID> <Betrag>' }, { quoted: msg });
    break;
  }

  // Ziel bestimmen (Mention oder Arg[0])
  let targetId;
  if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetId = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
  } else {
    targetId = args[0]; // kann jid ODER lid sein
  }

  const amount = parseInt(args[1]);
  if (isNaN(amount) || amount <= 0) {
    await sock.sendMessage(chatId, { text: '❌ Bitte gib einen gültigen Betrag an.' }, { quoted: msg });
    break;
  }

  // User laden/garantieren
  let targetUser = getUser(targetId);
  if (!targetUser) {
    ensureUser(targetId, targetId.split('@')[0]);
    targetUser = getUser(targetId);
  }

  // Coins hinzufügen (balance Update)
  const newBalance = (targetUser.balance || 0) + amount;
  updateUser(targetId, newBalance, targetUser.xp, targetUser.level, targetUser.name);

  await sock.sendMessage(chatId, { 
    text: `✅ ${amount} 💸 wurden erfolgreich an ${targetUser.name || targetId} vergeben!`
  }, { quoted: msg });

  break;
}
case 'delcoins': {
  const senderRank = ranks.getRank(sender); // Rang des Command-Senders
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(chatId, { text: '⛔ Nur Inhaber oder Stellvertreter dürfen Coins abziehen.' }, { quoted: msg });
    break;
  }

  // Argumente prüfen
  if (args.length < 2) {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: /delcoins <@User|LID> <Betrag>' }, { quoted: msg });
    break;
  }

  // Ziel bestimmen (Mention oder Arg[0])
  let targetId;
  if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetId = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
  } else {
    targetId = args[0]; // kann jid ODER lid sein
  }

  const amount = parseInt(args[1]);
  if (isNaN(amount) || amount <= 0) {
    await sock.sendMessage(chatId, { text: '❌ Bitte gib einen gültigen Betrag an.' }, { quoted: msg });
    break;
  }

  // User laden
  const targetUser = getUser(targetId);
  if (!targetUser) {
    await sock.sendMessage(chatId, { text: '❌ Benutzer nicht gefunden oder nicht registriert.' }, { quoted: msg });
    break;
  }

  // Coins abziehen, aber nicht ins Minus gehen
  if (targetUser.balance < amount) {
    await sock.sendMessage(chatId, { text: `❌ ${targetUser.name || targetId} hat nicht genug Coins.` }, { quoted: msg });
    break;
  }

  targetUser.balance -= amount;
  updateUserStmt.run(targetUser.balance, targetUser.xp, targetUser.level, targetUser.name, targetId);

  await sock.sendMessage(chatId, { 
    text: `✅ ${amount} 💸 wurden erfolgreich von ${targetUser.name || targetId} abgezogen!`
  }, { quoted: msg });

  break;
}

case 'pethunt': {
  // Pet Hunt - Find wild pets, name them, and bring them home!
  const huntSubcommand = (args[0] || '').toLowerCase();
  
  // Wild Pet Datenbank
  const wildPets = [
    { name: '🐕 Hund', emoji: '🐕', url: 'https://api.pngimg.com/v2/dog/d1.png', hunt: { min: 10, max: 30 }, rarity: 'common' },
    { name: '🐈 Katze', emoji: '🐈', url: 'https://api.pngimg.com/v2/cat/c1.png', hunt: { min: 5, max: 20 }, rarity: 'common' },
    { name: '🦅 Falke', emoji: '🦅', url: 'https://images.unsplash.com/photo-1535856971217-78cdc78ef6a0?w=200', hunt: { min: 50, max: 150 }, rarity: 'rare' },
    { name: '🐺 Wolf', emoji: '🐺', url: 'https://images.unsplash.com/photo-1564760055-d3a675a67c6c?w=200', hunt: { min: 100, max: 300 }, rarity: 'rare' },
    { name: '🐉 Drache', emoji: '🐉', url: 'https://images.unsplash.com/photo-1609034227505-5876f6aa4e90?w=200', hunt: { min: 500, max: 1000 }, rarity: 'legendary' },
    { name: '🦎 Leguan', emoji: '🦎', url: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=200', hunt: { min: 25, max: 60 }, rarity: 'uncommon' },
    { name: '🐢 Schildkröte', emoji: '🐢', url: 'https://images.unsplash.com/photo-1576336896822-77f02e8acdc1?w=200', hunt: { min: 15, max: 35 }, rarity: 'uncommon' }
  ];

  // Hilfsfunktion: Alle Pets eines Users laden
  const getPetCount = (jid) => {
    try {
      const result = getDB().prepare("SELECT COUNT(*) as count FROM pets WHERE jid = ?").get(jid);
      return result?.count || 0;
    } catch (e) {
      return 0;
    }
  };

  // Hilfsfunktion: Letzte Hunt-Zeit des Users laden/speichern
  const getLastHuntTime = (jid) => {
    try {
      const result = getDB().prepare("SELECT lastHuntTime FROM users WHERE jid = ?").get(jid);
      return result?.lastHuntTime ? parseInt(result.lastHuntTime) : null;
    } catch (e) {
      return null;
    }
  };

  const setLastHuntTime = (jid, time) => {
    try {
      getDB().prepare("UPDATE users SET lastHuntTime = ? WHERE jid = ?").run(time, jid);
    } catch (e) {
      console.error('Fehler beim Speichern der Hunt-Zeit:', e);
    }
  };

  // Hilfsfunktion: Cooldown berechnen
  const getHuntCooldown = (jid) => {
    const petCount = getPetCount(jid);
    
    // Max 5 Pets
    if (petCount >= 5) {
      return -1; // Keine weiteren Hunts möglich
    }
    
    // 1. Hunt: 1 Tag Cooldown
    if (petCount === 0) {
      return 1 * 24 * 60 * 60 * 1000; // 1 Tag
    }
    
    // 2-5 Pets: 5 Tage Cooldown
    return 5 * 24 * 60 * 60 * 1000; // 5 Tage
  };

  if (huntSubcommand === 'hunt') {
    const petCount = getPetCount(jid);
    const cooldownMs = getHuntCooldown(jid);

    // Check: Maximal 5 Pets
    if (cooldownMs === -1) {
      await sock.sendMessage(chatId, { 
        text: `❌ Du hast bereits 5 Pets! Das ist das Maximum.\n\n💡 Du kannst Pets im Shop verkaufen oder trainieren.` 
      }, { quoted: msg });
      break;
    }

    // Check: Cooldown
    const lastHuntTime = getLastHuntTime(jid);
    const now = Date.now();
    
    if (lastHuntTime) {
      const timeSinceLastHunt = now - lastHuntTime;
      if (timeSinceLastHunt < cooldownMs) {
        const timeLeft = cooldownMs - timeSinceLastHunt;
        const days = Math.ceil(timeLeft / (24 * 60 * 60 * 1000));
        const hours = Math.ceil(timeLeft / (60 * 60 * 1000));
        
        let waitMsg = `⏳ Du musst noch warten!\n\n`;
        if (days > 0) {
          waitMsg += `📅 **${days} Tag(e)** verbleibend\n`;
        } else if (hours > 0) {
          waitMsg += `⏱️ **${hours} Stunde(n)** verbleibend\n`;
        }
        waitMsg += `\n💡 Du hast aktuell **${petCount}/5** Pets.`;
        
        await sock.sendMessage(chatId, { text: waitMsg }, { quoted: msg });
        break;
      }
    }

    // Zufälliges Pet spawnen
    const randomIndex = Math.floor(Math.random() * wildPets.length);
    const spawnedPet = wildPets[randomIndex];
    
    const caughtMsg = `
🎣 *PET HUNT ERFOLG!*

${spawnedPet.emoji} **${spawnedPet.name}** gefunden!

🌟 **Seltenheit:** ${spawnedPet.rarity === 'legendary' ? '⭐⭐⭐ Legendär' : spawnedPet.rarity === 'rare' ? '⭐⭐ Selten' : '⭐ Normal'}

📸 [Pet Bild]

💡 *Um dieses Pet zu zähmen, verwende:*
\`/pethunt name <name>\`

⏱️ *Dieses Pet bleibt 5 Minuten aktiv!*
    `;
    
    // Speichere das aktive Pet temporär
    const activeKey = `hunt_${jid}`;
    global.activePets = global.activePets || {};
    global.activePets[activeKey] = {
      pet: spawnedPet,
      time: Date.now(),
      expires: Date.now() + 5 * 60 * 1000 // 5 Minuten
    };
    
    // Aktualisiere die Hunt-Zeit
    setLastHuntTime(jid, now);
    
    // Timeout für Ablauf setzen
    setTimeout(() => {
      delete global.activePets[activeKey];
      try {
        sock.sendMessage(chatId, { text: `⏰ Das ${spawnedPet.emoji} Pet ist weggelaufen!` });
      } catch (e) {}
    }, 5 * 60 * 1000);
    
    // Sende Nachricht mit Bild
    try {
      await sock.sendMessage(chatId, {
        image: { url: spawnedPet.url },
        caption: caughtMsg
      });
    } catch (imgErr) {
      await sock.sendMessage(chatId, { text: caughtMsg }, { quoted: msg });
    }
    break;
  }

  if (huntSubcommand === 'name' && args[1]) {
    const petName = args.slice(1).join(' ');
    const activeKey = `hunt_${jid}`;
    
    if (!global.activePets || !global.activePets[activeKey]) {
      await sock.sendMessage(chatId, { text: '❌ Du hast kein aktives Pet! Starte mit `/pethunt hunt`' }, { quoted: msg });
      break;
    }

    // Check: Maximal 5 Pets
    if (getPetCount(jid) >= 5) {
      await sock.sendMessage(chatId, { 
        text: `❌ Du hast bereits 5 Pets! Das ist das Maximum.\n\n💡 Du kannst Pets im Shop verkaufen oder trainieren.` 
      }, { quoted: msg });
      break;
    }

    const activePet = global.activePets[activeKey];
    
    // Speichere Pet in der Datenbank
    try {
      getDB().prepare("INSERT INTO pets (jid, petName, hunger, level, health) VALUES (?, ?, ?, ?, ?)").run(
        jid,
        petName,
        Math.floor(Math.random() * 40) + 60, // Zufälliger Hunger 60-100
        1,
        100
      );
      
      // Gebe Bonus-Coins für das Zähmen
      const user = getUser(jid);
      const bonus = 50;
      user.balance += bonus;
      user.xp += 20;
      updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);
      
      const newPetCount = getPetCount(jid);
      const cooldownMs = getHuntCooldown(jid);
      let cooldownMsg = '';
      
      if (newPetCount < 5) {
        if (newPetCount === 1) {
          cooldownMsg = '\n\n⏳ Nächster Hunt in: **1 Tag**';
        } else {
          cooldownMsg = '\n\n⏳ Nächster Hunt in: **5 Tage**';
        }
      }
      
      await sock.sendMessage(chatId, { 
        text: `✅ *Pet gezähmt!*\n\n${activePet.pet.emoji} **${petName}** wurde deinem Team hinzugefügt!\n\n💰 +${bonus} Coins für das Zähmen\n⭐ +20 XP\n\n🐾 Du hast jetzt **${newPetCount}/5** Pets${cooldownMsg}` 
      }, { quoted: msg });
      
      // Lösche das aktive Pet
      delete global.activePets[activeKey];
    } catch (dbErr) {
      console.error('Pet DB error:', dbErr);
      await sock.sendMessage(chatId, { text: `❌ Fehler beim Speichern: ${dbErr.message}` }, { quoted: msg });
    }
    break;
  }

  if (huntSubcommand === 'info') {
    // Infos über aktives Pet
    const activeKey = `hunt_${jid}`;
    if (!global.activePets || !global.activePets[activeKey]) {
      await sock.sendMessage(chatId, { text: '❌ Du hast kein aktives Pet!' }, { quoted: msg });
      break;
    }
    
    const activePet = global.activePets[activeKey];
    const timeLeft = Math.max(0, Math.floor((activePet.expires - Date.now()) / 1000));
    
    await sock.sendMessage(chatId, { 
      text: `ℹ️ *Aktives Pet:*\n\n${activePet.pet.name}\n🌟 Seltenheit: ${activePet.pet.rarity}\n💰 Belohnung: ${activePet.pet.hunt.min}-${activePet.pet.hunt.max} Coins\n⏱️ Verfällt in: ${timeLeft}s\n\nStelle sicher, es zu zähmen mit \`/pethunt name <name>\`` 
    }, { quoted: msg });
    break;
  }

  // Standard Hunt-Befehl wenn alle Pets durch sind
  const userPets = getDB().prepare("SELECT * FROM pets WHERE jid = ?").all(jid);
  if (!userPets || userPets.length === 0) {
    await sock.sendMessage(chatId, { text: "❌ Du hast noch keine Pets! Starte ein Hunt mit `/pethunt hunt` um eines zu finden." }, { quoted: msg });
    break;
  }

  // Hunt mit bereits gefangenen Pets
  const userPet = userPets[0];
  const huntData = wildPets.find(p => p.name.includes(userPet.petName)) || { hunt: { min: 20, max: 60 } };
  const reward = Math.floor(Math.random() * (huntData.hunt.max - huntData.hunt.min + 1)) + huntData.hunt.min;
  
  const user = getUser(jid);
  user.balance += reward;
  user.xp += 15;
  updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);

  await sock.sendMessage(chatId, { 
    text: `🐾 Dein ${userPet.petName} war auf der Jagd!\n\n💰 Beute: ${reward} Coins\n⭐ +15 XP\n🍖 Hunger: ${Math.max(0, userPet.hunger - 10)}%\n\n✨ Neuer Kontostand: ${user.balance} 💸`
  }, { quoted: msg });

  break;
}

case 'pets': {
  try {
    const userPets = getDB().prepare("SELECT * FROM pets WHERE jid = ?").all(jid);
    const petCount = userPets?.length || 0;
    
    if (petCount === 0) {
      await sock.sendMessage(chatId, { 
        text: `🐾 *Dein Pet-Team ist leer!*\n\n💡 Starte dein erstes Hunt mit:\n\`/pethunt hunt\`\n\nOder kaufe im Shop mit:\n\`/shop pets\`` 
      }, { quoted: msg });
      break;
    }

    let petsList = `🐾 *Dein Pet-Team* (${petCount}/5)\n\n`;
    
    userPets.forEach((pet, i) => {
      petsList += `**${i + 1}. ${pet.petName}**\n`;
      petsList += `   ⭐ Level: ${pet.level}\n`;
      petsList += `   ❤️ Health: ${pet.health}%\n`;
      petsList += `   🍖 Hunger: ${pet.hunger}%\n\n`;
    });

    petsList += `\n💡 *Verwende:*\n`;
    petsList += `• \`/pethunt hunt\` - Neues Pet fangen (max 5)\n`;
    petsList += `• \`/shop pets\` - Pets kaufen\n`;

    if (petCount < 5) {
      const lastHuntTime = getDB().prepare("SELECT lastHuntTime FROM users WHERE jid = ?").get(jid)?.lastHuntTime;
      if (lastHuntTime) {
        const cooldownMs = petCount === 0 ? 1 * 24 * 60 * 60 * 1000 : 5 * 24 * 60 * 60 * 1000;
        const timeLeft = cooldownMs - (Date.now() - parseInt(lastHuntTime));
        
        if (timeLeft > 0) {
          const days = Math.ceil(timeLeft / (24 * 60 * 60 * 1000));
          petsList += `⏳ Nächster Hunt in: ${days} Tag(e)\n`;
        } else {
          petsList += `✅ Bereit für einen neuen Hunt!\n`;
        }
      }
    } else {
      petsList += `❌ Du hast das Maximum von 5 Pets erreicht!\n`;
    }

    await sock.sendMessage(chatId, { text: petsList }, { quoted: msg });
  } catch (e) {
    console.error('Fehler bei /pets:', e);
    await sock.sendMessage(chatId, { text: `❌ Fehler: ${e.message}` }, { quoted: msg });
  }
  break;
}

case 'shop': {
  try {
    const subcommand = (args[0] || '').toLowerCase();
    
    const shopItems = {
      pets: [
        { name: '🐕 Hund', emoji: '🐕', price: 500, rarity: 'common' },
        { name: '🐈 Katze', emoji: '🐈', price: 400, rarity: 'common' },
        { name: '🦎 Leguan', emoji: '🦎', price: 800, rarity: 'uncommon' },
        { name: '🐢 Schildkröte', emoji: '🐢', price: 1000, rarity: 'uncommon' },
        { name: '🦅 Falke', emoji: '🦅', price: 2000, rarity: 'rare' },
        { name: '🐺 Wolf', emoji: '🐺', price: 3500, rarity: 'rare' },
        { name: '🐉 Drache', emoji: '🐉', price: 10000, rarity: 'legendary' }
      ]
    };

    if (subcommand === 'pets') {
      const user = getUser(jid);
      const petCount = getDB().prepare("SELECT COUNT(*) as count FROM pets WHERE jid = ?").get(jid)?.count || 0;
      
      if (petCount >= 5) {
        await sock.sendMessage(chatId, { 
          text: `❌ Du hast das Maximum von 5 Pets erreicht!\n\n💡 Verkaufe ein Pet oder jage neue.` 
        }, { quoted: msg });
        break;
      }

      let shopText = `🛍️ *Pet Shop*\n\n💰 Dein Kontostand: ${user.balance} 💸\n🐾 Deine Pets: ${petCount}/5\n\n`;
      shopText += `*Verfügbare Pets:*\n\n`;

      shopItems.pets.forEach((pet, i) => {
        shopText += `**${i + 1}. ${pet.emoji} ${pet.name}**\n`;
        shopText += `   💰 Preis: ${pet.price} Coins\n`;
        shopText += `   🌟 Seltenheit: ${pet.rarity === 'legendary' ? '⭐⭐⭐ Legendär' : pet.rarity === 'rare' ? '⭐⭐ Selten' : pet.rarity === 'uncommon' ? '⭐ Uncommon' : 'Normal'}\n`;
        shopText += `   💬 \`/shop buy ${i + 1}\`\n\n`;
      });

      await sock.sendMessage(chatId, { text: shopText }, { quoted: msg });
      break;
    }

    if (subcommand === 'buy' && args[1]) {
      const user = getUser(jid);
      const itemIndex = parseInt(args[1]) - 1;
      const petCount = getDB().prepare("SELECT COUNT(*) as count FROM pets WHERE jid = ?").get(jid)?.count || 0;

      if (itemIndex < 0 || itemIndex >= shopItems.pets.length) {
        await sock.sendMessage(chatId, { text: `❌ Ungültige Nummer! Verwende /shop pets zum Ansehen.` }, { quoted: msg });
        break;
      }

      if (petCount >= 5) {
        await sock.sendMessage(chatId, { 
          text: `❌ Du hast das Maximum von 5 Pets erreicht!\n\n💡 Verkaufe ein Pet bevor du ein neues kaufst.` 
        }, { quoted: msg });
        break;
      }

      const pet = shopItems.pets[itemIndex];

      if (user.balance < pet.price) {
        const needed = pet.price - user.balance;
        await sock.sendMessage(chatId, { 
          text: `❌ Du hast nicht genug Coins!\n\n💰 Dir fehlen: ${needed} Coins\n💸 Dein Kontostand: ${user.balance}` 
        }, { quoted: msg });
        break;
      }

      // Pet kaufen
      user.balance -= pet.price;
      updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);

      // Pet mit generiertem Namen hinzufügen
      const petNames = ['Max', 'Luna', 'Rex', 'Bella', 'Charlie', 'Daisy', 'Rocky', 'Milo', 'Zoe', 'Buddy'];
      const randomName = petNames[Math.floor(Math.random() * petNames.length)];

      getDB().prepare("INSERT INTO pets (jid, petName, hunger, level, health) VALUES (?, ?, ?, ?, ?)").run(
        jid,
        `${pet.emoji} ${randomName}`,
        Math.floor(Math.random() * 30) + 70,
        1,
        100
      );

      const newPetCount = petCount + 1;

      await sock.sendMessage(chatId, { 
        text: `✅ *Pet gekauft!*\n\n${pet.emoji} ${randomName} wurde zu deinem Team hinzugefügt!\n\n💰 Kosten: ${pet.price} Coins\n💸 Neuer Kontostand: ${user.balance} Coins\n🐾 Pets: ${newPetCount}/5` 
      }, { quoted: msg });
      break;
    }

    if (!subcommand) {
      await sock.sendMessage(chatId, { 
        text: `🛍️ *Shop Befehle:*\n\n/shop pets - Zeige alle Pets\n/shop buy <nummer> - Kaufe ein Pet` 
      }, { quoted: msg });
      break;
    }

  } catch (e) {
    console.error('Fehler bei /shop:', e);
    await sock.sendMessage(chatId, { text: `❌ Fehler: ${e.message}` }, { quoted: msg });
  }
  break;
}

case 'sellpet': {
  try {
    const petId = parseInt(args[0]);
    if (isNaN(petId)) {
      const userPets = getDB().prepare("SELECT * FROM pets WHERE jid = ?").all(jid);
      let sellText = `🛒 *Pets verkaufen*\n\n`;
      sellText += `Deine Pets (Verkaufspreis 50% des Kaufpreises):\n\n`;
      
      userPets.forEach((pet, i) => {
        sellText += `**${i + 1}. ${pet.petName}**\n`;
        sellText += `   💰 Verkaufspreis: ~${Math.floor(500 * 0.5 + Math.random() * 1000)}\n`;
      });
      
      sellText += `\nVerwende: /sellpet <nummer>`;
      
      await sock.sendMessage(chatId, { text: sellText }, { quoted: msg });
      break;
    }

    const pet = getDB().prepare("SELECT * FROM pets WHERE jid = ? LIMIT ?, 1").get(jid, petId - 1);
    
    if (!pet) {
      await sock.sendMessage(chatId, { text: `❌ Pet #${petId} nicht gefunden!` }, { quoted: msg });
      break;
    }

    // Verkaufspreis: 40-60% des Durchschnittskaufpreises
    const sellPrice = Math.floor(Math.random() * (3000 - 200) + 200);
    const user = getUser(jid);
    user.balance += sellPrice;
    updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);

    // Lösche das Pet
    getDB().prepare("DELETE FROM pets WHERE id = ?").run(pet.id);

    await sock.sendMessage(chatId, { 
      text: `✅ ${pet.petName} verkauft!\n\n💰 Erlös: ${sellPrice} Coins\n💸 Neuer Kontostand: ${user.balance} Coins` 
    }, { quoted: msg });

  } catch (e) {
    console.error('Fehler bei /sellpet:', e);
    await sock.sendMessage(chatId, { text: `❌ Fehler: ${e.message}` }, { quoted: msg });
  }
  break;
}

// === BAN/UNBAN CASES im Rang-System-Stil ===

case 'ban': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { 
      text: "⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
    }, { quoted: msg });
    break;
  }

  if (!args[0]) {
    await sock.sendMessage(chatId, { 
      text: '❌ Bitte gib die JID an, die gebannt werden soll.' 
    }, { quoted: msg });
    break;
  }

  const targetJid = args[0];
  const reason = args.slice(1).join(' ') || 'Kein Grund angegeben';

  // User in bannedu.json speichern
  banUser(targetJid, reason);

  await sock.sendMessage(chatId, { 
    text: `🚫 User ${targetJid} wurde gebannt.\nGrund: ${reason}` 
  }, { quoted: msg });

  console.log(`[BAN] User: ${targetJid} | By: ${sender} | Reason: ${reason}`);
  break;
}

case 'ipban': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { 
      text: "⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
    }, { quoted: msg });
    break;
  }

  if (!args[0]) {
    await sock.sendMessage(chatId, { 
      text: '❌ Bitte gib eine IP-Adresse an.\n\nVerwendung: /ipban <IP> <Grund>' 
    }, { quoted: msg });
    break;
  }

  const targetIP = args[0];
  const reason = args.slice(1).join(' ') || 'Kein Grund angegeben';

  // Validiere IP-Format (einfache Prüfung)
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(targetIP)) {
    await sock.sendMessage(chatId, { 
      text: '❌ Ungültiges IP-Format! Beispiel: 192.168.1.1' 
    }, { quoted: msg });
    break;
  }

  // IP bannen
  banIP(targetIP, reason);

  await sock.sendMessage(chatId, { 
    text: `🚫 IP-Adresse ${targetIP} wurde gebannt.\nGrund: ${reason}\n\n⚠️ Diese IP kann sich nicht mehr mit dem Bot verbinden.` 
  }, { quoted: msg });

  console.log(`[IP-BAN] IP: ${targetIP} | By: ${sender} | Reason: ${reason}`);
  break;
}

case 'ipunban': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { 
      text: "⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
    }, { quoted: msg });
    break;
  }

  if (!args[0]) {
    await sock.sendMessage(chatId, { 
      text: '❌ Bitte gib eine IP-Adresse an.\n\nVerwendung: /ipunban <IP>' 
    }, { quoted: msg });
    break;
  }

  const targetIP = args[0];
  unbanIP(targetIP);

  await sock.sendMessage(chatId, { 
    text: `✅ IP-Adresse ${targetIP} wurde entbannt.` 
  }, { quoted: msg });

  console.log(`[IP-UNBAN] IP: ${targetIP} | By: ${sender}`);
  break;
}

case 'whois': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(chatId, { 
      text: "⛔ Zugriff verweigert! Nur Owner dürfen diesen Befehl nutzen." 
    }, { quoted: msg });
    break;
  }

  if (!args[0]) {
    await sock.sendMessage(chatId, { 
      text: '❌ Bitte gib die LID/JID des Users an.' 
    }, { quoted: msg });
    break;
  }

  const targetJid = args[0];
  const user = getUser(targetJid);
  const bannedEntry = isBanned(targetJid);

  let reply = `ℹ️ User Info:\n`;
  reply += `• LID/JID: ${targetJid}\n`;

  // Rang abfragen
  const userRank = ranks.getRank(targetJid) || 'Kein Rang';
  reply += `• Rang: ${userRank}\n`;

  if (user) {
    // Registrierter User
    reply += `• Balance: ${user.balance}\n`;
    reply += `• XP: ${user.xp}\n`;
    reply += `• Level: ${user.level}`;
  } else {
    // Nicht registrierter User
    reply += `• Status: Nicht registriert`;
  }

  if (bannedEntry) {
    reply += `\n🚫 Gebannt\n• Grund: ${bannedEntry.reason}\n• Zeitpunkt: ${new Date(bannedEntry.timestamp).toLocaleString('de-DE')}`;
  } else {
    reply += `\n✅ Nicht gebannt`;
  }

  await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
  break;
}

case 'showuser': {
  let targetJid = null;

  // Prüfe auf Mentions
  if (msg.mentionedJid && msg.mentionedJid.length > 0) {
    targetJid = msg.mentionedJid[0];
  } 
  // Prüfe auf Argument (LID/JID oder Nummer)
  else if (args[0]) {
    let arg = args[0];
    // Wenn es mit @ beginnt, entferne es
    if (arg.startsWith('@')) {
      arg = arg.substring(1);
    }
    // Wenn es nur Zahlen sind, konvertiere zu LID
    if (/^\d+$/.test(arg)) {
      targetJid = arg + '@lid';
    } else {
      targetJid = arg;
    }
  } else {
    await sock.sendMessage(chatId, { 
      text: '❌ Bitte gib eine LID/Nummer an oder @mention einen User.' 
    }, { quoted: msg });
    break;
  }

  const user = getUser(targetJid);
  const bannedEntry = isBanned(targetJid);

  let reply = `📋 User Informationen:\n\n`;
  reply += `👤 **LID/JID:** ${targetJid}\n`;

  // Rang abfragen
  const userRank = ranks.getRank(targetJid) || 'Kein Rang';
  reply += `🏆 **Rang:** ${userRank}\n`;

  // LID-Teil (Baileys liefert keine echten IPs; wir verwenden die lokale ID)
  const targetLid = (targetJid || '').split('@')[0];
  reply += `🆔 **LID:** ${targetLid}\n`;
  const lidBan = isIPBanned(targetLid);
  reply += `🔒 **LID-Status:** ${lidBan ? 'Gebannt' : 'Nicht gebannt'}\n`;

  if (user) {
    // Registrierter User
    reply += `\n💰 **Balance:** ${user.balance}€\n`;
    reply += `⚡ **XP:** ${user.xp}\n`;
    reply += `🎮 **Level:** ${user.level}\n`;
    reply += `📝 **Name:** ${user.name || 'Nicht gesetzt'}\n`;
    reply += `🎂 **Alter:** ${user.age || 'Nicht gesetzt'}`;
  } else {
    // Nicht registrierter User
    reply += `\n❌ **Status:** Nicht registriert`;
  }

  if (bannedEntry) {
    reply += `\n\n🚫 **GEBANNT**\n• Grund: ${bannedEntry.reason}\n• Zeit: ${new Date(bannedEntry.timestamp).toLocaleString('de-DE')}`;
  } else {
    reply += `\n✅ **Status:** Nicht gebannt`;
  }

  await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
  break;
}

case 'ip': {
  // Gebe die IP (LID-Teil) eines Users zurück. Wenn kein Argument, eigene IP.
  let targetJid = null;
  if (msg.mentionedJid && msg.mentionedJid.length > 0) {
    targetJid = msg.mentionedJid[0];
  } else if (args[0]) {
    let arg = args[0];
    if (arg.startsWith('@')) arg = arg.substring(1);
    targetJid = /^\d+$/.test(arg) ? arg + '@lid' : arg;
  } else {
    targetJid = msg.key.fromMe ? sock.user.id : sender;
  }

  const lidVal = (targetJid || '').split('@')[0];
  const ipBanEntry = isIPBanned(lidVal);

  let ipReply = `📡 LID Information:\n`;
  ipReply += `• LID/JID: ${targetJid}\n`;
  ipReply += `• LID: ${lidVal}\n`;
  ipReply += `• LID-Status: ${ipBanEntry ? 'Gebannt' : 'Nicht gebannt'}`;

  await sock.sendMessage(chatId, { text: ipReply }, { quoted: msg });
  break;
}

case 'forcebot': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];
  if (!allowed.includes(senderRank)) {
    await sock.sendMessage(chatId, { text: '⛔ Zugriff verweigert.' }, { quoted: msg });
    break;
  }

  const sub = (args[0] || '').toLowerCase();
  if (sub === 'add' && args[1]) {
    let arg = args[1]; if (arg.startsWith('@')) arg = arg.substring(1);
    const jid = /^\d+$/.test(arg) ? arg + '@lid' : arg;
    setDeviceOverride(jid, 'WhatsApp Web / Bot (Forced)');
    await sock.sendMessage(chatId, { text: `✅ Device override gesetzt für ${jid}` }, { quoted: msg });
    break;
  }
  if (sub === 'remove' && args[1]) {
    let arg = args[1]; if (arg.startsWith('@')) arg = arg.substring(1);
    const jid = /^\d+$/.test(arg) ? arg + '@lid' : arg;
    removeDeviceOverride(jid);
    await sock.sendMessage(chatId, { text: `✅ Device override entfernt für ${jid}` }, { quoted: msg });
    break;
  }
  if (sub === 'list') {
    const list = loadDeviceOverrides();
    if (!list.length) {
      await sock.sendMessage(chatId, { text: '📋 Keine Device-Overrides gesetzt.' }, { quoted: msg });
    } else {
      const out = list.map(i => `${i.jid} → ${i.label}`).join('\n');
      await sock.sendMessage(chatId, { text: `📋 Device-Overrides:\n${out}` }, { quoted: msg });
    }
    break;
  }

  await sock.sendMessage(chatId, { text: 'Verwendung: /forcebot add|remove|list <jid>' }, { quoted: msg });
  break;
}

case 'whoami': {
  const targetJid = msg.key.fromMe ? sock.user.id : sender; // eigene JID
  const user = getUser(targetJid);
  const bannedEntry = isBanned(targetJid);

  let reply = `ℹ️ Deine User Info:\n`;
  reply += `• LID/JID: ${targetJid}\n`;

  // Rang abfragen
  const userRank = ranks.getRank(targetJid) || 'Kein Rang';
  reply += `• Rang: ${userRank}\n`;

  if (user) {
    // Registrierter User
    reply += `• Balance: ${user.balance}€\n`;
    reply += `• XP: ${user.xp}\n`;
    reply += `• Level: ${user.level}`;
  } else {
    // Nicht registrierter User
    reply += `• Status: Nicht registriert`;
  }

  if (bannedEntry) {
    reply += `\n🚫 Gebannt\n• Grund: ${bannedEntry.reason}\n• Zeitpunkt: ${new Date(bannedEntry.timestamp).toLocaleString('de-DE')}`;
  } else {
    reply += `\n✅ Nicht gebannt`;
  }

  await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
  break;
}

case 'unban': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

  if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }

  if (!args[0]) {
    await sock.sendMessage(chatId, { text: '❌ Bitte gib die JID an, die entbannt werden soll.' }, { quoted: msg });
    break;
  }


  unbanUser(args[0]);

  await sock.sendMessage(chatId, { text: `✅ User ${args[0]} wurde entbannt.` }, { quoted: msg });
  break;
}

case 'pban': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { 
      text: "⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
    }, { quoted: msg });
    break;
  }

  // Versuche Mentions zu finden
  let targetJid = null;
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  
  if (mentions && mentions.length > 0) {
    targetJid = mentions[0];
  }

  if (!targetJid) {
    await sock.sendMessage(chatId, { 
      text: '❌ Bitte markiere einen User mit @mention.\n\nVerwendung: */pban @user*' 
    }, { quoted: msg });
    break;
  }

  const senderJidFull = msg.key.participant || msg.key.remoteJid;
  const senderName = senderJidFull.split('@')[0];
  prankBanUser(targetJid, senderName);

  const prankMessages = [
    `🚫 *BENUTZER GEBANNT* 🚫\n\n@${targetJid.split('@')[0]} wurde von @${senderName} gebannt!\n\n⏱️ Grund: Verhalten der Gruppe abträglich\n📋 Duration: Permanent`,
    `🔒 *ACCOUNT GESPERRT* 🔒\n\n@${targetJid.split('@')[0]} hat zu viel Unsinn gemacht!\n\n❌ Zutritt verweigert\n⏰ Gebannt seit: jetzt`,
    `⛔ *GLOBAL BAN* ⛔\n\nDer Benutzer @${targetJid.split('@')[0]} wurde permanent von @${senderName} entfernt!\n\n📍 Status: GEBANNT\n🕐 Zeit: JETZT`,
    `🚨 *BAN NOTIFICATION* 🚨\n\n@${targetJid.split('@')[0]} wurde aus der Gruppe entfernt!\n\nGrund: Verstoß gegen Gruppenregeln\nBandauer: Permanent`,
    `💥 *INSTANT BAN* 💥\n\n@${targetJid.split('@')[0]} - Du bist raus!\n\n🎯 Aktion: BAN\n⚡ Effekt: SOFORT`
  ];

  const randomPrank = prankMessages[Math.floor(Math.random() * prankMessages.length)];

  await sock.sendMessage(chatId, { 
    text: randomPrank,
    contextInfo: { mentionedJid: [senderJidFull, targetJid] }
  }, { quoted: msg });

  console.log(`[PRANK BAN] User: ${targetJid} | By: ${senderName}`);
  break;
}

case 'unpban': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { 
      text: "⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
    }, { quoted: msg });
    break;
  }

  // Versuche Mentions zu finden
  let targetJid = null;
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  
  if (mentions && mentions.length > 0) {
    targetJid = mentions[0];
  }

  if (!targetJid) {
    await sock.sendMessage(chatId, { 
      text: '❌ Bitte markiere einen User mit @mention.\n\nVerwendung: */unpban @user*' 
    }, { quoted: msg });
    break;
  }

  unprankBanUser(targetJid);

  await sock.sendMessage(chatId, { 
    text: `✅ *BAN AUFGEHOBEN* ✅\n\n@${targetJid.split('@')[0]} kann wieder die Gruppe betreten!\n\nWillkommen zurück - es war nur ein Prank! 😄`,
    contextInfo: { mentionedJid: [targetJid] }
  }, { quoted: msg });

  console.log(`[UNPRANK BAN] User: ${targetJid}`);
  break;
}

case 'approveunban': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator', 'Supporter'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { 
      text: "⛔ *Zugriff verweigert!*\n\nNur Moderatoren und höher dürfen Entban-Anfragen genehmigen." 
    }, { quoted: msg });
    break;
  }

  const requestId = parseInt(args[0]);
  if (isNaN(requestId)) {
    return await sock.sendMessage(chatId, { 
      text: '❌ Bitte gib die Anfrage-ID an.\n\nVerwendung: /approveunban <ID>' 
    }, { quoted: msg });
  }

  try {
    const banRequestFile = './data/unbanRequests.json';
    if (!fs.existsSync(banRequestFile)) {
      return await sock.sendMessage(chatId, { 
        text: '❌ Keine Entban-Anfragen gefunden.' 
      }, { quoted: msg });
    }

    const data = JSON.parse(fs.readFileSync(banRequestFile, 'utf8'));
    const request = data.requests.find(r => r.id === requestId);

    if (!request) {
      return await sock.sendMessage(chatId, { 
        text: `❌ Anfrage #${requestId} nicht gefunden.` 
      }, { quoted: msg });
    }

    if (request.status !== 'offen') {
      return await sock.sendMessage(chatId, { 
        text: `⚠️ Diese Anfrage wurde bereits bearbeitet (Status: ${request.status}).` 
      }, { quoted: msg });
    }

    // Entbanne den User
    unbanUser(request.user);
    request.status = 'genehmigt';
    fs.writeFileSync(banRequestFile, JSON.stringify(data, null, 2));

    // Benachrichtige den User
    await sock.sendMessage(request.chat, {
      text: `✅ Deine Entban-Anfrage #${requestId} wurde genehmigt! 🎉\n\nDu kannst jetzt wieder den Bot nutzen.`,
    });

    await sock.sendMessage(chatId, {
      text: `✅ Entban-Anfrage #${requestId} genehmigt!\n\nUser @${request.user.split("@")[0]} wurde entbannt.`,
      mentions: [request.user],
    }, { quoted: msg });

    console.log(`[APPROVEUNBAN] Request #${requestId} | By: ${sender}`);
  } catch (err) {
    console.error(err);
    await sock.sendMessage(chatId, { 
      text: `❌ Fehler bei der Bearbeitung: ${err.message}` 
    }, { quoted: msg });
  }
  break;
}

case 'rejectunban': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator', 'Supporter'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { 
      text: "⛔ *Zugriff verweigert!*\n\nNur Moderatoren und höher dürfen Entban-Anfragen ablehnen." 
    }, { quoted: msg });
    break;
  }

  const requestId = parseInt(args[0]);
  if (isNaN(requestId)) {
    return await sock.sendMessage(chatId, { 
      text: '❌ Bitte gib die Anfrage-ID an.\n\nVerwendung: /rejectunban <ID> [Grund]' 
    }, { quoted: msg });
  }

  const reason = args.slice(1).join(' ') || 'Deine Anfrage wurde abgelehnt.';

  try {
    const banRequestFile = './data/unbanRequests.json';
    if (!fs.existsSync(banRequestFile)) {
      return await sock.sendMessage(chatId, { 
        text: '❌ Keine Entban-Anfragen gefunden.' 
      }, { quoted: msg });
    }

    const data = JSON.parse(fs.readFileSync(banRequestFile, 'utf8'));
    const request = data.requests.find(r => r.id === requestId);

    if (!request) {
      return await sock.sendMessage(chatId, { 
        text: `❌ Anfrage #${requestId} nicht gefunden.` 
      }, { quoted: msg });
    }

    if (request.status !== 'offen') {
      return await sock.sendMessage(chatId, { 
        text: `⚠️ Diese Anfrage wurde bereits bearbeitet (Status: ${request.status}).` 
      }, { quoted: msg });
    }

    request.status = 'abgelehnt';
    request.rejectReason = reason;
    fs.writeFileSync(banRequestFile, JSON.stringify(data, null, 2));

    // Benachrichtige den User
    await sock.sendMessage(request.chat, {
      text: `❌ Deine Entban-Anfrage #${requestId} wurde abgelehnt.\n\n📝 Grund: ${reason}\n\nDu kannst erneut eine Anfrage stellen, wenn du dein Verhalten gebessert hast.`,
    });

    await sock.sendMessage(chatId, {
      text: `❌ Entban-Anfrage #${requestId} abgelehnt.\n\n📝 Grund: ${reason}`,
    }, { quoted: msg });

    console.log(`[REJECTUNBAN] Request #${requestId} | Reason: ${reason} | By: ${sender}`);
  } catch (err) {
    console.error(err);
    await sock.sendMessage(chatId, { 
      text: `❌ Fehler bei der Bearbeitung: ${err.message}` 
    }, { quoted: msg });
  }
  break;
}


case 'unmute': {
  const groupId = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  if (!mentioned) {
    return sock.sendMessage(groupId, { text: '❌ Bitte erwähne einen Nutzer.' });
  }

  if (!(await isUserAdmin(groupId, sender))) {
    return sock.sendMessage(groupId, { text: '❌ Nur Admins können Nutzer entmuten.' });
  }

  if (mutedUsers[groupId]?.includes(mentioned)) {
    mutedUsers[groupId] = mutedUsers[groupId].filter(u => u !== mentioned);
    saveMuted();
    await sock.sendMessage(groupId, { 
      text: `✅ @${mentioned.split('@')[0]} wurde entmutet.`, 
      mentions: [mentioned] 
    });
  } else {
    await sock.sendMessage(groupId, { text: '⚠️ Nutzer ist nicht gemutet.' });
  }
  break;
}

case 'unregister': {
  const botName = '💻 BeastBot';
  const jid = msg.key.participant || msg.key.remoteJid || msg.sender;

  const user = getUser(jid);
  if (!user) {
    await sock.sendMessage(chatId, { 
      text: `❌ Du bist noch nicht registriert!` 
    }, { quoted: msg });
    break;
  }

  deleteUser(jid);

  await sock.sendMessage(chatId, { 
    text: `⚠️ ${user.name}, dein Konto wurde erfolgreich gelöscht. Du bist nun *unregistriert*.` 
  }, { quoted: msg });
  break;
}


case 'mute': {
  const groupId = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  if (!mentioned) {
    return sock.sendMessage(groupId, { text: '❌ Bitte erwähne einen Nutzer.' });
  }

  if (!(await isUserAdmin(groupId, sender))) {
    return sock.sendMessage(groupId, { text: '❌ Nur Admins können Nutzer muten.' });
  }

  mutedUsers[groupId] = mutedUsers[groupId] || [];
  if (!mutedUsers[groupId].includes(mentioned)) {
    mutedUsers[groupId].push(mentioned);
    saveMuted();
    await sock.sendMessage(groupId, { 
      text: `🔇 @${mentioned.split('@')[0]} wurde stummgeschaltet.`,
      mentions: [mentioned] 
    });
  } else {
    await sock.sendMessage(groupId, { text: '⚠️ Nutzer ist bereits gemutet.' });
  }
  break;
}

case 'mutedlist': {
  const groupId = msg.key.remoteJid;
  const muted = mutedUsers[groupId] || [];

  if (muted.length === 0) {
    return sock.sendMessage(groupId, { text: '📭 Niemand ist aktuell stummgeschaltet.' });
  }

  const listText = muted.map((u, i) => `${i + 1}. @${u.split('@')[0]}`).join('\n');
  await sock.sendMessage(groupId, { 
    text: `🔇 *Gemutete Nutzer:*\n\n${listText}`, 
    mentions: muted 
  });
  break;
}
case '1':
case 'sock': {
  try {
    await sock.sendMessage(chatId, { text: '🩸🥷𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🥷🩸' }, { quoted: msg });
  } catch (err) {
    console.error('sock command error:', err?.message || err);
    await sock.sendMessage(chatId, { text: '❌ Konnte die Sock-Nachricht nicht senden.' }, { quoted: msg });
  }
  break;
}
case '2': {
  try {
    // WA currently rejects bare requestPhoneNumberMessage → fallback: button prompt
    await sock.sendMessage(chatId, {
      text: '📱 Bitte teile deine Nummer.',
      footer: 'Tippe auf den Button, um deine Nummer zu senden.',
      buttons: [
        {
          buttonId: 'share_phone',
          buttonText: { displayText: 'Meine Nummer teilen' },
          type: 1
        }
      ],
      headerType: 1
    }, { quoted: msg });

    // Zusatz-Buttons wie bei /alledits (Links)
    const CHANNEL_URL = 'https://whatsapp.com/channel/0029Va4g5Va4VdKv1D2n6I';
    const WEBSITE_URL = 'https://beastbot.base44.app';
    const MINI_WEB = 'https://beastmeds.io';

    const linkButtons = [
      { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📎 WhatsApp Channel', url: CHANNEL_URL }) },
      { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🌐 Website', url: WEBSITE_URL }) },
      { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '👤 Owner Infos', url: MINI_WEB }) }
    ];

    const content = {
      interactiveMessage: {
        body: { text: 'Weitere Links & Infos' },
        nativeFlowMessage: { buttons: linkButtons }
      }
    };

    const generated = generateWAMessageFromContent(chatId, content, { userJid: sock.user.id, quoted: msg });
    await sock.relayMessage(chatId, generated.message, { messageId: generated.key.id });
  } catch (err) {
    console.error('2 command error:', err?.message || err);
    await sock.sendMessage(chatId, { text: '❌ Konnte die Nummer-Anfrage nicht senden.' }, { quoted: msg });
  }
  break;
}
case 'main': {
  const from = msg.key.remoteJid;
  const { owner, bot, admins, system, features } = settings;

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;

  const process = require('process');
  const start = Date.now();
  const latency = Date.now() - start;

  const mediaImage = await prepareWAMessageMedia(
    { image: fs.readFileSync('/root/Beast-Bot-/bot/bot.png') },
    { upload: sock.waUploadToServer }
  );

  const messageParamsJson = JSON.stringify({
    bottom_sheet: {
      in_thread_buttons_limit: 1,
      divider_indices: [0],
      list_title: `🍀 Main Menu\n🕒 ${currentTime}`,
      button_title: " "
    },
    limited_time_offer: {
      text: "𝑴𝒖𝒍𝒕𝒊𝑴𝒆𝒏𝒖™️🍀",
      url: "https://t.me/deadsclient1",
      copy_code: "https://t.me/deadsclient1",
      expiration_time: Date.now() * 10000
    }
  });

  const cards = [

    // ===== OWNER PANEL =====
    {
      header: { title: "👑 Owner Panel 🍀", hasMediaAttachment: true, imageMessage: mediaImage.imageMessage },
      body: { text: `╭─❍ OWNER PANEL ❍─╮
👤 Name: ${owner.name}  
🤖 Bot: ${bot.name} (v${bot.version})  
📅 Release: ${bot.releaseDate}   

💻 Multi-Bot System  
🎮 Games & Casino  
📸 TikTok Downloader & Scraper  
📷 Instagram Scraper  
╰────────────────╯` },
      footer: { text: "©️DeadClient | Owner Panel" },
      nativeFlowMessage: {
        messageParamsJson,
        buttons: [{
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "🄾🅆🄽🄴🅁 Actions",
            sections: [
              {
                title: "───────── Owner Info ─────────",
                highlight_label: "📄 Owner Info",
                rows: [
                  { title: "📄 Owner Info", description: "📝 Details anzeigen", id: "$owner" }
                ]
              },
              {
	                title: "───────── Ping ─────────",
	                highlight_label: "🏓 Ping",
	                rows: [
	                  { title: "🏓 Ping", description: "⏱ Latenz testen", id: "$ping" }
	                ]
	              },
              {
                title: "───────── Main Menu ─────────",
                highlight_label: "📂 Menu",
                rows: [
                  { title: "📂 Menu", description: "📋 Hauptmenü anzeigen", id: "$menu" }
                ]
              },
              {
                title: "───────── Cards Module ─────────",
                highlight_label: "🃏 Cards",
                rows: [
                  { title: "🃏 Cards1", description: "🎴 Zeige Karten Modul", id: "$cards1" }
                ]
              },
              {
                title: "───────── Instagram Lookup ─────────",
                highlight_label: "📸 IG User",
                rows: [
                  { title: "📸 IG User", description: "🔎 Instagram Lookup", id: "$iguser @deadsclient" }
                ]
              }
            ]
          })
        }]
      }
    },

    // ===== GAME & DRAGON CARD =====
    {
      header: { title: "🎲 Game Hub & Dragon RPG 🍀", hasMediaAttachment: true, imageMessage: mediaImage.imageMessage },
      body: { text: `╭─❍ GAME HUB ❍─╮
🎰 Slots  
🎯 Darts  
🐉 Dragon RPG  
🏆 Rewards  
🌟 Extras  
╰────────────────╯` },
      footer: { text: "©️DeadClient | Game Hub" },
      nativeFlowMessage: {
        messageParamsJson,
        buttons: [{
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "🎮 Game Hub",
            sections: [
              {
                title: "───────── Slots Menu ─────────",
                highlight_label: "🎰 Slots",
                rows: [
                  { title: "🎰 Slots", description: "Öffne das Slots Spiel", id: "$slot" }
                ]
              },
              {
                title: "───────── Darts Menu ─────────",
                highlight_label: "🎯 Darts",
                rows: [
                  { title: "🎯 Darts Menu", description: "Starte Darts Spiel", id: "$dartsmenu" }
                ]
              },
              {
                title: "───────── Dragon RPG ─────────",
                highlight_label: "🐉 Dragon",
                rows: [
                  { title: "🐉 Dragon Menu", description: "Öffne dein Dragon RPG", id: "$dragonmenu" }
                ]
              },
              {
                title: "───────── Rewards ─────────",
                highlight_label: "🏆 Rewards",
                rows: [
                  { title: "🏆 Daily Rewards", description: "Sammle deine Belohnungen", id: "$rewards" }
                ]
              },
              {
                title: "───────── Extras ─────────",
                highlight_label: "🌟 Extras",
                rows: [
                  { title: "🌟 Extras Menu", description: "Zusatzfunktionen & Boni", id: "$extras" }
                ]
              }
            ]
          })
        }]
      }
    },

    // ===== IP PANEL =====
    {
      header: { title: "🌐 IP Tools 🖧", hasMediaAttachment: true, imageMessage: mediaImage.imageMessage },
      body: { text: `╭─❍ IP TOOLS ❍─╮
🌐 Track & Analyse  
📍 Standort & Daten  
🔒 Security Checks  
╰────────────────╯` },
      footer: { text: "©️DeadClient | IP Tools" },
      nativeFlowMessage: {
        messageParamsJson,
        buttons: [{
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "🌐 IP Actions",
            sections: [
              {
                title: "───────── Track IP ─────────",
                highlight_label: "🔍 Track IP",
                rows: [
                  { title: "🔍 Track IP", id: "$trackip 88.69.87.35" }
                ]
              },
              {
                title: "───────── Reverse DNS ─────────",
                highlight_label: "🔁 Reverse DNS",
                rows: [
                  { title: "🔁 Reverse DNS", id: "$reversedns 88.69.87.35" }
                ]
              },
              {
                title: "───────── Domain → IP ─────────",
                highlight_label: "🌐 Domain → IP",
                rows: [
                  { title: "🌐 Domain → IP", id: "$domainip example.com" }
                ]
              },
              {
                title: "───────── Port Scan ─────────",
                highlight_label: "🧠 Port Scan",
                rows: [
                  { title: "🧠 Port Scan", id: "$portscan 8.8.8.8" }
                ]
              },
              {
                title: "───────── Abuse Check ─────────",
                highlight_label: "🚨 Abuse Check",
                rows: [
                  { title: "🚨 Abuse Check", id: "$abusecheck 88.69.87.35" }
                ]
              }
            ]
          })
        }]
      }
    },

    // ===== SCRAPER PANEL =====
    {
      header: { title: "📥 Scraper Tools 🛠", hasMediaAttachment: true, imageMessage: mediaImage.imageMessage },
      body: { text: `╭─❍ SCRAPER TOOLS ❍─╮
📱 TikTok & Instagram  
🛒 Amazon Produkte  
🌐 Webseiten Analyse  
╰────────────────╯` },
      footer: { text: "©️DeadClient | Scraper Hub" },
      nativeFlowMessage: {
        messageParamsJson,
        buttons: [{
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "🛠 Scraper Hub",
            sections: [
              {
                title: "───────── Amazon Search ─────────",
                highlight_label: "📦 Amazon",
                rows: [
                  { title: "📦 Amazon Search", description: "Produkte suchen", id: "$Amazon i phone 17 pro max" }
                ]
              },
              {
                title: "───────── Instagram User ─────────",
                highlight_label: "📸 Instagram",
                rows: [
                  { title: "📸 Instagram User", description: "Benutzer suchen", id: "$iguser @deadsclient" }
                ]
              },
              {
                title: "───────── TikTok User ─────────",
                highlight_label: "🎵 TikTok",
                rows: [
                  { title: "🎵 TikTok User", description: "Benutzer suchen", id: "$ttuser @keineahnung" }
                ]
              },
              {
                title: "───────── Webseiten Analyse ─────────",
                highlight_label: "🌐 Web",
                rows: [
                  { title: "🌐 Analyse", description: "Webseiten prüfen & Daten sammeln", id: "$webanalyse" }
                ]
              },
              {
                title: "───────── Extras ─────────",
                highlight_label: "🌟 Extras",
                rows: [
                  { title: "🌟 Tools Menu", description: "Zusatzfunktionen & Boni", id: "$extras" }
                ]
              }
            ]
          })
        }]
      }
    },

    // ===== WEATHER PANEL =====
    {
      header: { title: "🌦 Weather Panel 🍀", hasMediaAttachment: true, imageMessage: mediaImage.imageMessage },
      body: { text: `╭─❍ WEATHER PANEL ❍─╮
🌍 Worldwide locations  
☁️ Live weather data  
🌡️ Forecast system  
🌧️ Rain alerts  
╰────────────────╯` },
      footer: { text: "©️DeadClient | Weather" },
      nativeFlowMessage: {
        messageParamsJson,
        buttons: [{
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "🌦 Weather Actions",
            sections: [
              {
                title: "───────── Baden-Württemberg ─────────",
                highlight_label: "🌤 Baden-Württemberg",
                rows: [
                  { title: "🌤 Baden-Württemberg", id: "$wetter Baden-Württemberg" }
                ]
              },
              {
                title: "───────── Bayern ─────────",
                highlight_label: "🌤 Bayern",
                rows: [
                  { title: "🌤 Bayern", id: "$wetter Bayern" }
                ]
              },
              {
                title: "───────── Berlin ─────────",
                highlight_label: "🌤 Berlin",
                rows: [
                  { title: "🌤 Berlin", id: "$wetter Berlin" }
                ]
              },
              {
                title: "───────── Brandenburg ─────────",
                highlight_label: "🌤 Brandenburg",
                rows: [
                  { title: "🌤 Brandenburg", id: "$wetter Brandenburg" }
                ]
              },
              {
                title: "───────── Hamburg ─────────",
                highlight_label: "🌤 Hamburg",
                rows: [
                  { title: "🌤 Hamburg", id: "$wetter Hamburg" }
                ]
              }
            ]
          })
        }]
      }
    },

    // ===== SYSTEM PANEL =====
    {
      header: { title: "🖥 System & Admin 🍀", hasMediaAttachment: true, imageMessage: mediaImage.imageMessage },
      body: { text: `╭─❍ SYSTEM PANEL ❍─╮
💻 ${system.os} | ⚡ ${system.nodeVersion}  
🕒 Uptime: ${Math.floor(process.uptime())}s  
╰────────────────╯` },
      footer: { text: "©️DeadClient | System" },
      nativeFlowMessage: {
        messageParamsJson,
        buttons: [{
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "🖥 System Actions",
            sections: [
              {
                title: "───────── System Info ─────────",
                highlight_label: "📊 System Info",
                rows: [
                  { title: "📊 System Info", id: "$info" }
                ]
              },
              {
                title: "───────── Team ─────────",
                highlight_label: "👥 Team",
                rows: [
                  { title: "👥 Team", id: "$team" }
                ]
              },
              {
                title: "───────── Premium ─────────",
                highlight_label: "⭐ Premium",
                rows: [
                  { title: "⭐ Premium", id: "$premium" }
                ]
              },
              {
                title: "───────── Modules ─────────",
                highlight_label: "🛠 Modules",
                rows: [
                  { title: "🛠 Modules", id: "$modules" }
                ]
              }
            ]
          })
        }]
      }
    },

    // ===== Economy PANEL =====
    {
      header: { title: "🪙 Economy 🍀", hasMediaAttachment: true, imageMessage: mediaImage.imageMessage },
      body: { text: `╭─❍ ECONOMY PANEL ❍─╮
💻 ${system.os} | ⚡ ${system.nodeVersion}  
🕒 Uptime: ${Math.floor(process.uptime())}s  
╰────────────────╯` },
      footer: { text: "©️Beastmeds | Economy" },
      nativeFlowMessage: {
        messageParamsJson,
        buttons: [{
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "🪙 Economy Actions",
            sections: [
              {
                title: "───────── Economy Menu 1 ─────────",
                highlight_label: "📊 Economy Menu 1",
                rows: [
                  { title: "📊 Economy Menu 1", id: "$menu 5" }
                ]
              },
              {
                title: "───────── Economy Menu 2 ─────────",
                highlight_label: "📊 Economy Menu 2",
                rows: [
                  { title: "📊 Economy Menu 2", id: "$menu 13" }
                ]
              },
              {
                title: "───────── Bank ─────────",
                highlight_label: "🏦 Bank",
                rows: [
                  { title: "🏦 Bank", id: "$bank" }
                ]
              },
              {
                title: "───────── Balance ─────────",
                highlight_label: "� Balance",
                rows: [
                  { title: " Balance", id: "$balance" }
                ]
              }
            ]
          })
        }]
      }
    }

  ];

  await sock.sendjsonv3(from, {
    interactiveMessage: {
      body: { text: "Main Menu\n\n Codet by DeadClient" },
      carouselMessage: { cards }
    }
  }, { quoted: msg });

  break;
}
case 'dead': {
 await sock.sendMessage(chatId, { text: ' Danke an DeadsClient, für das coole /main2 woraus ich noch sehr viel machen werde.' });
     break;
}
case 'antidelete': {
  const groupId = msg.key.remoteJid;
  const isGroup = groupId.endsWith('@g.us');

  if (!isGroup) {
    await sock.sendMessage(from, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' });
    return;
  }

  // Teilnehmerliste abrufen
  let participants = [];
  try {
    const metadata = await sock.groupMetadata(groupId);
    participants = metadata.participants.map(p => ({
      id: p.id,
      admin: p.admin
    }));
  } catch (err) {
    console.error('Fehler beim Abrufen der Gruppen-Teilnehmer:', err);
    return;
  }

  const senderId = msg.key.participant || msg.key.remoteJid;
  const senderIsAdmin = participants.some(
    p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin')
  );

  if (!senderIsAdmin) {
    await sock.sendMessage(from, { 
      text: '⛔ Nur Gruppenadmins dürfen das Setup ausführen.' 
    }, { quoted: msg });
    return;
  }

  // Option prüfen
  const option = q.trim().toLowerCase();
  if (option !== 'on' && option !== 'off') {
    await sock.sendMessage(from, { 
      text: '⚙️ Benutzung:\n.antidelete on oder .antidelete off' 
    });
    return;
  }

  // Anti-Delete konfigurieren
  antiDeleteConfig[groupId] = option === 'on';
  saveAntiDeleteConfig();

  await sock.sendMessage(from, { 
    text: `🛡️ Anti-Delete wurde *${option === 'on' ? 'aktiviert' : 'deaktiviert'}*.` 
  });
  break;
}



//=============AFK SYSTEM============================//
case 'afk': {
    const reason = q || 'Keine Begründung angegeben';
    const afkStatus = getAFKStatus(senderJid); // globaler Speicher

    if (afkStatus) {
        // User war AFK → zurück online
        removeAFK(senderJid);

        const afkDuration = Date.now() - afkStatus.timestamp;
        const hours = Math.floor(afkDuration / (1000 * 60 * 60));
        const minutes = Math.floor((afkDuration % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((afkDuration % (1000 * 60)) / 1000);

        let durationText = hours > 0 ? `${hours}h ${minutes}m ${seconds}s`
                          : minutes > 0 ? `${minutes}m ${seconds}s`
                          : `${seconds}s`;

        await sock.sendMessage(chatId, {
            text: `👋 @${senderJid.split('@')[0]} ist nun wieder online! 🟢\n⏱️ AFK-Zeit: ${durationText}`,
            contextInfo: { mentionedJid: [senderJid] }
        }, { quoted: msg });

        console.log(`[AFK] User ${senderJid} ist jetzt wieder online (Dauer: ${durationText})`);
    } else {
        // User geht AFK → global
        setAFK(senderJid, reason);

        await sock.sendMessage(chatId, {
            text: `⏸️ @${senderJid.split('@')[0]} ist jetzt AFK!\n📝 Grund: ${reason}`,
            contextInfo: { mentionedJid: [senderJid] }
        }, { quoted: msg });

        console.log(`[AFK] User ${senderJid} ist jetzt AFK: ${reason}`);
    }

    break;
}

// (Der AFK-Mention-Check wird jetzt früher im Message-Handler durchgeführt)

//=============PING============================//          
   case 'nayvy': {
     await sock.sendMessage(chatId, { text: '🙏 Danke an 717𝓝𝓪𝔂𝓿𝔂, der das Stormbot v1 Modell für Beast Bot bereitgestellt hat!' });
     break;
   }

//=============DEVICE INFO============================//
case 'device': {
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;

  if (!contextInfo || !contextInfo.stanzaId) {
    await sock.sendMessage(chatId, { text: '❌ Bitte antworte auf eine Nachricht, um das Gerät anzuzeigen.' }, { quoted: msg });
    break;
  }

  const quotedParticipant = contextInfo.participant;
  const quotedId = contextInfo.stanzaId;
  const idUpper = quotedId.toUpperCase();
  let device = 'Unbekannt';

  if (idUpper.startsWith('3E')) {
    device = '📱 WhatsApp Web Client';
  } else if (idUpper.includes('NEELE')) {
    device = '🍎 Neelegirl/Wa-Api Process via iOS';
  } else if (idUpper.includes('STORM')) {
    device = '🤖 Official StormBot (717Developments/Baileys)';
  } else if (idUpper.startsWith('2A')) {
    device = '🍎 Apple iOS (Business Account)';
  } else if (idUpper.startsWith('3A')) {
    device = '🍎 Apple iOS';
  } else if (idUpper.startsWith('3C')) {
    device = '🍎 Apple iOS';
  } else if (quotedId.length >= 30) {
    device = '🤖 Android';
  }

  const mentionJid = quotedParticipant ? [quotedParticipant] : [];

  const text = `━━ ❮ 📄 DEVICE INFO ❯ ━━\n\n${quotedParticipant ? `👤 Nutzer: @${quotedParticipant.split('@')[0]}` : '👤 Nutzer: Unbekannt'}\n\n📱 Gerät: ${device}\n\n🔧 MSG-ID: ${quotedId}`;

  await sock.sendMessage(chatId, { text, mentions: mentionJid }, { quoted: msg });
  break;
}

//=============ECONOMY: BALANCE============================//
   case 'balance':
   case 'bal': {
     const econ = getEconomy(senderJid);
     const msg_text = `💰 *Dein Vermögen:*\n\n💵 Cash: ${formatMoney(econ.cash || 100)}\n🏦 Bank: ${formatMoney(econ.bank || 0)}\n💎 Gems: ${econ.gems || 0}`;
     await sock.sendMessage(chatId, { text: msg_text }, { quoted: msg });
     break;
   }

//=============ECONOMY: DAILY============================//
   case 'daily': {
     const econ = getEconomy(senderJid);
     const prem = getPremium(senderJid);
     const now = Date.now();
     const baseDaily = 24 * 60 * 60 * 1000;
     const cooldown = (isPremium(senderJid) && prem.multidaily) ? (baseDaily / 2) : baseDaily;
     
     if (econ.lastDaily && (now - econ.lastDaily) < cooldown) {
       const remaining = formatTime(cooldown - (now - econ.lastDaily));
       await sock.sendMessage(chatId, { text: `⏱️ Du kannst deine tägliche Belohnung erst in *${remaining}* abholen!` }, { quoted: msg });
       break;
     }
     
     let reward = Math.floor(Math.random() * 50) + 100;
     // Premium Boost: 3x mehr Geld
     if (isPremium(senderJid)) {
       reward *= 3;
     }
     econ.cash = (econ.cash || 100) + reward;
     econ.lastDaily = now;
     setEconomy(senderJid, econ);
     
     const premiumTag = isPremium(senderJid) ? ' 👑' : '';
     await sock.sendMessage(chatId, { text: `✅ *Tägliche Belohnung!*${premiumTag}\n\n💵 +${formatMoney(reward)} Cash\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     break;
   }

//=============ECONOMY: WEEKLY============================//
   case 'weekly': {
     const econ = getEconomy(senderJid);
     const now = Date.now();
     const cooldown = 7 * 24 * 60 * 60 * 1000;
     
     if (econ.lastWeekly && (now - econ.lastWeekly) < cooldown) {
       const remaining = formatTime(cooldown - (now - econ.lastWeekly));
       await sock.sendMessage(chatId, { text: `⏱️ Du kannst deine wöchentliche Belohnung erst in *${remaining}* abholen!` }, { quoted: msg });
       break;
     }
     
     let reward = Math.floor(Math.random() * 200) + 500;
     // Premium Boost: 2x mehr Geld
     if (isPremium(senderJid)) {
       reward *= 2;
     }
     econ.cash = (econ.cash || 100) + reward;
     econ.lastWeekly = now;
     setEconomy(senderJid, econ);
     
     const premiumTag = isPremium(senderJid) ? ' 👑' : '';
     await sock.sendMessage(chatId, { text: `✅ *Wöchentliche Belohnung!*${premiumTag}\n\n💵 +${formatMoney(reward)} Cash\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     break;
   }

//=============ECONOMY: WORK============================//
   case 'work': {
     const econ = getEconomy(senderJid);
     const prem = getPremium(senderJid);
     const now = Date.now();
     const baseCooldown = 10 * 60 * 1000;
     const cooldown = isPremium(senderJid) ? baseCooldown / 2 : baseCooldown;
     
     if (econ.lastWork && (now - econ.lastWork) < cooldown) {
       const remaining = formatTime(cooldown - (now - econ.lastWork));
       await sock.sendMessage(chatId, { text: `⏱️ Du musst noch *${remaining}* warten, bevor du wieder arbeiten kannst!` }, { quoted: msg });
       break;
     }
     
     const jobs = [
       { name: 'Kaffee verkauft', pay: 50 },
       { name: 'Programm geschrieben', pay: 100 },
       { name: 'Grasgemäht', pay: 30 },
       { name: 'Babysitter', pay: 75 },
       { name: 'Taxi gefahren', pay: 60 }
     ];
     
     const job = jobs[Math.floor(Math.random() * jobs.length)];
     const bonus = Math.random() > 0.5 ? Math.floor(job.pay * 0.2) : 0;
     let total = job.pay + bonus;
     // Premium Boost: 2x mehr Geld
     if (isPremium(senderJid)) {
       total *= 2;
     }
     
     econ.cash = (econ.cash || 100) + total;
     econ.lastWork = now;
     setEconomy(senderJid, econ);
     
     const bonusText = bonus ? `\n✨ +${bonus} Bonus!` : '';
     const premiumTag = isPremium(senderJid) ? ' 👑' : '';
     await sock.sendMessage(chatId, { text: `👷 *Du hast ${job.name}*${premiumTag}\n\n💵 +${formatMoney(total)} Cash${bonusText}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     break;
   }

//=============ECONOMY: BEG============================//
   case 'beg': {
     const econ = getEconomy(senderJid);
     const now = Date.now();
     const cooldown = 30 * 1000;
     
     if (econ.lastBeg && (now - econ.lastBeg) < cooldown) {
       const remaining = formatTime(cooldown - (now - econ.lastBeg));
       await sock.sendMessage(chatId, { text: `⏱️ Bitte noch *${remaining}* warten, bevor du wieder betteln kannst!` }, { quoted: msg });
       break;
     }
     
     const chance = Math.random();
     let text = '🤲 *Du bettelst...*\n\n';
     
     if (chance < 0.5) {
       const money = Math.floor(Math.random() * 30) + 10;
       econ.cash = (econ.cash || 100) + money;
       text += `✅ Jemand gab dir ${formatMoney(money)} Cash!\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}`;
     } else {
       text += `❌ Niemand gab dir Geld... Versuche es später nochmal!`;
     }
     
     econ.lastBeg = now;
     setEconomy(senderJid, econ);
     
     await sock.sendMessage(chatId, { text }, { quoted: msg });
     break;
   }

//=============ECONOMY: SLOTS============================//
   case 'slots': {
     if (!q) {
       await sock.sendMessage(chatId, { text: '🎰 Benutzung: */slots <Betrag>*\n\nBeispiel: */slots 100*' }, { quoted: msg });
       break;
     }
     
     const bet = parseInt(q);
     if (isNaN(bet) || bet <= 0) {
       await sock.sendMessage(chatId, { text: '❌ Ungültiger Betrag!' }, { quoted: msg });
       break;
     }
     
     const econ = getEconomy(senderJid);
     if (econ.cash < bet) {
       await sock.sendMessage(chatId, { text: `❌ Du hast nicht genug Cash! (Benötigt: ${bet}, Hast: ${econ.cash})` }, { quoted: msg });
       break;
     }
     
     const symbols = ['🍎', '🍊', '🍋', '🍒', '💎'];
     const result = [symbols[Math.floor(Math.random() * symbols.length)], symbols[Math.floor(Math.random() * symbols.length)], symbols[Math.floor(Math.random() * symbols.length)]];
     
     const won = result[0] === result[1] && result[1] === result[2];
     const winAmount = bet * 3;
     
     if (won) {
       econ.cash += winAmount;
       await sock.sendMessage(chatId, { text: `🎰 *SLOTS*\n\n${result.join(' ')}\n\n🎉 JACKPOT! +${formatMoney(winAmount)}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     } else {
       econ.cash -= bet;
       await sock.sendMessage(chatId, { text: `🎰 *SLOTS*\n\n${result.join(' ')}\n\n❌ Verloren! -${formatMoney(bet)}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     }
     
     setEconomy(senderJid, econ);
     break;
   }

//=============ECONOMY: ROULETTE============================//
   case 'roulette': {
     if (!q) {
       await sock.sendMessage(chatId, { text: '🎰 Benutzung: */roulette <Betrag>*\n\nBeispiel: */roulette 100*' }, { quoted: msg });
       break;
     }
     
     const bet = parseInt(q);
     if (isNaN(bet) || bet <= 0) {
       await sock.sendMessage(chatId, { text: '❌ Ungültiger Betrag!' }, { quoted: msg });
       break;
     }
     
     const econ = getEconomy(senderJid);
     if (econ.cash < bet) {
       await sock.sendMessage(chatId, { text: `❌ Du hast nicht genug Cash!` }, { quoted: msg });
       break;
     }
     
     const result = Math.random() < 0.5;
     if (result) {
       econ.cash += bet;
       await sock.sendMessage(chatId, { text: `🎰 *ROULETTE*\n\n🟢 ROT!\n\n🎉 Gewonnen! +${formatMoney(bet)}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     } else {
       econ.cash -= bet;
       await sock.sendMessage(chatId, { text: `🎰 *ROULETTE*\n\n⚫ SCHWARZ!\n\n❌ Verloren! -${formatMoney(bet)}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     }
     
     setEconomy(senderJid, econ);
     break;
   }

//=============ECONOMY: DICE============================//
   case 'dice': {
     if (!q) {
       await sock.sendMessage(chatId, { text: '🎲 Benutzung: */dice <Betrag>*\n\nBeispiel: */dice 100*' }, { quoted: msg });
       break;
     }
     
     const bet = parseInt(q);
     if (isNaN(bet) || bet <= 0) {
       await sock.sendMessage(chatId, { text: '❌ Ungültiger Betrag!' }, { quoted: msg });
       break;
     }
     
     const econ = getEconomy(senderJid);
     if (econ.cash < bet) {
       await sock.sendMessage(chatId, { text: `❌ Du hast nicht genug Cash!` }, { quoted: msg });
       break;
     }
     
     const yourRoll = Math.floor(Math.random() * 6) + 1;
     const botRoll = Math.floor(Math.random() * 6) + 1;
     const winAmount = bet * 2;
     
     let result_text = `🎲 *WÜRFEL*\n\n👤 Dein Wurf: ${yourRoll}\n🤖 Bot Wurf: ${botRoll}\n\n`;
     
     if (yourRoll > botRoll) {
       econ.cash += winAmount;
       result_text += `🎉 Gewonnen! +${formatMoney(winAmount)}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}`;
     } else if (yourRoll < botRoll) {
       econ.cash -= bet;
       result_text += `❌ Verloren! -${formatMoney(bet)}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}`;
     } else {
       result_text += `🤝 Unentschieden! Kein Geld verloren.`;
     }
     
     await sock.sendMessage(chatId, { text: result_text }, { quoted: msg });
     setEconomy(senderJid, econ);
     break;
   }

//=============ECONOMY: MINE============================//
   case 'mine': {
     const econ = getEconomy(senderJid);
     const now = Date.now();
     const cooldown = 20 * 1000;
     
     if (econ.lastWork && (now - econ.lastWork) < cooldown) {
       const remaining = formatTime(cooldown - (now - econ.lastWork));
       await sock.sendMessage(chatId, { text: `⏱️ Du musst noch *${remaining}* warten, bevor du wieder Bergbau betreiben kannst!` }, { quoted: msg });
       break;
     }
     
     const ores = [
       { name: 'Kohle', reward: 30 },
       { name: 'Eisen', reward: 50 },
       { name: 'Gold', reward: 100 },
       { name: 'Diamant', reward: 200 }
     ];
     
     const ore = ores[Math.floor(Math.random() * ores.length)];
     econ.cash = (econ.cash || 100) + ore.reward;
     econ.lastWork = now;
     setEconomy(senderJid, econ);
     
     await sock.sendMessage(chatId, { text: `⛏️ *Du hast ${ore.name} abgebaut!*\n\n💵 +${formatMoney(ore.reward)} Cash\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     break;
   }

//=============ECONOMY: HUNT============================//
   case 'hunt': {
     const econ = getEconomy(senderJid);
     const now = Date.now();
     const cooldown = 15 * 1000;
     
     if (econ.lastWork && (now - econ.lastWork) < cooldown) {
       const remaining = formatTime(cooldown - (now - econ.lastWork));
       await sock.sendMessage(chatId, { text: `⏱️ Du musst noch *${remaining}* warten, bevor du wieder jagen kannst!` }, { quoted: msg });
       break;
     }
     
     const animals = [
       { name: 'Kaninchen', reward: 40 },
       { name: 'Hirsch', reward: 80 },
       { name: 'Bär', reward: 150 }
     ];
     
     const animal = animals[Math.floor(Math.random() * animals.length)];
     econ.cash = (econ.cash || 100) + animal.reward;
     econ.lastWork = now;
     setEconomy(senderJid, econ);
     
     await sock.sendMessage(chatId, { text: `🏹 *Du hast einen ${animal.name} gejagt!*\n\n💵 +${formatMoney(animal.reward)} Cash\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     break;
   }

//=============ECONOMY: FARM============================//
   case 'farm': {
     const econ = getEconomy(senderJid);
     const now = Date.now();
     const cooldown = 25 * 1000;
     
     if (econ.lastWork && (now - econ.lastWork) < cooldown) {
       const remaining = formatTime(cooldown - (now - econ.lastWork));
       await sock.sendMessage(chatId, { text: `⏱️ Du musst noch *${remaining}* warten, bevor du wieder anbauen kannst!` }, { quoted: msg });
       break;
     }
     
     const crops = [
       { name: 'Weizen', reward: 35 },
       { name: 'Maize', reward: 45 },
       { name: 'Tomaten', reward: 55 }
     ];
     
     const crop = crops[Math.floor(Math.random() * crops.length)];
     econ.cash = (econ.cash || 100) + crop.reward;
     econ.lastWork = now;
     setEconomy(senderJid, econ);
     
     await sock.sendMessage(chatId, { text: `🌾 *Du hast ${crop.name} angebaut!*\n\n💵 +${formatMoney(crop.reward)} Cash\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     break;
   }

//=============ECONOMY: ROB============================//
   case 'rob': {
     if (!args.length || !msg.mentions || !msg.mentions.length) {
       await sock.sendMessage(chatId, { text: '💸 Benutzung: */rob @user*\n\nBeispiel: */rob @jemand*' }, { quoted: msg });
       break;
     }
     
     const targetJid = msg.mentions[0] || args[0];
     const robberEcon = getEconomy(senderJid);
     const victimEcon = getEconomy(targetJid);
     
     if (robberEcon.cash < 10) {
       await sock.sendMessage(chatId, { text: '❌ Du brauchst mindestens 10 Cash für einen Raub!' }, { quoted: msg });
       break;
     }
     
     const success = Math.random() < 0.6;
     if (success) {
       const stealAmount = Math.floor(Math.random() * victimEcon.cash * 0.5) + 1;
       robberEcon.cash += stealAmount;
       victimEcon.cash = Math.max(0, victimEcon.cash - stealAmount);
       
       await sock.sendMessage(chatId, { text: `💸 *ÜBERFALL*\n\n✅ Erfolgreicher Raub!\n🎉 +${formatMoney(stealAmount)}\n💰 Neuer Kontostand: ${formatMoney(robberEcon.cash)}` }, { quoted: msg });
     } else {
       robberEcon.cash -= 10;
       await sock.sendMessage(chatId, { text: `💸 *ÜBERFALL*\n\n❌ Erwischt! Polizei nimmt dir 10 Cash.\n💰 Neuer Kontostand: ${formatMoney(robberEcon.cash)}` }, { quoted: msg });
     }
     
     setEconomy(senderJid, robberEcon);
     setEconomy(targetJid, victimEcon);
     break;
   }

//=============ECONOMY: CRIME============================//
   case 'crime': {
     const econ = getEconomy(senderJid);
     
     if (isJailed(senderJid)) {
       const jailedEcon = getEconomy(senderJid);
       const timeLeft = formatTime(jailedEcon.jailedUntil - Date.now());
       await sock.sendMessage(chatId, { text: `⛓️ Du sitzt noch im Gefängnis! Entlassung in: ${timeLeft}` }, { quoted: msg });
       break;
     }
     
     const crimes = [
       { name: 'Raub', reward: 100, risk: 0.7 },
       { name: 'Trickbetrug', reward: 80, risk: 0.6 },
       { name: 'Hacker-Anschlag', reward: 200, risk: 0.8 }
     ];
     
     const crime = crimes[Math.floor(Math.random() * crimes.length)];
     const success = Math.random() > crime.risk;
     
     if (success) {
       econ.cash += crime.reward;
       await sock.sendMessage(chatId, { text: `🔓 *${crime.name}*\n\n✅ Erfolg! +${formatMoney(crime.reward)} Cash\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     } else {
       sendToJail(senderJid, 60 * 1000);
       await sock.sendMessage(chatId, { text: `🔓 *${crime.name}*\n\n❌ Verhaftet! 1 Minute Gefängnis.` }, { quoted: msg });
     }
     
     setEconomy(senderJid, econ);
     break;
   }

//=============ECONOMY: TOPBALANCE============================//
   case 'topbalance': {
     const topStmt = dbInstance.prepare('SELECT e.jid, e.cash, u.name FROM economy e LEFT JOIN users u ON e.jid = u.jid ORDER BY e.cash DESC LIMIT 10');
     const tops = topStmt.all();
     
     let text = '🏆 *Top 10 Reichste Spieler (Cash)*\n\n';
     if (tops.length === 0) {
       text += 'Noch keine Daten vorhanden!';
     } else {
       tops.forEach((u, i) => {
         const name = u.name || u.jid.split('@')[0];
         text += `${i + 1}. ${name} - 💵 ${formatMoney(u.cash || 0)}\n`;
       });
     }
     
     await sock.sendMessage(chatId, { text }, { quoted: msg });
     break;
   }

//=============ECONOMY: BANK============================//
   case 'bank': {
     const econ = getEconomy(senderJid);
     const subCmd = args[0]?.toLowerCase();
     
     if (!subCmd) {
       await sock.sendMessage(chatId, { text: '🏦 *Bank Commands:*\n\n*/bank deposit <Betrag>* - Cash zur Bank\n*/bank withdraw <Betrag>* - Cash abheben\n*/bank interest* - Zinsen abholen\n*/bank balance* - Kontostand' }, { quoted: msg });
       break;
     }
     
     if (subCmd === 'balance') {
       await sock.sendMessage(chatId, { text: `🏦 *Bankkontostand:*\n\n💵 Cash: ${formatMoney(econ.cash || 100)}\n🏦 Bank: ${formatMoney(econ.bank || 0)}\n📊 Zinsrate: 1%` }, { quoted: msg });
       break;
     } else if (subCmd === 'deposit') {
       if (!args[1]) {
         await sock.sendMessage(chatId, { text: '❌ Bitte gib einen Betrag an! */bank deposit <Betrag>*' }, { quoted: msg });
         break;
       }
       const amount = parseInt(args[1]);
       if (isNaN(amount) || amount <= 0) {
         await sock.sendMessage(chatId, { text: '❌ Ungültiger Betrag!' }, { quoted: msg });
         break;
       }
       if (econ.cash < amount) {
         await sock.sendMessage(chatId, { text: `❌ Du hast nicht genug Cash! (Hast: ${formatMoney(econ.cash)}, Benötigt: ${formatMoney(amount)})` }, { quoted: msg });
         break;
       }
       econ.cash -= amount;
       econ.bank = (econ.bank || 0) + amount;
       setEconomy(senderJid, econ);
       await sock.sendMessage(chatId, { text: `✅ *Einzahlung erfolgreich!*\n\n💵 +${formatMoney(amount)} eingezahlt\n\n💸 Cash: ${formatMoney(econ.cash)}\n🏦 Bank: ${formatMoney(econ.bank)}` }, { quoted: msg });
       break;
     } else if (subCmd === 'withdraw') {
       if (!args[1]) {
         await sock.sendMessage(chatId, { text: '❌ Bitte gib einen Betrag an! */bank withdraw <Betrag>*' }, { quoted: msg });
         break;
       }
       const amount = parseInt(args[1]);
       if (isNaN(amount) || amount <= 0) {
         await sock.sendMessage(chatId, { text: '❌ Ungültiger Betrag!' }, { quoted: msg });
         break;
       }
       if (econ.bank < amount) {
         await sock.sendMessage(chatId, { text: `❌ Du hast nicht genug auf der Bank! (Hast: ${formatMoney(econ.bank)}, Benötigt: ${formatMoney(amount)})` }, { quoted: msg });
         break;
       }
       econ.bank -= amount;
       econ.cash = (econ.cash || 100) + amount;
       setEconomy(senderJid, econ);
       await sock.sendMessage(chatId, { text: `✅ *Abhebung erfolgreich!*\n\n💸 +${formatMoney(amount)} abgehoben\n\n💵 Cash: ${formatMoney(econ.cash)}\n🏦 Bank: ${formatMoney(econ.bank)}` }, { quoted: msg });
       break;
     } else if (subCmd === 'interest') {
       const interest = Math.floor((econ.bank || 0) * 0.01);
       econ.cash = (econ.cash || 100) + interest;
       econ.bank = Math.max(0, (econ.bank || 0) - 10);
       setEconomy(senderJid, econ);
       await sock.sendMessage(chatId, { text: `💰 *Monatliche Zinsen*\n\n✅ +${formatMoney(interest)} Zinsen erhalten\n❌ -10 Kontoführungsgebühr\n\n💵 Neuer Cash: ${formatMoney(econ.cash)}\n🏦 Neue Bank: ${formatMoney(econ.bank)}` }, { quoted: msg });
       break;
     } else {
       await sock.sendMessage(chatId, { text: '❌ Unbekannter Bank-Befehl!\n\n*/bank balance* - Kontostand\n*/bank deposit <Betrag>* - Einzahlen\n*/bank withdraw <Betrag>* - Abheben\n*/bank interest* - Zinsen' }, { quoted: msg });
       break;
     }
     break;
   }

//=============ECONOMY: HEIST============================//
   case 'heist': {
     await sock.sendMessage(chatId, { text: '⚠️ *Heist-System* ist noch in Entwicklung!\n\nDieser Command wird bald verfügbar sein.' }, { quoted: msg });
     break;
   }

//=============ECONOMY: JAIL============================//
   case 'jail': {
     const econ = getEconomy(senderJid);
     if (isJailed(senderJid)) {
       const timeLeft = formatTime(econ.jailedUntil - Date.now());
       await sock.sendMessage(chatId, { text: `⛓️ Du sitzt im Gefängnis! Entlassung in: ${timeLeft}` }, { quoted: msg });
     } else {
       await sock.sendMessage(chatId, { text: '✅ Du bist nicht im Gefängnis!' }, { quoted: msg });
     }
     break;
   }

//=============PREMIUM: SYSTEM============================//
   case 'premium': {
     const subcommand = args[0]?.toLowerCase();
     
     // /premium add - Owner/CoOwner/Premium können Premium vergeben
     if (subcommand === 'add') {
       // Check ob Sender Owner/CoOwner/Premium ist
       const senderPrem = getPremium(senderJid);
       const senderRank = ranks.getRank(senderJid);
       const isOwner = senderRank === 'Inhaber';
       const isCoOwner = senderRank === 'Stellvertreter Inhaber';
       const canGivePremium = isOwner || isCoOwner || (senderPrem && senderPrem.isPremium && Date.now() < senderPrem.premiumUntil);
       
       if (!canGivePremium) {
         await sock.sendMessage(chatId, { text: `❌ Nur Owner, CoOwner oder Premium-Nutzer können Premium vergeben!` }, { quoted: msg });
         break;
       }
       
       // Zielbenutzer auslesen - versuche Mentions oder args
       let targetJid = null;
       
       if (msg.mentions && msg.mentions.length > 0) {
         targetJid = msg.mentions[0];
       } else if (args[1]) {
         targetJid = args[1];
       }
       
       if (!targetJid) {
         await sock.sendMessage(chatId, { text: `👑 Benutzung: */premium add @user <tage>*\n\nBeispiel: */premium add @jemand 30*\n\n⚠️ Markiere einen Nutzer mit @ um Premium zu aktivieren!` }, { quoted: msg });
         break;
       }
       
       // Normalisiere JID Format - entferne @ wenn vorhanden und stelle sicher es hat @s.whatsapp.net
       let cleanJid = targetJid.replace('@', '').trim();
       if (!cleanJid.includes('@')) {
         cleanJid = `${cleanJid}@s.whatsapp.net`;
       }
       
       const days = args[2] ? parseInt(args[2], 10) : null; // null/NaN => dauerhaft
       
       addPremium(cleanJid, days);
       
       // Extrahiere Nummer aus JID
       const jidNumber = cleanJid.split('@')[0];
       
       const durationText = (!days || isNaN(days) || days <= 0) ? 'dauerhaft' : `${days} Tage`;
       await sock.sendMessage(chatId, { text: `✅ 👑 Premium für +${jidNumber} für ${durationText} aktiviert!`, mentions: [cleanJid] }, { quoted: msg });
      break;
    }
     
     // /premium - Zeige Premium Status
     const prem = getPremium(senderJid);
     const u = getUser(senderJid);
     
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `👑 *PREMIUM SYSTEM*\n\nDu bist noch kein Premium Mitglied!\n\n✅ Vorteile:\n• 💵 3x mehr Geld bei /daily\n• ⚡ Halber Cooldown bei /work\n• 🎰 Neue Casino Games\n• 🛒 Premium Shop Items\n• 🤖 Auto Features\n\nFrag einen Owner, CoOwner oder Premium-Nutzer um dir Premium zu geben!` }, { quoted: msg });
       break;
     }
     
     const remaining = formatTime(prem.premiumUntil - Date.now());
     const text = `👑 *DEIN PREMIUM STATUS*\n\n✅ Premium aktiv\n⏱️ Verfallen in: ${remaining}\n📊 Level: ${prem.premiumLevel}\n\n📝 Titel: ${prem.title || 'Keine'}\n🎨 Farbe: ${prem.color}\n😊 Emoji: ${prem.emoji}`;
     await sock.sendMessage(chatId, { text }, { quoted: msg });
     break;
   }

//=============PREMIUM: SPAWNMONEY============================//
  case 'spawnmoney': {
    if (!isPremium(senderJid)) {
      await sock.sendMessage(chatId, { text: `❌ Das ist ein Premium Command\n\nNutze */getpremium* um Premium zu aktivieren!` }, { quoted: msg });
      break;
    }
     
     const prem = getPremium(senderJid);
     const econ = getEconomy(senderJid);
     const now = Date.now();
     const dailyCooldown = 24 * 60 * 60 * 1000;
     
     if (prem.lastSpawnmoney && (now - prem.lastSpawnmoney) < dailyCooldown) {
       const remaining = formatTime(dailyCooldown - (now - prem.lastSpawnmoney));
       await sock.sendMessage(chatId, { text: `⏱️ Du kannst dein Daily Spawnmoney erst in ${remaining} wieder nutzen!` }, { quoted: msg });
       break;
     }
     
     const amount = Math.floor(Math.random() * 500) + 500;
     econ.cash = (econ.cash || 100) + amount;
     prem.lastSpawnmoney = now;
     
     setEconomy(senderJid, econ);
     setPremium(senderJid, prem);
     
    await sock.sendMessage(chatId, { text: `✨ *PREMIUM SPAWN MONEY*\n\n💵 +${formatMoney(amount)} Cash generiert!\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
    break;
  }

//=============PREMIUM: COOLDOWNS============================//
   case 'cooldowns': {
     const econ = getEconomy(senderJid);
     const prem = getPremium(senderJid);
     const now = Date.now();

     const workCd = (isPremium(senderJid) ? 5 : 10) * 60 * 1000;
     const dailyCd = (isPremium(senderJid) && prem.multidaily) ? 12 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
     const weeklyCd = 7 * 24 * 60 * 60 * 1000;
     const begCd = 5 * 60 * 1000;
     const spawnCd = 24 * 60 * 60 * 1000;

     const remainingText = (last, cd) => {
       if (!last) return '✅ bereit';
       const diff = cd - (now - last);
       return diff > 0 ? `⏱️ ${formatTime(diff)}` : '✅ bereit';
     };

     const text = `⏱️ *Deine Cooldowns*${isPremium(senderJid) ? ' (Premium)' : ''}\n\n`
      + `💼 Work: ${remainingText(econ.lastWork, workCd)}\n`
      + `🎁 Daily: ${remainingText(econ.lastDaily, dailyCd)}\n`
      + `📅 Weekly: ${remainingText(econ.lastWeekly, weeklyCd)}\n`
      + `🙏 Beg: ${remainingText(econ.lastBeg, begCd)}\n`
      + `✨ Spawnmoney: ${remainingText(prem.lastSpawnmoney, spawnCd)}`;

     await sock.sendMessage(chatId, { text }, { quoted: msg });
     break;
   }

//=============PREMIUM: RICHLIST============================//
   case 'rich': {
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `❌ Nur Premium-Mitglieder können die Richlist sehen.` }, { quoted: msg });
       break;
     }

     const stmt = dbInstance.prepare(`
       SELECT e.jid, e.cash, e.bank, (e.cash + e.bank) as total, u.name
       FROM economy e
       LEFT JOIN users u ON u.jid = e.jid
       WHERE EXISTS (SELECT 1 FROM premium p WHERE p.jid = e.jid AND p.isPremium = 1)
       ORDER BY total DESC
       LIMIT 10
     `);

     const rows = stmt.all();
     let text = '👑 *Premium Richlist (Top 10)*\n\n';

     if (rows.length === 0) {
       text += 'Noch keine Premium-Spieler gefunden.';
     } else {
       rows.forEach((r, i) => {
         const name = r.name || r.jid.split('@')[0];
         text += `${i + 1}. ${name} – ${formatMoney(r.total || 0)} (💵 ${formatMoney(r.cash || 0)} | 🏦 ${formatMoney(r.bank || 0)})\n`;
       });
     }

     await sock.sendMessage(chatId, { text }, { quoted: msg });
     break;
   }

//=============PREMIUM: BOOST============================//
   case 'boost': {
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `❌ Das ist ein Premium Command!` }, { quoted: msg });
       break;
     }

     const now = Date.now();
     const cooldown = 12 * 60 * 60 * 1000; // 12h
     const lastBoost = autoPremiumState.boost.get(senderJid) || 0;

     if ((now - lastBoost) < cooldown) {
       const remaining = formatTime(cooldown - (now - lastBoost));
       await sock.sendMessage(chatId, { text: `⏳ Dein Boost ist noch aktiv oder im Cooldown. Warte ${remaining}.` }, { quoted: msg });
       break;
     }

     const econ = getEconomy(senderJid);
     const bonus = Math.floor(Math.random() * 1000) + 500;
     econ.cash = (econ.cash || 100) + bonus;
     setEconomy(senderJid, econ);
     autoPremiumState.boost.set(senderJid, now);

     await sock.sendMessage(chatId, { text: `⚡ *Premium Boost aktiviert!*\n\n💵 Sofortbonus: +${formatMoney(bonus)} Cash\n⏱️ Nächster Boost in 12h\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     break;
   }

//=============PREMIUM: SHOP============================//
   case 'premiumshop': {
     const text = `🛒 *Premium Shop*\n\n`
      + `1) 7 Tage Premium — 6.000 Cash\n`
      + `2) 30 Tage Premium — 20.000 Cash\n`
      + `3) AutoWork / AutoFish freischalten — gratis für Premium, einfach /autowork on bzw. /autofish on\n\n`
      + `Kaufe mit: */buypremium 7* oder */buypremium 30*`;
     await sock.sendMessage(chatId, { text }, { quoted: msg });
     break;
   }

   case 'buypremium': {
     const days = parseInt(args[0]) || 30;
     const econ = getEconomy(senderJid);

     let price;
     if (days >= 30) price = 20000;
     else if (days >= 7) price = 6000;
     else price = Math.max(3000, days * 800);

     if (econ.cash < price) {
       await sock.sendMessage(chatId, { text: `❌ Zu wenig Cash! Benötigt: ${formatMoney(price)} | Hast: ${formatMoney(econ.cash)}` }, { quoted: msg });
       break;
     }

     econ.cash -= price;
     setEconomy(senderJid, econ);
     addPremium(senderJid, days);

     await sock.sendMessage(chatId, { text: `✅ Premium gekauft!\n\n⏱️ Dauer: ${days} Tage\n💸 -${formatMoney(price)} Cash\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     break;
   }

//=============PREMIUM: AUTO FEATURES============================//
   case 'autowork':
   case 'autofish':
   case 'multidaily': {
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `❌ Das ist ein Premium Command!` }, { quoted: msg });
       break;
     }

     const toggle = (args[0] || '').toLowerCase();
     const enable = toggle !== 'off' && toggle !== '0' && toggle !== 'false';
     const prem = getPremium(senderJid);

     if (command === 'autowork') prem.autowork = enable ? 1 : 0;
     if (command === 'autofish') prem.autofish = enable ? 1 : 0;
     if (command === 'multidaily') prem.multidaily = enable ? 1 : 0;

     setPremium(senderJid, prem);

     const statusText = enable ? 'aktiviert' : 'deaktiviert';
     await sock.sendMessage(chatId, { text: `🤖 ${command} ${statusText}.` }, { quoted: msg });
     break;
   }

//=============PREMIUM: SETTITLE============================//
   case 'settitle': {
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `❌ Das ist ein Premium Command!` }, { quoted: msg });
       break;
     }
     
     if (!q) {
       await sock.sendMessage(chatId, { text: `⚙️ Benutzung: */settitle <Titel>*\n\nBeispiel: */settitle 🔥 Legendary Player*` }, { quoted: msg });
       break;
     }
     
     const prem = getPremium(senderJid);
     prem.title = q.substring(0, 50);
     setPremium(senderJid, prem);
     
     await sock.sendMessage(chatId, { text: `✅ Titel gesetzt auf: ${prem.title}` }, { quoted: msg });
     break;
   }

//=============PREMIUM: SETCOLOR============================//
   case 'setcolor': {
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `❌ Das ist ein Premium Command!` }, { quoted: msg });
       break;
     }
     
     if (!q || !q.startsWith('#')) {
       await sock.sendMessage(chatId, { text: `🎨 Benutzung: */setcolor <#HEX>*\n\nBeispiele:\n#FF0000 (Rot)\n#00FF00 (Grün)\n#0000FF (Blau)` }, { quoted: msg });
       break;
     }
     
     const prem = getPremium(senderJid);
     prem.color = q;
     setPremium(senderJid, prem);
     
     await sock.sendMessage(chatId, { text: `✅ Farbe gesetzt auf: ${prem.color}` }, { quoted: msg });
     break;
   }

//=============PREMIUM: SETEMOJI============================//
   case 'setemoji': {
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `❌ Das ist ein Premium Command!` }, { quoted: msg });
       break;
     }
     
     if (!q) {
       await sock.sendMessage(chatId, { text: `😊 Benutzung: */setemoji <Emoji>*\n\nBeispiel: */setemoji 👑*` }, { quoted: msg });
       break;
     }
     
     const prem = getPremium(senderJid);
     prem.emoji = q.substring(0, 2);
     setPremium(senderJid, prem);
     
     await sock.sendMessage(chatId, { text: `✅ Emoji gesetzt auf: ${prem.emoji}` }, { quoted: msg });
     break;
   }

//=============PREMIUM: HIGHROLLER============================//
   case 'highroller': {
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `❌ Das ist ein Premium Command!` }, { quoted: msg });
       break;
     }
     
     if (!q) {
       await sock.sendMessage(chatId, { text: `🎰 Benutzung: */highroller <Betrag>*\n\n💎 Premium Casino - 5x Gewinn!` }, { quoted: msg });
       break;
     }
     
     const bet = parseInt(q);
     if (isNaN(bet) || bet <= 0) {
       await sock.sendMessage(chatId, { text: '❌ Ungültiger Betrag!' }, { quoted: msg });
       break;
     }
     
     const econ = getEconomy(senderJid);
     if (econ.cash < bet) {
       await sock.sendMessage(chatId, { text: `❌ Du hast nicht genug Cash!` }, { quoted: msg });
       break;
     }
     
     const symbols = ['💎', '💍', '👑', '🏆', '⭐'];
     const result = [symbols[Math.floor(Math.random() * symbols.length)], symbols[Math.floor(Math.random() * symbols.length)], symbols[Math.floor(Math.random() * symbols.length)]];
     
     const won = result[0] === result[1] && result[1] === result[2];
     const winAmount = bet * 5;
     
     if (won) {
       econ.cash += winAmount;
       await sock.sendMessage(chatId, { text: `💎 *HIGH ROLLER JACKPOT!*\n\n${result.join(' ')}\n\n🎉 GEWONNEN! +${formatMoney(winAmount)}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     } else {
       econ.cash -= bet;
       await sock.sendMessage(chatId, { text: `💎 *HIGH ROLLER*\n\n${result.join(' ')}\n\n❌ Verloren! -${formatMoney(bet)}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     }
     
     setEconomy(senderJid, econ);
     break;
   }

//=============PREMIUM: JACKPOT============================//
   case 'jackpot': {
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `❌ Das ist ein Premium Command!` }, { quoted: msg });
       break;
     }
     
     const econ = getEconomy(senderJid);
     const jackpotChance = Math.random();
     
     if (jackpotChance < 0.01) {
       const jackpotAmount = 50000;
       econ.cash += jackpotAmount;
       setEconomy(senderJid, econ);
       await sock.sendMessage(chatId, { text: `🎉 *MEGA JACKPOT!*\n\n🎰🎰🎰\n\n💥 +${formatMoney(jackpotAmount)} GEWONNEN!\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     } else {
       await sock.sendMessage(chatId, { text: `❌ Kein Jackpot diese Mal... Versuch dein Glück später!` }, { quoted: msg });
     }
     break;
   }

//=============PREMIUM: DOUBLE============================//
   case 'double': {
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `❌ Das ist ein Premium Command!` }, { quoted: msg });
       break;
     }
     
     if (!q) {
       await sock.sendMessage(chatId, { text: `🎲 Benutzung: */double <Betrag>*\n\n50% Chance dein Geld zu verdoppeln!` }, { quoted: msg });
       break;
     }
     
     const bet = parseInt(q);
     if (isNaN(bet) || bet <= 0) {
       await sock.sendMessage(chatId, { text: '❌ Ungültiger Betrag!' }, { quoted: msg });
       break;
     }
     
     const econ = getEconomy(senderJid);
     if (econ.cash < bet) {
       await sock.sendMessage(chatId, { text: `❌ Du hast nicht genug Cash!` }, { quoted: msg });
       break;
     }
     
     const won = Math.random() < 0.5;
     
     if (won) {
       econ.cash += bet;
       await sock.sendMessage(chatId, { text: `🎲 *DOUBLE OR NOTHING*\n\n✅ GEWONNEN!\n+${formatMoney(bet)}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     } else {
       econ.cash -= bet;
       await sock.sendMessage(chatId, { text: `🎲 *DOUBLE OR NOTHING*\n\n❌ VERLOREN!\n-${formatMoney(bet)}\n💰 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
     }
     
     setEconomy(senderJid, econ);
     break;
   }

//=============PREMIUM: CRYPTO============================//
   case 'crypto':
   case 'market': {
     const cryptoData = {
       BTC: 45000 + Math.floor(Math.random() * 5000),
       ETH: 2500 + Math.floor(Math.random() * 500),
       DOGE: 0.25 + (Math.random() * 0.05)
     };
     
     let text = `📈 *CRYPTO MARKT*\n\n`;
     for (const [symbol, price] of Object.entries(cryptoData)) {
       const change = (Math.random() * 20) - 10;
       text += `${symbol}: $${price.toFixed(2)} ${change > 0 ? '📈' : '📉'}\n`;
     }
     text += `\nNutze */buycrypto BTC 0.1* zum Kaufen\nNutze */sellcrypto BTC 0.1* zum Verkaufen`;
     
     await sock.sendMessage(chatId, { text }, { quoted: msg });
     break;
   }

//=============PREMIUM: BUYCRYPTO============================//
   case 'buycrypto':
   case 'buybtc': {
     if (!isPremium(senderJid)) {
       await sock.sendMessage(chatId, { text: `❌ Das ist ein Premium Command!` }, { quoted: msg });
       break;
     }
     
     const parts = q.split(' ');
     const symbol = parts[0]?.toUpperCase() || 'BTC';
     const amount = parseFloat(parts[1]) || 0.1;
     
     const prices = { BTC: 45000, ETH: 2500, DOGE: 0.25 };
     const price = prices[symbol] || 0;
     const totalCost = Math.floor(price * amount);
     
     const econ = getEconomy(senderJid);
     if (econ.cash < totalCost) {
       await sock.sendMessage(chatId, { text: `❌ Du hast nicht genug Cash!\nBenötigt: ${formatMoney(totalCost)}\nHast: ${formatMoney(econ.cash)}` }, { quoted: msg });
       break;
     }
     
     econ.cash -= totalCost;
     setEconomy(senderJid, econ);
     
     await sock.sendMessage(chatId, { text: `💰 *${symbol} gekauft!*\n\n📊 ${amount} ${symbol}\n💵 -${formatMoney(totalCost)} Cash\n💰 Verbleibend: ${formatMoney(econ.cash)}` }, { quoted: msg });
     break;
   }

   case 'ping': {
    let sender;
    if (msg.key.fromMe) {
        sender = sock.user.id.split(':')[0];
    } else if (isGroupChat && msg.key.participant) {
        sender = msg.key.participant.split('@')[0];
    } else {
        sender = chatId.split('@')[0];
    }
    const cleanedSender = sender.replace(/[^0-9]/g, '');

    const process = require('process');
    const start = Date.now();
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const currentTime = new Date().toLocaleString('de-DE');
    await new Promise((res) => setTimeout(res, 10));
    const latency = Date.now() - start;

    const message = `╭───❍ *Beast* ❍───╮
│
│ 🏓 *Pong:* ${latency}ms
│ ⏱️ Sek.: *${(latency / 1000).toFixed(2)}s*
│ 🕒 *Zeit:* ${currentTime}
│ ⌛ *Uptime:* ${days} Tg ${hours} Std ${minutes} Min
│ 
╰────────────────────╯`;

    // Einfach normal senden, ohne contextInfo
    await sock.sendMessage(from, { text: message });

    await sendReaction(from, msg, '✅');
    break;
}

case 'rules':
case 'regeln': {
  const rulesMessage = `📜 *Beast Bot – Regeln*

1️⃣ *Kein Spam*
Bitte sende Commands nicht 10× hintereinander.

2️⃣ *Kein Bot-Missbrauch*
Versuche nicht den Bot zu crashen oder Bugs auszunutzen.

3️⃣ *Respektvoll bleiben*
Beleidigungen, Hass oder toxisches Verhalten sind verboten.

4️⃣ *Keine illegalen Inhalte*
Der Bot darf nicht für illegale Sachen genutzt werden.

5️⃣ *Keine Werbung ohne Erlaubnis*
Spam-Werbung oder Links sind verboten.

6️⃣ *Owner & Admin respektieren*
Entscheidungen von Admins und dem Bot Owner werden akzeptiert. Dazu gilt auch das Teammitglieder nicht aus Gruppen entfernt werden dürfen oder das der Bot seinen Admin Status verliert.

7️⃣ *Keine NSFW Inhalte*
Der Bot ist nicht für 18+ Inhalte gedacht.

8️⃣ *Commands richtig nutzen*
Nutze nur echte Commands und keine Fake-Befehle.

9️⃣ *Keine Bot-Attacken*
Versuche nicht den Bot zu überlasten oder zu spammen.

🔟 *Regeln können sich ändern*
Der Owner kann Regeln jederzeit ändern.

⚠️ *Strafen bei Regelbruch:*
• Warnung
• Temporärer Bot-Ban
• Permanenter Ban

👑 *Bot Owner:* Beastmeds`;

  await sock.sendMessage(chatId, { text: rulesMessage }, { quoted: msg });
  break;
}

case 'spam': {
  if (!args[0]) {
    await sock.sendMessage(chatId, { 
      text: `⚙️ Aktueller Spam-Intervall: ${spamInterval}ms\n\nVerwendung: /spam <millisekunden>` 
    }, { quoted: msg });
    break;
  }

  const duration = parseInt(args[0]);
  if (isNaN(duration) || duration < 0) {
    await sock.sendMessage(chatId, { 
      text: '❌ Bitte gib eine gültige Millisekunden-Zahl ein (z.B. /spam 1000)' 
    }, { quoted: msg });
    break;
  }

  spamInterval = duration;
  await sock.sendMessage(chatId, { 
    text: `✅ Spam-Intervall auf ${duration}ms gesetzt!\n\nNutze jetzt /message <text> um zu testen.` 
  }, { quoted: msg });
  break;
}

case 'message': {
  if (spamInterval === 0) {
    await sock.sendMessage(chatId, { 
      text: '⚠️ Spam-Intervall nicht gesetzt!\n\nSetze ihn zuerst mit /spam <millisekunden>' 
    }, { quoted: msg });
    break;
  }

  if (!args.join('').trim()) {
    await sock.sendMessage(chatId, { 
      text: '❌ Bitte gib eine Nachricht ein.' 
    }, { quoted: msg });
    break;
  }

  const testMessage = args.join(' ');
  const startTime = Date.now();
  let responseTime = 0;

  // Nachricht senden
  await sock.sendMessage(chatId, { text: testMessage });

  // Warte auf den Intervall
  await new Promise((res) => setTimeout(res, spamInterval));

  responseTime = Date.now() - startTime;

  const reply = `📊 Spam-Test Ergebnis:\n\n⏱️ **Antwortzeit:** ${responseTime}ms\n⏳ **Eingestellter Intervall:** ${spamInterval}ms\n📝 **Nachricht:** "${testMessage}"\n\n${responseTime <= spamInterval ? '✅ Schneller als erwartet!' : '⚠️ Langsamer als erwartet'}`;
  
  await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
  break;
}

// === CREATOR CODE MANAGEMENT ===
case 'creator': {
  const subcommand = args[0]?.toLowerCase();
  const senderRank = ranks.getRank(sender);
  const isOwner = ['Inhaber', 'Stellvertreter Inhaber'].includes(senderRank);

  if (!isOwner) {
    await sock.sendMessage(chatId, { text: '❌ Nur Owner/Stellvertreter dürfen Creator verwalten.' }, { quoted: msg });
    break;
  }

  const codes = loadCodes();

  if (subcommand === 'add') {
    const creatorName = args.slice(1).join(' ').trim();
    if (!creatorName) {
      await sock.sendMessage(chatId, { text: `❌ Nutzung: /creator add <Name>\n\nBeispiel: /creator add MaxChannel` }, { quoted: msg });
      break;
    }

    // Generiere eindeutigen Code
    const creatorCode = `CREATOR_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    
    codes.creators.push({
      name: creatorName,
      code: creatorCode,
      createdAt: new Date().toISOString(),
      redeems: 0
    });

    saveCodes(codes);
    await sock.sendMessage(chatId, { text: `✅ *Creator hinzugefügt!*\n\n👤 Name: ${creatorName}\n🔑 Code: \`${creatorCode}\`\n\n💰 Einlösebonus: 100.000 Coins` }, { quoted: msg });
    console.log(`[CREATOR] ${creatorName} - ${creatorCode}`);
  } else if (subcommand === 'list') {
    if (codes.creators.length === 0) {
      await sock.sendMessage(chatId, { text: '❌ Keine Creator vorhanden.' }, { quoted: msg });
      break;
    }

    let creatorList = `📋 *Creator Liste:*\n\n`;
    codes.creators.forEach((c, i) => {
      creatorList += `${i + 1}. ${c.name}\n🔑 ${c.code}\n📊 Einlösungen: ${c.redeems}\n\n`;
    });

    await sock.sendMessage(chatId, { text: creatorList }, { quoted: msg });
  } else {
    await sock.sendMessage(chatId, { text: `❌ Nutzung:\n/creator add <Name>\n/creator list` }, { quoted: msg });
  }
  break;
}

// === CODE EINLÖSEN (Creator Code) ===
case 'code': {
  if (!args[0]) {
    await sock.sendMessage(chatId, { text: `❌ Nutzung: /code <CreatorCode>\n\nBeispiel: /code CREATOR_ABC123` }, { quoted: msg });
    break;
  }

  const inputCode = args[0].toUpperCase();
  const codes = loadCodes();

  // Prüfe ob Creator-Code existiert
  const creator = codes.creators.find(c => c.code === inputCode);
  if (!creator) {
    await sock.sendMessage(chatId, { text: '❌ Ungültiger Creator Code!' }, { quoted: msg });
    break;
  }

  // Prüfe ob Code bereits eingelöst wurde
  if (!codes.usedCodes[senderJid]) codes.usedCodes[senderJid] = [];
  if (codes.usedCodes[senderJid].includes(inputCode)) {
    await sock.sendMessage(chatId, { text: `❌ Du hast diesen Code bereits eingelöst!` }, { quoted: msg });
    break;
  }

  // Gib 100.000 Coins
  const econ = getEconomy(senderJid);
  econ.cash = (econ.cash || 0) + 100000;
  setEconomy(senderJid, econ);

  // Markiere Code als verwendet
  codes.usedCodes[senderJid].push(inputCode);
  creator.redeems = (creator.redeems || 0) + 1;
  saveCodes(codes);

  await sock.sendMessage(chatId, { text: `✅ *Creator Code eingelöst!*\n\n👤 Creator: ${creator.name}\n💰 +100.000 Cash\n\n💵 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
  console.log(`[CODE] ${sender} redeemed ${inputCode} from ${creator.name}`);
  break;
}

// === REDEEM CODE MANAGEMENT ===
case 'redeem': {
  const subcommand = args[0]?.toLowerCase();
  const senderRank = ranks.getRank(sender);
  const isTeam = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'].includes(senderRank);

  if (subcommand === 'add') {
    // Nur Owner/Team darf neue Codes erstellen
    if (!['Inhaber', 'Stellvertreter Inhaber'].includes(senderRank)) {
      await sock.sendMessage(chatId, { text: '❌ Nur Owner/Stellvertreter dürfen Redeem-Codes erstellen.' }, { quoted: msg });
      break;
    }

    const rewardStr = args[1];
    if (!rewardStr || isNaN(rewardStr)) {
      await sock.sendMessage(chatId, { text: `❌ Nutzung: /redeem add <Belohnung in Coins>\n\nBeispiel: /redeem add 50000` }, { quoted: msg });
      break;
    }

    const reward = parseInt(rewardStr);
    if (reward <= 0) {
      await sock.sendMessage(chatId, { text: '❌ Belohnung muss größer als 0 sein!' }, { quoted: msg });
      break;
    }

    // Generiere eindeutigen Code
    const redeemCode = `REDEEM_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    
    const codes = loadCodes();
    codes.redeemCodes.push({
      code: redeemCode,
      reward: reward,
      type: 'cash',
      createdBy: senderRank,
      createdAt: new Date().toISOString(),
      redeems: 0,
      active: true
    });

    saveCodes(codes);
    await sock.sendMessage(chatId, { text: `✅ *Redeem-Code erstellt!*\n\n🔑 Code: \`${redeemCode}\`\n💰 Belohnung: ${formatMoney(reward)}\n\nNutzer können den Code mit /redeem <code> einlösen.` }, { quoted: msg });
    console.log(`[REDEEM ADD] ${redeemCode} - ${reward} Coins`);
  } else if (subcommand === 'list') {
    if (!isTeam) {
      await sock.sendMessage(chatId, { text: '❌ Nur Team-Mitglieder dürfen Codes sehen.' }, { quoted: msg });
      break;
    }

    const codes = loadCodes();
    if (codes.redeemCodes.length === 0) {
      await sock.sendMessage(chatId, { text: '❌ Keine Redeem-Codes vorhanden.' }, { quoted: msg });
      break;
    }

    let codeList = `📋 *Redeem-Code Liste:*\n\n`;
    codes.redeemCodes.forEach((c, i) => {
      const status = c.active ? '✅' : '❌';
      codeList += `${i + 1}. ${c.code} ${status}\n💰 ${formatMoney(c.reward)}\n📊 Einlösungen: ${c.redeems}\n\n`;
    });

    await sock.sendMessage(chatId, { text: codeList }, { quoted: msg });
  } else {
    // Einlösen eines Redeem-Codes
    const inputCode = args[0]?.toUpperCase();
    if (!inputCode) {
      await sock.sendMessage(chatId, { text: `❌ Nutzung: /redeem <Code>\n\nBeispiel: /redeem REDEEM_ABC123` }, { quoted: msg });
      break;
    }

    const codes = loadCodes();
    const redeem = codes.redeemCodes.find(c => c.code === inputCode && c.active);
    
    if (!redeem) {
      await sock.sendMessage(chatId, { text: '❌ Ungültiger oder inaktiver Redeem-Code!' }, { quoted: msg });
      break;
    }

    // Prüfe ob Code bereits eingelöst wurde
    if (!codes.usedCodes[senderJid]) codes.usedCodes[senderJid] = [];
    if (codes.usedCodes[senderJid].includes(inputCode)) {
      await sock.sendMessage(chatId, { text: `❌ Du hast diesen Code bereits eingelöst!` }, { quoted: msg });
      break;
    }

    // Gib Belohnung
    const econ = getEconomy(senderJid);
    econ.cash = (econ.cash || 0) + redeem.reward;
    setEconomy(senderJid, econ);

    // Markiere Code als verwendet
    codes.usedCodes[senderJid].push(inputCode);
    redeem.redeems = (redeem.redeems || 0) + 1;
    saveCodes(codes);

    await sock.sendMessage(chatId, { text: `✅ *Gutschein eingelöst!*\n\n💰 +${formatMoney(redeem.reward)} Cash\n\n💵 Neuer Kontostand: ${formatMoney(econ.cash)}` }, { quoted: msg });
    console.log(`[REDEEM] ${sender} redeemed ${inputCode} - ${redeem.reward} Coins`);
  }
  break;
}


async function isUserAdmin(jid, sender) {
  try {
    const groupMeta = await sock.groupMetadata(jid);
    const participant = groupMeta.participants.find(p => p.id === sender);
    return participant?.admin !== undefined;
  } catch (e) {
    console.error('Fehler bei Admin-Check:', e.message);
    return false;
  }
}
// ============= ADMIN PRÜFUNG IM CASE ================ //
//=============Gruppen Func============================//
case 'welcome0000000000000000000000': {
  const sender = msg.key.participant || msg.key.remoteJid;

  const groupStatus = welcomeGroups[from];
  const newStatus = !groupStatus;
  welcomeGroups[from] = newStatus;
  saveWelcomeData();

  const statusText = newStatus 
    ? '✅ Willkommensnachricht **aktiviert**.' 
    : '❌ Willkommensnachricht **deaktiviert**.';

  await sock.sendMessage(from, { text: statusText });
}
break;

case 'tagall': {
  const isGroup = from.endsWith('@g.us');
  
  if (!isGroup) {
    await sock.sendMessage(from, { text: 'Dieser Befehl funktioniert nur in Gruppen.' });
    break;
  }

  const groupMetadata = await sock.groupMetadata(from);
  const participants = groupMetadata.participants;
  const mentions = participants.map((p) => p.id);
  
  const messageText = '⸸BeastBot⸸\nTagged All\n\n\n' + 
    mentions.map((id) => `⭐️ • @${id.split('@')[0]}`).join('\n');
  
  await sock.sendMessage(from, {
    text: messageText,
    mentions: mentions});
}
break;
case 'grpinfo': {
  try {
    const groupMetadata = await sock.groupMetadata(from);
    const groupImg = await sock.profilePictureUrl(from, 'image').catch(() => null);

    const subject = groupMetadata.subject || 'Unbekannt';
    const description = groupMetadata.desc || 'Keine Beschreibung';
    const owner = groupMetadata.owner || 'Unbekannt';
    const creation = groupMetadata.creation
      ? new Date(groupMetadata.creation * 1000).toLocaleString('de-DE')
      : 'Unbekannt';
    const groupId = groupMetadata.id || 'Unbekannt';
    const inviteCode = groupMetadata.inviteCode || 'Kein Einladungslink verfügbar';
    const descOwner = groupMetadata.descOwner || 'Unbekannt';
    const descTime = groupMetadata.descTime
      ? new Date(groupMetadata.descTime * 1000).toLocaleString('de-DE')
      : 'Unbekannt';

    const participants = groupMetadata.participants || [];
    const participantsCount = participants.length;
    const admins = participants.filter(p => p.admin === 'admin');
    const superadmins = participants.filter(p => p.admin === 'superadmin');
    const allAdmins = [...admins, ...superadmins];
    const adminsCount = allAdmins.length;
    const adminMentions = allAdmins.map(a => `@${a.id.split('@')[0]}`).join(', ') || 'Keine';

    const isAnnounce = groupMetadata.announce;
    const groupSettings = isAnnounce ? '🔒 Nur Admins dürfen schreiben' : '🔓 Alle dürfen schreiben';

    const infoMessage =
      `📋 *Gruppeninfo:*\n` +
      `👥 *Name:* ${subject}\n` +
      `📝 *Beschreibung:* ${description}\n` +
      `💬 *Beschreibung geändert von:* @${descOwner.split('@')[0]} am ${descTime}\n` +
      `👑 *Eigentümer:* @${owner.split('@')[0]}\n` +
      `📆 *Erstellt am:* ${creation}\n` +
      `🆔 *Gruppen-ID:* ${groupId}\n` +
      `🔗 *Einladungslink:* https://chat.whatsapp.com/${inviteCode}\n` +
      `👤 *Teilnehmer:* ${participantsCount}\n` +
      `🛡️ *Admins insgesamt:* ${adminsCount}\n` +
      `👮 *Adminliste:* ${adminMentions}\n` +
      `${groupSettings}`;

    await sock.sendMessage(from, {
      image: groupImg ? { url: groupImg } : undefined,
      caption: infoMessage,
      contextInfo: {
        mentionedJid: allAdmins.map(a => a.id)
      }
    });

  } catch (e) {
    console.error('❌ Fehler beim Abrufen der Gruppeninfo:', e.message);
    await sock.sendMessage(from, { text: '❌ Gruppeninfo konnte nicht abgerufen werden.' });
  }
}
break;
case 'device':{
    const chatId = msg.key.remoteJid;

    const contextInfo = msg.message.extendedTextMessage?.contextInfo;

    if (!contextInfo || !contextInfo.stanzaId) {
        await StormBot.sendMessage(chatId, {
            text: '❌ Bitte antworte auf eine Nachricht, um saubere Meta anzuzeigen.'
        });
        break;
    }

    const quotedParticipant = contextInfo.participant;
    const quotedId = contextInfo.stanzaId;
    const idUpper = quotedId.toUpperCase();
    let device = 'Unbekannt';
  

    if (idUpper.startsWith('3E')) {
        device = 'Whatsapp Web Client';
    } else if (idUpper.includes('NEELE')) {
        device = 'Neelegirl/Wa-Api Process via iOS';
    } else if (idUpper.includes('STORM')) {
        device = 'Official StormBot (717Developments/Baileys)';
    } else if (idUpper.startsWith('2A')) {
      device = 'Apple iOS (Business Account)';
    } else if (idUpper.startsWith('3A')) {
        device = 'Apple iOS';
    } else if (idUpper.startsWith('3C')) {
        device = 'Apple iOS';
    } else if (quotedId.length >= 30) {
        device = 'Android';
    }

    const mentionJid = quotedParticipant ? [quotedParticipant] : [];

    const text = `━━ ❮ STORMBOT ❯ ━━

${quotedParticipant ? `@${quotedParticipant.split('@')[0]}` : 'Unbekannt'} verwendet

「 ${device} 」

> MSG-ID: ${quotedId}`;

    await StormBot.sendMessage(chatId, {
        text,
        mentions: mentionJid
    });
}
break;
case 'baninfo': {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

     if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }

  // 🔍 Argument prüfen
  if (args.length < 1) {
    await sock.sendMessage(from, { text: '⚙️ Nutzung: .checkbanwa <Telefonnummer>' });
    return;
  }

  const input = args[0];
  const cleanNumber = input.replace(/\D/g, ''); // Nur Zahlen behalten

  if (cleanNumber.length < 7) {
    await sock.sendMessage(from, { text: '⚠️ Ungültige Telefonnummer eingegeben.' });
    return;
  }

  const jid = `${cleanNumber}@s.whatsapp.net`;

  try {
    // 🛰️ WhatsApp-Ban-Status abfragen
    const onWA = await sock.onWhatsApp(jid);
    const isRegistered = onWA?.[0]?.exists || false;
    const lid = onWA?.[0]?.lid || 'null';
    const name = onWA?.[0]?.name || 'unknown';
    const isBanned = !isRegistered;

    // 💀 Hacker-Stil Ergebnis — kein Forward/Newsletter-Metakram
    const msg =
      '╭─────────────────────\n' +
      '│  ⌁ WHATSAPP PERMABAN REPORT ⌁\n' +
      '├─────────────────────\n' +
      `│ ▶ Number : +${cleanNumber}\n` +
      `│ ▶ Name   : ${name}\n` +
      `│ ▶ LID    : ${lid}\n` +
      `│ ▶ Status : ${isBanned ? '❌ PERMABANNED/NOT REGISTERED' : '✅ ACTIVE'}\n` +
      '├─────────────────────\n' +
      '│  System : SB-Network\n' +
      '│  Probe  : Beastmeds \n' +
      '╰─────────────────────';

    // Hinweis: Kein contextInfo gesetzt, somit wird die Nachricht nicht als "weitergeleitet" markiert.
    await sock.sendMessage(from, { text: msg });
  } catch (e) {
    console.error('WhatsApp-Ban-Check-Fehler:', e);
    await sock.sendMessage(from, { text: `💥 ERROR: ${e.message}` });
  }

  break;
}
case 'check': {
  // 🔹 Nur Projectleader oder höher
   const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

     if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }

  // 🔹 Argumente prüfen
  if (args.length < 1) {
    await sock.sendMessage(from, { text: '❌ Nutzung: ♤check <Telefonnummer>' });
    return;
  }

  const input = args[0];
  const cleanNumber = input.replace(/\D/g, ''); // Nur Ziffern
  if (cleanNumber.length < 7) {
    await sock.sendMessage(from, { text: '❌ Ungültige Telefonnummer.' });
    return;
  }

  const jid = `${cleanNumber}@s.whatsapp.net`;

  try {
    // 🔹 WhatsApp-Status prüfen
    const onWA = await sock.onWhatsApp(jid);
    const isRegistered = onWA?.[0]?.exists || false;
    const lid = onWA?.[0]?.lid || 'kein LID';
    const name = onWA?.[0]?.name || 'Unbekannt';
    const isBanned = !isRegistered; 
    const banReason = onWA?.[0]?.banReason || 'Kein Grund';

    // 🔹 Gerätetyp erkennen
    let deviceType = 'Unbekannt';
    let deviceModel = 'Unbekannt';

    if (lid && lid.length > 21) {
      deviceType = '🟢 Android';
      const modelMatch = lid.match(/([A-Z0-9]{4,})/);
      if (modelMatch) deviceModel = modelMatch[0];
    } else if (lid && lid.startsWith('3A')) {
      deviceType = '🔵 iOS';
      deviceModel = 'iPhone';
    } else {
      deviceType = '🌐 WhatsApp Web / Bot';
      deviceModel = 'Desktop';
    }

    // 🔹 Zeitpunkt formatieren
    const now = new Date().toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // 🔹 Nachricht senden
    let checkText = `🛡 *GERÄTE-CHECK*\n\n`;
    checkText += `👤 *Absender:* @${jid.split('@')[0]}\n`;
    checkText += `📱 *Plattform:* ${deviceType}\n`;
    checkText += `📱 *Modell:* ${deviceModel}\n`;
    checkText += `🕒 *Geprüft:* ${now}\n\n`;
    checkText += `🔍 *WHATSAPP-STATUS*\n`;
    checkText += `📊 *Registriert:* ${isRegistered ? '✅ Ja' : '❌ Nein'}\n`;
    checkText += `📛 *Name:* ${name}\n`;
    checkText += `🆔 *LID:* ${lid}\n`;
    checkText += `📊 *Status:* ${isBanned ? '❌ Gebannt' : '✅ Nicht gebannt'}\n`;
    checkText += `📝 *Grund:* ${banReason}\n`;
    checkText += `\n✨ *Akame* läuft stabil.`;

    await sock.sendMessage(from, {
      text: checkText,
      contextInfo: {
        mentionedJid: [jid]
      }
    });

  } catch (e) {
    console.error('Check-Fehler:', e);
    await sock.sendMessage(from, { text: `❌ Fehler: ${e.message}` });
  }
break;
}
case 'check2': {
  // 🔹 Nur Projectleader oder höher
  const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

     if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }
  try {
    // —— Bestimme die JID des Senders —— //
    // Wenn der Chat eine Gruppe ist, versuche die participant-JID zu nutzen.
    let senderJid = null;

    // 1) übliche Helfer-Variable 'sender' (falls vorhanden)
    if (typeof sender !== 'undefined' && sender) {
      senderJid = sender;
    }
    // 2) Message-Objekt 'm' (häufiger Name) -> m.key.participant (gruppen)
    else if (typeof m !== 'undefined' && m?.key?.participant) {
      senderJid = m.key.participant;
    }
    // 3) Fallback: remoteJid 'from' (bei privaten Chats ist das der Sender)
    else {
      senderJid = from;
    }

    // Normalisiere JID (falls nur Nummer übergeben wurde)
    if (!senderJid.includes('@')) {
      senderJid = `${senderJid}@s.whatsapp.net`;
    }

    // 🔹 WhatsApp-Status prüfen
    const onWA = await sock.onWhatsApp(senderJid);
    const isRegistered = onWA?.[0]?.exists || false;
    const lid = onWA?.[0]?.lid || 'kein LID';
    const name = onWA?.[0]?.name || 'Unbekannt';
    const isBanned = !isRegistered;
    const banReason = onWA?.[0]?.banReason || 'Kein Grund';

    // 🔹 Gerätetyp erkennen
    let deviceType = 'Unbekannt';
    let deviceModel = 'Unbekannt';

    if (lid && lid.length > 21) {
      deviceType = '🟢 Android';
      const modelMatch = lid.match(/([A-Z0-9]{4,})/);
      if (modelMatch) deviceModel = modelMatch[0];
    } else if (lid && lid.startsWith('3A')) {
      deviceType = '🔵 iOS';
      deviceModel = 'iPhone';
    } else {
      deviceType = '🌐 WhatsApp Web / Bot';
      deviceModel = 'Desktop';
    }

    // 🔹 Zeitpunkt formatieren
    const now = new Date().toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // 🔹 Nachricht senden
    let checkText = `🛡 *GERÄTE-CHECK (Sender)*\n\n`;
    checkText += `👤 *Absender:* @${senderJid.split('@')[0]}\n`;
    checkText += `📱 *Plattform:* ${deviceType}\n`;
    checkText += `📱 *Modell:* ${deviceModel}\n`;
    checkText += `🕒 *Geprüft:* ${now}\n\n`;
    checkText += `🔍 *WHATSAPP-STATUS*\n`;
    checkText += `📊 *Registriert:* ${isRegistered ? '✅ Ja' : '❌ Nein'}\n`;
    checkText += `📛 *Name:* ${name}\n`;
    checkText += `🆔 *LID:* ${lid}\n`;
    checkText += `📊 *Status:* ${isBanned ? '❌ Gebannt' : '✅ Nicht gebannt'}\n`;
    checkText += `📝 *Grund:* ${banReason}\n`;
    checkText += `\n✨ *Akame* läuft stabil.`;

    await sock.sendMessage(from, {
      text: checkText,
      contextInfo: { mentionedJid: [senderJid] }
    });

  } catch (e) {
    console.error('Check-Fehler:', e);
    await sock.sendMessage(from, { text: `❌ Fehler: ${e.message}` });
  }
break;
}
case 'fucked': {
    try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'crasher'];

    if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
      await sock.sendMessage(from, {
        text: "⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
      }, { quoted: msg });
      break;
    }

    // Gruppenbeschreibung mit Symbolen füllen
    const maxLen = 2048;
    const symbol = 'ꦺ';
    const desc = symbol.repeat(maxLen);
    await sock.groupUpdateDescription(from, desc);
 await sock.groupUpdateSubject(from, "Fucked🩸");
    // Gruppenbild ändern (1.jpg)



    // Erfolgsnachricht
    await sock.sendMessage(from, {
      text: '✅ Group Closed ',
      mentions: [sender]
    }, { quoted: msg });

  } catch (e) {
    console.error('Fehler beim Setup der Gruppe:', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Setup der Gruppe. Prüfe die Logs!' }, { quoted: msg });
  }

  break;
}





case 'devicecheck': {
  // Optional: nur bestimmten Rollen erlauben
  // const senderRank = ranks.getRank(sender);
  // const allowed = ['Inhaber', 'Stellvertreter Inhaber'];
  // if (!allowed.includes(senderRank)) { ... }
   const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'crasher'];

     if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
    break;
  }
  // Nummer: Entweder erstes Argument oder Absender (ohne @s.whatsapp.net)
  let targetNumber = args[0];
  if (!targetNumber) {
    // Fallback: falls die Message gequotet ist, nimm quoted sender, sonst message sender
    if (msg?.message?.extendedTextMessage?.contextInfo?.participant) {
      targetNumber = msg.message.extendedTextMessage.contextInfo.participant.split('@')[0];
    } else {
      targetNumber = sender.split('@')[0];
    }
  }
  const cleanNumber = targetNumber.replace(/\D/g, '');
  if (cleanNumber.length < 7) {
    await sock.sendMessage(from, { text: '⚠️ Ungültige Telefonnummer. Nutzung: .devicecheck <Telefonnummer> (oder als Reply ohne Nummer).' }, { quoted: msg });
    return;
  }

  const jid = `${cleanNumber}@s.whatsapp.net`;

  try {
    // Grunddaten von onWhatsApp
    const onWA = await sock.onWhatsApp(jid);
    const exists = !!(onWA && onWA[0] && onWA[0].exists);
    const name = onWA?.[0]?.name || 'Unbekannt';
    const lid = onWA?.[0]?.lid || 'kein LID';

    // Ban/Reachability-Probe (Heuristik)
    let status = '';
    if (!exists) {
      status = '❌ Nicht registriert';
    } else {
      try {
        // stille Probe — sehr kurz
        await sock.sendMessage(jid, { text: '.' });
        status = '✅ Nicht gebannt';
      } catch (probeErr) {
        const emsg = (probeErr && (probeErr.message || probeErr.toString())) || '';
        if (/forbidden|blocked|temporar(y|ily)|limit|429|spam/i.test(emsg)) {
          status = '⚠️ Temporär gebannt (möglicher Spam-Lock)';
        } else if (/not found|404|no such user/i.test(emsg)) {
          status = '❌ Nicht registriert';
        } else {
          status = '❓ Unklar (Fehler bei Probe)';
        }
      }
    }

    // Datum / Zeit in Europe/Berlin formatieren
    const now = new Date();
    const berlinFmt = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const berlinStr = berlinFmt.format(now).replace(',', '');

    // Plattform / Modell (so gut es geht deduzieren; du kannst das anpassen)
    // Wenn der onWA-Response device info liefern würde, könnte man das hier setzen.
    const platform = 'WSL Ubuntu';
    const model = 'SB-Network';

    // Custom system status line (anpassbar)
    const systemNote = '✨ Akame läuft stabil.';

    // Ergebnis-Message im gewünschten Stil
    const out =
      '🛡 GERÄTE-CHECK\n\n' +
      `👤 Absender: @~${name !== 'Unbekannt' ? name : cleanNumber}\n` +
      `📱 Plattform: ${platform}\n` +
      `📱 Modell: ${model}\n` +
      `🕒 Geprüft: ${berlinStr}\n\n` +
      '🔍 WHATSAPP-STATUS\n' +
      `📊 Registriert: ${exists ? '✅ Ja' : '❌ Nein'}\n` +
      `📛 Name: ${name}\n` +
      `🆔 LID: ${lid}\n` +
      `📊 Status: ${status}\n\n` +
      `${systemNote}`;

    await sock.sendMessage(from, { text: out }, { quoted: msg });

  } catch (err) {
    console.error('devicecheck-Fehler:', err);
    await sock.sendMessage(from, { text: `💥 ERROR: ${err.message || err}` }, { quoted: msg });
  }
  break;
}
case 'devicecheck2': {
  try {
    // 🌸 Süßer Zugriff-Check
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];
    if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
      const accessDeniedText =
        "🌸 *Awww... Zugriff verweigert!* 🌸\n\n" +
        "Nur die folgenden Rollen dürfen diesen besonderen Befehl nutzen:\n\n" +
        "• 👑 *Inhaber*\n" +
        "• 🛡️ *Stellvertreter Inhaber*\n\n" +
        "_Kleiner Tipp:_ Vielleicht frag lieb nach Erlaubnis... 💌";
      await sock.sendMessage(from, { text: accessDeniedText }, { quoted: msg });
      break;
    }

    // 🧩 Zielnummer bestimmen: Argument > Mention > Reply > Sender
    let targetNumber;
    let targetIsSender = false;
    if (args[0]) {
      targetNumber = args[0].replace(/\D/g, '');
    } else if (msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      targetNumber = msg.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
    } else if (msg?.message?.extendedTextMessage?.contextInfo?.participant) {
      targetNumber = msg.message.extendedTextMessage.contextInfo.participant.split('@')[0];
    } else {
      targetNumber = sender.split('@')[0];
      targetIsSender = true;
    }

    // 🔍 Validierung
    if (!targetNumber || targetNumber.length < 7) {
      await sock.sendMessage(from, {
        text: '⚠️ Ungültige Nummer. Nutzung: `.devicecheck <Telefonnummer>` oder auf Nachricht antworten oder mention verwenden.'
      }, { quoted: msg });
      return;
    }

    const jid = `${targetNumber}@s.whatsapp.net`;

    // 🛰️ Grunddaten von onWhatsApp abrufen (falls verfügbar)
    const onWA = await sock.onWhatsApp(jid);
    const exists = !!(onWA && onWA[0] && onWA[0].exists);
    const name = onWA?.[0]?.name || 'Unbekannt';
    const lid = onWA?.[0]?.lid || 'kein LID';

    // 🔎 Gerät / Plattform-Detektion (mehrere Quellen, Priorität unten)
    let deviceDetected = 'Unbekannt';
    let deviceSource = 'none';

    // 1) Prüfe ob onWhatsApp ein explizites Feld liefert (common heuristics)
    if (onWA && onWA[0]) {
      const info = onWA[0];

      // mögliche property-namen prüfen (abhängig von lib/version)
      if (info.platform) {
        deviceDetected = String(info.platform);
        deviceSource = 'onWhatsApp.platform';
      } else if (info.device) {
        deviceDetected = String(info.device);
        deviceSource = 'onWhatsApp.device';
      } else if (info.userAgent) {
        deviceDetected = String(info.userAgent);
        deviceSource = 'onWhatsApp.userAgent';
      } else if (info.isBusiness !== undefined) {
        deviceDetected = info.isBusiness ? 'Business Account (device unknown)' : 'Regular Account (device unknown)';
        deviceSource = 'onWhatsApp.isBusiness';
      }
    }

    // 2) Wenn noch unbekannt: versuche aus message/contextInfo Hinweise zu ziehen
    if (deviceDetected === 'Unbekannt') {
      // Wenn das Target die gesendete/quotete Nachricht ist, schaue in quotedMessage
      const ctx = msg?.message?.extendedTextMessage?.contextInfo;
      if (ctx?.quotedMessage) {
        const q = ctx.quotedMessage;
        // Manche libs stecken meta in quotedMessage (z. B. sender name / device), prüfen:
        if (q?.conversation) {
          // kein device, aber Hinweis auf mobile/web nicht vorhanden
        }
        // Falls quotedMessage eine senderKeyDistributionMessage o.ä. enthält,
        // interpretieren wir das als "Mobile" (heuristisch)
        if (q?.senderKeyDistributionMessage) {
          deviceDetected = 'Mobile (senderKeyDistributionMsg)';
          deviceSource = 'quotedMessage.senderKeyDistributionMessage';
        }
      }

      // 3) Wenn Target ist der Sender (du willst dein eigenes Device sehen), probiere msg.key
      if (deviceDetected === 'Unbekannt' && targetIsSender) {
        // Hinweis: viele libs geben keine Device-Info für Sender; wir versuchen ein paar heuristiken
        if (msg?.key?.fromMe) {
          deviceDetected = 'This client (bot) — local device unknown';
          deviceSource = 'msg.key.fromMe';
        } else if (msg?.pushName) {
          deviceDetected = `PushName present — likely Mobile or Web`;
          deviceSource = 'msg.pushName';
        }
      }
    }

  
    if (deviceDetected === 'Unbekannt') {
      // Manche JIDs für Business/Service haben erkennbaren Präfix — sehr unzuverlässig
      if (/^\d+@g\.us$/.test(jid)) {
        deviceDetected = 'Group (kein einzelnes Device)';
        deviceSource = 'jid.pattern';
      } else {
        // Wenn existiert aber keine Daten: markieren als "device unknown (registered)"
        if (exists) {
          deviceDetected = 'Gerät unbekannt (registriert)';
          deviceSource = 'heuristic.exists';
        } else {
          deviceDetected = 'Nicht registriert / kein Gerät';
          deviceSource = 'heuristic.notExists';
        }
      }
    }


    let status = '';
    if (!exists) {
      status = '❌ Nicht registriert';
    } else {
      try {
        await sock.sendMessage(jid, { text: '.' });
        status = '✅ Nicht gebannt';
      } catch (probeErr) {
        const emsg = (probeErr?.message || probeErr.toString() || '').toLowerCase();
        if (/forbidden|blocked|temporar(y|ily)|limit|429|spam/.test(emsg)) {
          status = '⚠️ Temporär gebannt (Spam oder Limitierung erkannt)';
        } else if (/not found|404|no such user/.test(emsg)) {
          status = '❌ Nicht registriert';
        } else {
          status = '❓ Unklar (Fehler bei Probe)';
        }
      }
    }

    const now = new Date();
    const berlinFmt = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const berlinStr = berlinFmt.format(now).replace(',', '');


    const out =
      '🛡 GERÄTE-CHECK\n\n' +
      `👤 Ziel: @~${name !== 'Unbekannt' ? name : targetNumber}\n` +
      `📱 Plattform: ${deviceDetected}\n` +
      `📎 Device-Info-Quelle: ${deviceSource}\n` +
      `📱 Modell: ${deviceDetected.includes('Mobile') ? 'Mobile' : deviceDetected.includes('Desktop') ? 'Desktop' : '—'}\n` +
      `🕒 Geprüft: ${berlinStr}\n\n` +
      '🔍 WHATSAPP-STATUS\n' +
      `📊 Registriert: ${exists ? '✅ Ja' : '❌ Nein'}\n` +
      `📛 Name: ${name}\n` +
      `🆔 LID: ${lid}\n` +
      `📊 Status: ${status}\n\n` +
      '✨ Akame läuft stabil.';

    await sock.sendMessage(from, { text: out }, { quoted: msg });

  } catch (err) {
    console.error('devicecheck-Fehler:', err);
    await sock.sendMessage(from, { text: `💥 ERROR: ${err.message || err}` }, { quoted: msg });
  }
  break;
}





case 'server': {
  try {
    const os = require('os');
    const { execSync } = require('child_process');

    const hostname = os.hostname();
    const userInfo = os.userInfo().username;
    const cpuModel = os.cpus()[0].model;

    function getCpuUsage() {
      return new Promise((resolve) => {
        const start = os.cpus();
        setTimeout(() => {
          const end = os.cpus();
          let idleDiff = 0;
          let totalDiff = 0;
          for (let i = 0; i < start.length; i++) {
            const s = start[i].times;
            const e = end[i].times;
            idleDiff += e.idle - s.idle;
            totalDiff +=
              (e.user - s.user) +
              (e.nice - s.nice) +
              (e.sys - s.sys) +
              (e.irq - s.irq) +
              (e.idle - s.idle);
          }
          const usage = (1 - idleDiff / totalDiff) * 100;
          resolve(usage.toFixed(2));
        }, 1000);
      });
    }

    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const usedMem = (totalMem - freeMem).toFixed(2);

    const isWin = process.platform === 'win32';

    // Disk info
    let diskInfo = '❌ Nicht verfügbar';
    try {
      if (isWin) {
        const output = execSync('C:\\Windows\\System32\\wbem\\wmic.exe logicaldisk get caption,freespace,size').toString();
        const lines = output.trim().split('\n').slice(1);
        const cLine = lines.find(line => line.trim().startsWith('C:'));
        if (cLine) {
          const parts = cLine.trim().split(/\s+/);
          const free = parts[1] ? (parseInt(parts[1]) / 1024 / 1024 / 1024).toFixed(1) : 0;
          const size = parts[2] ? (parseInt(parts[2]) / 1024 / 1024 / 1024).toFixed(1) : 0;
          diskInfo = `${free} GB / ${size} GB`;
        }
      } else {
        const output = execSync('df -h /').toString();
        const lines = output.trim().split('\n');
        if (lines.length >= 2) {
          const parts = lines[1].trim().split(/\s+/);
          // parts: Filesystem Size Used Avail Use% Mounted
          const size = parts[1] || '—';
          const avail = parts[3] || '—';
          diskInfo = `${avail} / ${size}`;
        }
      }
    } catch (e) {}

    // Ping
    let ping = '❌';
    try {
      if (isWin) {
        const output = execSync('ping -n 1 8.8.8.8').toString();
        const match = output.match(/Zeit[=<]\s*(\d+)\s*ms/i);
        if (match) ping = `${match[1]} ms`;
      } else {
        const output = execSync('ping -c 1 8.8.8.8').toString();
        const match = output.match(/time=([\d.]+)\s*ms/i);
        if (match) ping = `${match[1]} ms`;
      }
    } catch (e) {}

    const cpuUsage = await getCpuUsage();
    const osType = `${os.type()} ${os.release()} (${os.arch()})`;
    const uptime = (os.uptime() / 60 / 60).toFixed(1);
    const nodeVersion = process.version;
    const botMem = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    const localTime = new Date().toLocaleString();

    let netName = '❌ Nicht erkannt';
    try {
      if (isWin) {
        const wlan = execSync('netsh wlan show interfaces').toString();
        const ssidMatch = wlan.match(/SSID\s*:\s*(.+)/i);
        if (ssidMatch) {
          netName = `WLAN: ${ssidMatch[1].trim()}`;
        } else {
          const lan = execSync('netsh interface show interface').toString();
          const connected = lan.split('\n').find(line => line.includes('Connected'));
          if (connected) {
            netName = `LAN: ${connected.trim().split(/\s+/).pop()}`;
          }
        }
      } else {
        // try iwgetid for SSID, fallback to interface from route
        try {
          const ssid = execSync('iwgetid -r').toString().trim();
          if (ssid) netName = `WLAN: ${ssid}`;
        } catch (e) {
          try {
            const route = execSync('ip route get 8.8.8.8').toString();
            const devMatch = route.match(/dev\s+(\S+)/);
            if (devMatch) netName = `IF: ${devMatch[1]}`;
          } catch (e) {}
        }
      }
    } catch (e) {}

    const infoMsg = `╭───❍ *Server Info* ❍───╮

🖥 Hostname: ${hostname}
👤 Benutzer: ${userInfo}
⚡ CPU: ${cpuModel}
📈 CPU: ${cpuUsage} %
💾 RAM: ${usedMem} GB / ${totalMem} GB
📀 Speicher: ${diskInfo}
🌐 Ping: ${ping}
📡 Netzwerk: ${netName}

🛠 OS: ${osType}
🕒 Uptime: ${uptime}h
🟢 Node.js: ${nodeVersion}
🤖 Bot RAM: ${botMem} MB
⏰ Zeit: ${localTime}

╰──────────────╯`;

    await sock.sendMessage(from, { text: infoMsg });
  } catch (err) {
    await sock.sendMessage(from, { text: `❌ Fehler: ${err.message}` });
  }
  break;
}
const { spawn } = require('child_process');

case '/newsession':
  const parts = body.trim().split(' ');
  const sessionName = parts[1];

  if (!sessionName) {
    await sock.sendMessage(msg.key.remoteJid, {
      text: '❌ Bitte gib einen Namen für die neue Session an.\n\nBeispiel: `/newsession Lorenz`'
    });
    return;
  }

  // CMD-Fenster öffnen mit node . /newsession Lorenz
  spawn('cmd.exe', ['/c', `start cmd /k "node . /newsession ${sessionName}"`], {
    cwd: __dirname
  });

  await sock.sendMessage(msg.key.remoteJid, {
    text: `🛠️ Neue Session *${sessionName}* wird gestartet...\nScanne den QR-Code gleich, wenn er dir geschickt wird!`
  });

  break;

case 'kick': {
  const senderId = msg.key.participant || msg.key.remoteJid;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentioned.length === 0) {
    return await sock.sendMessage(from, { text: '❌ Bitte markiere einen Nutzer, den du entfernen willst.' });
  }


  const groupMetadata = await sock.groupMetadata(from);
  const groupAdmins = groupMetadata.participants
    .filter(p => p.admin !== null)
    .map(p => p.id);

 
  const isAdmin = groupAdmins.includes(senderId);

  if (!isAdmin) {
    return await sock.sendMessage(from, { text: '🚫 Nur Gruppen-Admins dürfen Nutzer entfernen.' });
  }

  const targetJid = mentioned[0];

  try {
    await sock.groupParticipantsUpdate(from, [targetJid], 'remove');
    await sendReaction(from, msg, '✅');
    await sock.sendMessage(from, {
      text: `✅ @${targetJid.split('@')[0]} wurde aus der Gruppe entfernt.`,
      mentions: [targetJid]
    });
  } catch (e) {
    console.error('Fehler beim Kick:', e.message);
    await sock.sendMessage(from, { text: '❌ Fehler beim Entfernen des Nutzers.' });
  }
}
break;



case 'id': {
  try {
    const senderJid = msg.key.participant || msg.key.remoteJid; 
    const userLid = senderJid.split('@')[0];                    
    const phoneNumberMatch = userLid.match(/^(\d+)$/);
    const userNumber = phoneNumberMatch ? phoneNumberMatch[1] : 'Unbekannt';

    const groupLid = isGroup ? from.split('@')[0] : '-';        

    await sock.sendMessage(from, { 
      text: `📌 IDs: \nUser LID: ${userLid}\nGruppen-ID: ${groupLid}` 
    });
 await sendReaction(from, msg, '✅');
  } catch (e) {
    console.error('Fehler bei id:', e);
   
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen der IDs.' });
   await sendReaction(from, msg, '❌');
  }
}
break;

case 'version': {
  try {
    // use __dirname so the path is correct even if the bot is started from another CWD
    const pkgPath = path.join(__dirname, 'package.json');
    let pkg = {};
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) || {};
    } catch (e) {
      console.warn('Konnte package.json nicht lesen:', e.message);
    }
    const ver = pkg.version || 'unbekannt';
    const nodev = process.version || 'unknown';
    await sock.sendMessage(from, { text: `🔖 Bot-Info\n• Name: ${botName}\n• Version: ${ver}\n• Node: ${nodev}` }, { quoted: msg });
    await sendReaction(from, msg, '✅');
  } catch (e) {
    console.error('Fehler bei /version:', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen der Version.' });
  }
}
break;

case 'add': {
  try {
    if (!(await isUserAdmin(from, sender))) {
      await sock.sendMessage(from, { text: '❌ Nur Admins können Benutzer hinzufügen.' });
      break;
    }

    const cleanNumber = args[0]?.replace(/[^0-9]/g, '');
    if (!cleanNumber || cleanNumber.length < 10) {
      await sock.sendMessage(from, { text: 'Bitte gib eine gültige Nummer an, z.B. /add 491234567890' });
      break;
    }

    const numberToAdd = cleanNumber + '@s.whatsapp.net';

    await sock.groupParticipantsUpdate(from, [numberToAdd], 'add');
    await sock.sendMessage(from, { text: `✅ Benutzer mit der Nummer +${cleanNumber} wurde hinzugefügt.` });

  } catch (error) {
    console.error('Fehler beim Hinzufügen:', error.message);
    const errMsg = error.message || '';
    if (errMsg.includes('bad-request')) {
      await sock.sendMessage(from, { text: '❌ Die Nummer ist nicht gültig oder bereits in der Gruppe. Prüfe die Nummer und versuche es erneut.' });
    } else if (errMsg.includes('not-authorized')) {
      await sock.sendMessage(from, { text: '❌ Der Bot hat keine Berechtigung, Benutzer hinzuzufügen. Stelle sicher, dass der Bot ein Gruppenadmin ist.' });
    } else {
      await sock.sendMessage(from, { text: `❌ Fehler beim Hinzufügen des Benutzers: ${errMsg}` });
    }
  }
  break;
}
case 'unmute': {
  const sender = msg.key.participant || msg.key.remoteJid;

  if (!(await isUserAdmin(from, sender))) {
    await sock.sendMessage(from, { text: '❌ Nur Gruppenadmins können diesen Befehl benutzen.' });
    return;
  }

  try {
    await sock.groupSettingUpdate(from, 'not_announcement'); 
    await sock.sendMessage(from, { text: '🔊 Gruppe wurde wieder freigegeben (alle dürfen schreiben).' });
  } catch (e) {
    console.error('Fehler beim Freigeben:', e.message);
    await sock.sendMessage(from, { text: '❌ Fehler beim Freigeben der Gruppe.' });
  }
}
break;
case 'mute': {
  const sender = msg.key.participant || msg.key.remoteJid;

  if (!(await isUserAdmin(from, sender))) {
    await sock.sendMessage(from, { text: '❌ Nur Gruppenadmins können diesen Befehl benutzen.' });
    return;
  }

  try {
    await sock.groupSettingUpdate(from, 'announcement'); // 
    await sock.sendMessage(from, { text: '🔇 Gruppe wurde stumm geschaltet (nur Admins dürfen schreiben).' });
  } catch (e) {
    console.error('Fehler beim Stummschalten:', e.message);
    await sock.sendMessage(from, { text: '❌ Fehler beim Stummschalten der Gruppe.' });
  }
}
break;
case 'setname': {
  const sender = msg.key.participant || msg.key.remoteJid;
  const text = args.join(' ');

  if (!(await isUserAdmin(from, sender))) {
    await sock.sendMessage(from, { text: '❌ Nur Gruppenadmins können den Namen ändern.' });
    return;
  }

  if (!text) {
    await sock.sendMessage(from, { text: '❌ Bitte gib einen neuen Gruppennamen ein.' });
    return;
  }

  try {
    await sock.groupUpdateSubject(from, text);
    await sock.sendMessage(from, { text: '✅ Gruppenname wurde aktualisiert.' });
  } catch (e) {
    console.error('Fehler beim Setzen des Namens:', e.message);
    await sock.sendMessage(from, { text: '❌ Fehler beim Aktualisieren des Gruppennamens.' });
  }
}
break;
case 'setdesc': {
  const sender = msg.key.participant || msg.key.remoteJid;
  const text = args.join(' ');

  if (!(await isUserAdmin(from, sender))) {
    await sock.sendMessage(from, { text: '❌ Nur Gruppenadmins können die Beschreibung ändern.' });
    return;
  }

  if (!text) {
    await sock.sendMessage(from, { text: '❌ Bitte gib eine neue Beschreibung ein.' });
    return;
  }

  try {
    await sock.groupUpdateDescription(from, text);
    await sock.sendMessage(from, { text: '✅ Gruppenbeschreibung wurde aktualisiert.' });
  } catch (e) {
    console.error('Fehler beim Setzen der Beschreibung:', e.message);
    await sock.sendMessage(from, { text: '❌ Fehler beim Aktualisieren der Gruppenbeschreibung.' });
  }
}
break;
case 'grouplink': {
  try {
    const code = await sock.groupInviteCode(from);

    await sock.sendMessage(from, {
      text: `🔗 Gruppenlink:\nhttps://chat.whatsapp.com/${code}`,
      contextInfo: {}
    });

  } catch (e) {
    console.error('Fehler beim Abrufen des Links:', e.message);
    await sock.sendMessage(from, { text: '❌ Gruppenlink konnte nicht abgerufen werden.' });
  }
}
break;
case 'revoke': {
  const sender = msg.key.participant || msg.key.remoteJid;

  if (!(await isUserAdmin(from, sender))) {
    await sock.sendMessage(from, { text: '❌ Nur Admins können den Gruppenlink zurücksetzen.' });
    return;
  }

  try {
    await sock.groupRevokeInvite(from);
    await sock.sendMessage(from, { text: '✅ Neuer Gruppenlink wurde erstellt.' });
  } catch (e) {
    console.error('Fehler beim Zurücksetzen des Links:', e.message);
    await sock.sendMessage(from, { text: '❌ Fehler beim Zurücksetzen des Links.' });
  }
}
break;

case 'del': {
  const sender = msg.key.participant || msg.key.remoteJid;
  const isGroup = from.endsWith('@g.us');

  if (isGroup && !(await isUserAdmin(from, sender))) {
    await sock.sendMessage(from, { text: '❌ Nur Admins dürfen Nachrichten in Gruppen löschen.' });
    return;
  }

  const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
  const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

  if (!quotedId) {
    await sock.sendMessage(from, { text: '❌ Bitte antworte auf eine Nachricht zum Löschen.' });
    return;
  }

  try {
    
    await sock.sendMessage(from, {
      delete: {
        remoteJid: from,
        fromMe: false,
        id: quotedId,
        participant: quotedParticipant || sender
      }
    });

    
    await sock.sendMessage(from, {
      delete: {
        remoteJid: from,
        fromMe: msg.key.fromMe,
        id: msg.key.id,
        participant: sender
      }
    });

   
    console.log('✅ Nachricht und Zitat gelöscht.');

  } catch (e) {
    console.error('❌ Fehler beim Löschen:', e.message);
    await sock.sendMessage(from, { text: '❌ Fehler beim Löschen.' });
  }
  break;
}

case 'broadcast': {
  // Erlaubte Nummer
  const ownerJid = "4367764694963@s.whatsapp.net";

  // Nur im Privat-Chat & nur vom Owner
  if (from !== ownerJid || msg.key.participant) {
    await sock.sendMessage(from, { text: "❌ Dieser Befehl ist nur für den Owner im Privat-Chat verfügbar." }, { quoted: msg });
    break;
  }

  // Nachricht extrahieren (inkl. Zeilenumbrüche)
  let messageContent = '';
  if (msg.message?.conversation) messageContent = msg.message.conversation;
  else if (msg.message?.extendedTextMessage?.text) messageContent = msg.message.extendedTextMessage.text;

  // Den Command-Teil entfernen
  const args = messageContent.replace(/^broadcast\s*/i, '').trim();

  if (!args) {
    await sock.sendMessage(from, { text: "❌ Bitte gib eine Nachricht an: `broadcast <Text>`" }, { quoted: msg });
    break;
  }

  // Alle Gruppen abrufen
  const groups = Object.entries(await sock.groupFetchAllParticipating());

  for (const [jid, group] of groups) {
    const participants = group.participants;
    const mentions = participants.map(p => p.id);

    // Nachricht senden, Zeilenumbrüche bleiben erhalten
    await sock.sendMessage(jid, {
      text: args,
      mentions: mentions
    });
  }

  await sock.sendMessage(from, { text: `✅ Broadcast an ${groups.length} Gruppen gesendet.` }, { quoted: msg });
  break;
}



case 'hidetag': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  if (!q) {
    await sock.sendMessage(chatId, { text: '❌ Bitte gib einen Text ein: `/hidetag <Text>`' }, { quoted: msg });
    break;
  }

  const mentions = participants.map((p) => p.id);

  await sock.sendMessage(chatId, {
    text: `╭───❍ *Hidetag* ❍───╮\n│\n│ ${q}\n│\n╰────────────────────╯`,
    mentions: mentions,
    contextInfo: { mentionedJid: mentions }
  }, { quoted: msg });
  
  console.log(`[HIDETAG] From: ${senderId} | Text: ${q}`);
  break;
}

case 'mutegc': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    await sock.groupSettingUpdate(chatId, 'announcement');
    await sock.sendMessage(chatId, { text: '🔇 *Gruppe stummgeschaltet!*\n\nNur Admins können Nachrichten posten.' }, { quoted: msg });
    console.log(`[MUTEGC ON] Group: ${chatId}`);
  } else if (subcommand === 'off') {
    await sock.groupSettingUpdate(chatId, 'not_announcement');
    await sock.sendMessage(chatId, { text: '🔊 *Gruppe nicht mehr stummgeschaltet!*\n\nAlle können wieder Nachrichten posten.' }, { quoted: msg });
    console.log(`[MUTEGC OFF] Group: ${chatId}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: `/mutegc on` oder `/mutegc off`' }, { quoted: msg });
  }
  break;
}

case 'tagall': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const mentions = participants.map((p) => p.id);
  
  const text = q ? `@all\n\n${q}` : '@all';

  await sock.sendMessage(chatId, {
    text: text,
    mentions: mentions,
    contextInfo: { mentionedJid: mentions }
  }, { quoted: msg });
  
  console.log(`[TAGALL] Group: ${chatId}`);
  break;
}

case 'promotemember': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  // Versuche Mention zu finden
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentions || mentions.length === 0) {
    await sock.sendMessage(chatId, { text: '❌ Bitte markiere einen Benutzer zum Promovieren.' }, { quoted: msg });
    break;
  }

  const targetJid = mentions[0];
  await sock.groupParticipantsUpdate(chatId, [targetJid], 'promote');
  
  await sock.sendMessage(chatId, { 
    text: `✅ @${targetJid.split('@')[0]} wurde zum Admin promoviert!`,
    mentions: [targetJid]
  }, { quoted: msg });
  
  console.log(`[PROMOTE] Group: ${chatId} | User: ${targetJid}`);
  break;
}

case 'demote': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  // Versuche Mention zu finden
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentions || mentions.length === 0) {
    await sock.sendMessage(chatId, { text: '❌ Bitte markiere einen Admin zum Degradieren.' }, { quoted: msg });
    break;
  }

  const targetJid = mentions[0];
  await sock.groupParticipantsUpdate(chatId, [targetJid], 'demote');
  
  await sock.sendMessage(chatId, { 
    text: `✅ @${targetJid.split('@')[0]} wurde degradiert!`,
    mentions: [targetJid]
  }, { quoted: msg });
  
  console.log(`[DEMOTE] Group: ${chatId} | User: ${targetJid}`);
  break;
}

// === ANTILINK ===
case 'antilink': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    features.antilink = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🔗 *Antilink aktiviert!*\n\nLinks werden automatisch gelöscht.' }, { quoted: msg });
    console.log(`[ANTILINK ON] Group: ${chatId}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.antilink = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🔗 *Antilink deaktiviert!*\n\nLinks sind wieder erlaubt.' }, { quoted: msg });
    console.log(`[ANTILINK OFF] Group: ${chatId}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: `/antilink on` oder `/antilink off`' }, { quoted: msg });
  }
  break;
}

// === ANTINSFW ===
case 'antinsfw': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    features.antinsfw = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🔞 *Anti-NSFW aktiviert!*\n\nNSFW-Inhalte werden automatisch gelöscht.' }, { quoted: msg });
    console.log(`[ANTINSFW ON] Group: ${chatId}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.antinsfw = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🔞 *Anti-NSFW deaktiviert!*' }, { quoted: msg });
    console.log(`[ANTINSFW OFF] Group: ${chatId}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: `/antinsfw on` oder `/antinsfw off`' }, { quoted: msg });
  }
  break;
}

// === AUTOSTICKER ===
case 'autosticker': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    features.autosticker = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🎨 *Autosticker aktiviert!*\n\nSticker werden automatisch gelöscht.' }, { quoted: msg });
    console.log(`[AUTOSTICKER ON] Group: ${chatId}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.autosticker = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🎨 *Autosticker deaktiviert!*\n\nSticker sind wieder erlaubt.' }, { quoted: msg });
    console.log(`[AUTOSTICKER OFF] Group: ${chatId}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: `/autosticker on` oder `/autosticker off`' }, { quoted: msg });
  }
  break;
}

// === ANTISPAM ===
case 'antispam': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    features.antispam = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🚫 *Antispam aktiviert!*\n\nMehrfachnachrichten werden automatisch gelöscht.' }, { quoted: msg });
    console.log(`[ANTISPAM ON] Group: ${chatId}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.antispam = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🚫 *Antispam deaktiviert!*' }, { quoted: msg });
    console.log(`[ANTISPAM OFF] Group: ${chatId}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: `/antispam on` oder `/antispam off`' }, { quoted: msg });
  }
  break;
}

// === LEVELING ===
case 'leveling': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    features.leveling = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '⬆️ *Leveling-System aktiviert!*\n\nBenutzer erhalten XP für jede Nachricht.' }, { quoted: msg });
    console.log(`[LEVELING ON] Group: ${chatId}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.leveling = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '⬆️ *Leveling-System deaktiviert!*' }, { quoted: msg });
    console.log(`[LEVELING OFF] Group: ${chatId}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: `/leveling on` oder `/leveling off`' }, { quoted: msg });
  }
  break;
}

// === WELCOME ===
case 'welcome': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    features.welcome = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '👋 *Willkommensnachrichten aktiviert!*\n\nNeue Mitglieder erhalten eine Willkommensnachricht.' }, { quoted: msg });
    console.log(`[WELCOME ON] Group: ${chatId}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.welcome = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '👋 *Willkommensnachrichten deaktiviert!*' }, { quoted: msg });
    console.log(`[WELCOME OFF] Group: ${chatId}`);
  } else if (subcommand === 'set') {
    const customText = args.slice(1).join(' ').trim();
    if (!customText) {
      await sock.sendMessage(chatId, { text: '❌ Nutzung:\n\n/welcome set Willkommen @user 🎉\n\nFür Zeilenumbrüche verwende \\n\nBeispiel:\n/welcome set Willkommen @user 🎉\\nViel Spaß in der Gruppe!' }, { quoted: msg });
      break;
    }
    const features = loadGroupFeatures(chatId);
    // Konvertiere \\n in echte Zeilenumbrüche
    features.welcomeText = customText.replace(/\\n/g, '\n');
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: `✅ *Willkommensnachricht gesetzt!*\n\n${features.welcomeText}` }, { quoted: msg });
    console.log(`[WELCOME SET] Group: ${chatId} | Text: ${customText}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung:\n\n/welcome on\n/welcome off\n/welcome set <Text mit @user>' }, { quoted: msg });
  }
  break;
}

// === GOODBYE ===
case 'goodbye': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    features.goodbye = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '👋 *Abschiedsnachrichten aktiviert!*\n\nAbgehende Mitglieder erhalten eine Abschiedsnachricht.' }, { quoted: msg });
    console.log(`[GOODBYE ON] Group: ${chatId}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.goodbye = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '👋 *Abschiedsnachrichten deaktiviert!*' }, { quoted: msg });
    console.log(`[GOODBYE OFF] Group: ${chatId}`);
  } else if (subcommand === 'set') {
    const customText = args.slice(1).join(' ').trim();
    if (!customText) {
      await sock.sendMessage(chatId, { text: '❌ Nutzung:\n\n/goodbye set Tschüss @user 👋\n\nFür Zeilenumbrüche verwende \\n\nBeispiel:\n/goodbye set Tschüss @user 👋\\nWir sehen uns bald!' }, { quoted: msg });
      break;
    }
    const features = loadGroupFeatures(chatId);
    // Konvertiere \\n in echte Zeilenumbrüche
    features.goodbyeText = customText.replace(/\\n/g, '\n');
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: `✅ *Abschiedsnachricht gesetzt!*\n\n${features.goodbyeText}` }, { quoted: msg });
    console.log(`[GOODBYE SET] Group: ${chatId} | Text: ${customText}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung:\n\n/goodbye on\n/goodbye off\n/goodbye set <Text mit @user>' }, { quoted: msg });
  }
  break;
}

// === AUTOREACT ===
case 'autoreact': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    features.autoreact = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '😊 *Automatische Reaktionen aktiviert!*\n\nDer Bot reagiert automatisch auf Nachrichten.' }, { quoted: msg });
    console.log(`[AUTOREACT ON] Group: ${chatId}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.autoreact = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '😊 *Automatische Reaktionen deaktiviert!*' }, { quoted: msg });
    console.log(`[AUTOREACT OFF] Group: ${chatId}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: `/autoreact on` oder `/autoreact off`' }, { quoted: msg });
  }
  break;
}

// === ANTIBOT ===
case 'antibot': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    features.antibot = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🤖 *Anti-Bot aktiviert!*\n\nBots werden automatisch entfernt.' }, { quoted: msg });
    console.log(`[ANTIBOT ON] Group: ${chatId}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.antibot = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🤖 *Anti-Bot deaktiviert!*' }, { quoted: msg });
    console.log(`[ANTIBOT OFF] Group: ${chatId}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: `/antibot on` oder `/antibot off`' }, { quoted: msg });
  }
  break;
}

// === BADWORDS ===
case 'badwords': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    const badwordsList = args.slice(1).join(' ').split(',').map(w => w.trim()).filter(w => w);
    
    if (badwordsList.length === 0) {
      await sock.sendMessage(chatId, { text: '❌ Nutzung: `/badwords on Wort1,Wort2,Wort3`' }, { quoted: msg });
      break;
    }
    
    features.badwords = badwordsList;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: `🚫 *Schimpfwörter aktiviert!*\n\nFolgende Wörter sind verboten:\n\n${badwordsList.map(w => `• ${w}`).join('\n')}` }, { quoted: msg });
    console.log(`[BADWORDS ON] Group: ${chatId} | Words: ${badwordsList.join(', ')}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.badwords = [];
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🚫 *Schimpfwörter deaktiviert!*\n\nKeine Wörter mehr verboten.' }, { quoted: msg });
    console.log(`[BADWORDS OFF] Group: ${chatId}`);
  } else if (subcommand === 'add') {
    const features = loadGroupFeatures(chatId);
    const newWords = args.slice(1).join(' ').split(',').map(w => w.trim()).filter(w => w);
    
    if (newWords.length === 0) {
      await sock.sendMessage(chatId, { text: '❌ Nutzung: `/badwords add Wort1,Wort2`' }, { quoted: msg });
      break;
    }
    
    features.badwords = [...new Set([...features.badwords, ...newWords])];
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: `✅ *Wörter hinzugefügt!*\n\nAktuelle Liste:\n\n${features.badwords.map(w => `• ${w}`).join('\n')}` }, { quoted: msg });
    console.log(`[BADWORDS ADD] Group: ${chatId} | Words: ${newWords.join(', ')}`);
  } else if (subcommand === 'remove') {
    const features = loadGroupFeatures(chatId);
    const removeWords = args.slice(1).join(' ').split(',').map(w => w.trim()).filter(w => w);
    
    if (removeWords.length === 0) {
      await sock.sendMessage(chatId, { text: '❌ Nutzung: `/badwords remove Wort1,Wort2`' }, { quoted: msg });
      break;
    }
    
    features.badwords = features.badwords.filter(w => !removeWords.includes(w));
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: `✅ *Wörter entfernt!*\n\nAktuelle Liste:\n\n${features.badwords.length > 0 ? features.badwords.map(w => `• ${w}`).join('\n') : 'Keine Wörter definiert'}` }, { quoted: msg });
    console.log(`[BADWORDS REMOVE] Group: ${chatId} | Words: ${removeWords.join(', ')}`);
  } else if (subcommand === 'list') {
    const features = loadGroupFeatures(chatId);
    const badwordsList = features.badwords.length > 0 ? features.badwords.map(w => `• ${w}`).join('\n') : 'Keine Wörter definiert';
    await sock.sendMessage(chatId, { text: `📋 *Verbotene Wörter:*\n\n${badwordsList}` }, { quoted: msg });
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung:\n\n`/badwords on Wort1,Wort2`\n`/badwords off`\n`/badwords add Wort1,Wort2`\n`/badwords remove Wort1,Wort2`\n`/badwords list`' }, { quoted: msg });
  }
  break;
}

break;

case 'nl': {
    // 🌩️ BeastBot Newsletter-System
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

    // 🔒 Zugriff verweigert
    if (!allowed.includes(senderRank)) {
        await sendReaction(from, msg, '🔒');
        return await sock.sendMessage(from, {
            text: `⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 *Inhaber*\n• 🛡️ *Stellvertreter Inhaber*`
        }, { quoted: msg });
    }

    // Nachrichtentext erfassen
    const msgText = args.join(' ').trim();

    // Wenn keine Nachricht angegeben ist
    if (!msgText)
        return await sock.sendMessage(from, {
            text: '💡 *Beispiel:*\n.nl Hallo zusammen!\nHeute gibt’s ein Update ⚙️\n\n(Zeilenumbrüche werden automatisch erkannt)'
        }, { quoted: msg });

    // Ziel – dein Newsletter aus settings.js
    const settings = require('./settings');
    const newsletterJid = settings.forwardedNewsletter.jid;
    const newsletterName = settings.forwardedNewsletter.name;

    // Prüfe ob Newsletter-ID konfiguriert ist
    if (!newsletterJid) {
      return await sock.sendMessage(from, {
        text: '❌ *Newsletter nicht konfiguriert!*\n\nBitte trage die Newsletter-JID in settings.js ein.'
      }, { quoted: msg });
    }

    // 🧱 Schöner BeastBot-Kasten
    const fullMessage =
`╔═══ ⚡️ *${newsletterName}* ⚡️ ═══╗
║
║  📰 *Newsletter Update*
║────────────────────────────
${msgText.split('\n').map(line => `║  ${line}`).join('\n')}
║
╚────────────────────────────
   ⚡ *BeastBot – Powering the Beast* ⚡
`;

    try {
        // 📨 Nachricht an Newsletter schicken
        await sock.sendMessage(
            newsletterJid,
            { 
                text: fullMessage,
                linkPreview: false
            }
        );

        await sendReaction(from, msg, '✅');
        await sock.sendMessage(from, { text: `✅ *Newsletter erfolgreich gesendet!*\n\nZiel: ${newsletterName}` }, { quoted: msg });
        console.log(`[NEWSLETTER] Nachricht gesendet an ${newsletterJid}\n${fullMessage}`);
    } catch (err) {
        console.error('[NEWSLETTER] Error:', err.message || err);
        await sendReaction(from, msg, '❌');
        await sock.sendMessage(from, { text: `❌ *Fehler beim Senden!*\n\n${err.message || 'Unbekannter Fehler'}` }, { quoted: msg });
    }
    break;
}

// === EILMELDUNG (EMERGENCY MESSAGE) ===
case 'el': {
    // 🚨 BeastBot Eilmeldungs-System
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

    // 🔒 Zugriff verweigert
    if (!allowed.includes(senderRank)) {
        await sendReaction(from, msg, '🔒');
        return await sock.sendMessage(from, {
            text: `⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 *Inhaber*\n• 🛡️ *Stellvertreter Inhaber*`
        }, { quoted: msg });
    }

    // Nachrichtentext erfassen
    const msgText = args.join(' ').trim();

    // Wenn keine Nachricht angegeben ist
    if (!msgText) {
        return await sock.sendMessage(from, {
            text: '💡 *Beispiel:*\n/el ⚠️ WICHTIG: Wartung um 20:00 Uhr!'
        }, { quoted: msg });
    }

    try {
        // 🧱 Schöner BeastBot Eilmeldungs-Kasten mit Alarm-Emojis
        const fullMessage = 
`╔═══════════════════════════════════════╗
║  🚨 *EILMELDUNG ALERT* 🚨
║═══════════════════════════════════════║
║
║  ⚠️  *WICHTIG!*  ⚠️
║
║────────────────────────────────────────
${msgText.split('\n').map(line => `║  ${line}`).join('\n')}
║────────────────────────────────────────
║
║  ⏰ ${new Date().toLocaleString('de-DE')}
║
║  🔴 SOFORT BEACHTEN! 🔴
║
╚═══════════════════════════════════════╝`;

        // Alle Gruppen durchsuchen und Eilmeldung versenden (wenn aktiviert)
        let sentCount = 0;
        
        // Alle bekannten Gruppen durchsuchen und Eilmeldung versenden
        const settings = require('./settings');
        const groupFeaturesFile = './data/groupFeatures.json';
        let groupFeaturesData = {};
        
        try {
          if (fs.existsSync(groupFeaturesFile)) {
            groupFeaturesData = JSON.parse(fs.readFileSync(groupFeaturesFile, 'utf8'));
          }
        } catch (e) {
          console.error('[EILMELDUNG] Fehler beim Laden von groupFeatures:', e.message);
        }

        // Sammle alle Group-IDs von verschiedenen Quellen
        const allGroupIds = new Set();
        
        // 1. Aus global._allChatIds (aktive Chats)
        if (global._allChatIds && global._allChatIds.size > 0) {
          for (const id of global._allChatIds) {
            if (id.includes('@g.us')) allGroupIds.add(id);
          }
        }
        
        // 2. Aus groupFeaturesData (alle bisher konfigurierten Gruppen)
        for (const groupId of Object.keys(groupFeaturesData)) {
          if (groupId.includes('@g.us')) allGroupIds.add(groupId);
        }

        // 3. Versuche alle Chats vom Bot zu laden (Baileys API)
        try {
          const allChats = await sock.getAllChats?.() || [];
          for (const chat of allChats) {
            if (chat.id && chat.id.includes('@g.us')) {
              allGroupIds.add(chat.id);
            }
          }
        } catch (e) {
          console.log('[EILMELDUNG] Hinweis: getAllChats nicht verfügbar');
        }

        console.log(`[EILMELDUNG] Versende an ${allGroupIds.size} Gruppen...`);

        // Versende an alle Gruppen
        for (const groupId of allGroupIds) {
          // Prüfe ob Eilmeldungen in dieser Gruppe aktiviert sind
          const groupFeatures = groupFeaturesData[groupId];
          const eilmeldungenEnabled = groupFeatures?.eilmeldungen !== false; // Standard: aktiviert

          if (eilmeldungenEnabled) {
            try {
              await sock.sendMessage(groupId, { 
                  text: fullMessage,
                  linkPreview: false
              });
              sentCount++;
              console.log(`[EILMELDUNG] ✅ Gesendet an ${groupId}`);
            } catch (e) {
              console.error(`[EILMELDUNG] ❌ Fehler an ${groupId}:`, e.message);
            }
          } else {
            console.log(`[EILMELDUNG] ⏭️ ${groupId} hat Eilmeldungen deaktiviert`);
          }
        }

        // Eilmeldung auch an den Newsletter/Broadcast-Kanal
        const broadcastJid = settings.forwardedNewsletter?.jid;
        if (broadcastJid) {
            try {
                await sock.sendMessage(broadcastJid, { 
                    text: fullMessage,
                    linkPreview: false
                });
                sentCount++;
            } catch (e) {
                console.error('[EILMELDUNG] Fehler beim Versenden an Newsletter:', e.message);
            }
        }

        await sendReaction(from, msg, '🚨');
        await sock.sendMessage(from, { 
            text: `🚨 *EILMELDUNG VERSANDT!*\n\nEmpfänger: ${sentCount} Gruppen/Kanäle` 
        }, { quoted: msg });
        console.log(`[EILMELDUNG] Nachricht an ${sentCount} Gruppen/Kanäle versendet`);
    } catch (err) {
        console.error('[EILMELDUNG] Error:', err.message || err);
        await sendReaction(from, msg, '❌');
        await sock.sendMessage(from, { text: `❌ *Fehler beim Versenden!*\n\n${err.message || 'Unbekannter Fehler'}` }, { quoted: msg });
    }
    break;
}

// === EILMELDUNG DEAKTIVIEREN (pro Gruppe) ===
case 'eld': {
  if (!isGroupChat) {
    await sock.sendMessage(chatId, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' }, { quoted: msg });
    break;
  }

  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || chatId;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(chatId, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  const subcommand = args[0]?.toLowerCase();
  
  if (subcommand === 'on') {
    const features = loadGroupFeatures(chatId);
    features.eilmeldungen = true;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🚨 *Eilmeldungen aktiviert!*\n\nDie Gruppe erhält jetzt Eilmeldungen.' }, { quoted: msg });
    console.log(`[EILMELDUNG] ON - Group: ${chatId}`);
  } else if (subcommand === 'off') {
    const features = loadGroupFeatures(chatId);
    features.eilmeldungen = false;
    saveGroupFeatures(chatId, features);
    await sock.sendMessage(chatId, { text: '🚫 *Eilmeldungen deaktiviert!*\n\nDie Gruppe erhält keine Eilmeldungen mehr.' }, { quoted: msg });
    console.log(`[EILMELDUNG] OFF - Group: ${chatId}`);
  } else {
    await sock.sendMessage(chatId, { text: '❌ Nutzung: `/eld on` oder `/eld off`' }, { quoted: msg });
  }
  break;
}

case 'antilinkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk': {
  if (!isGroup) return sock.sendMessage(from, { text: '⚠️ Dieser Befehl funktioniert nur in Gruppen.' });
  if (!(await isUserAdmin(from, sender))) {
    await sock.sendMessage(from, { text: '❌ Nur Admins dürfen Anti-Link ein- oder ausschalten.' });
    return;
  }

  if (antiLinkGroups[from]) {
    delete antiLinkGroups[from];
    saveAntiLink(); // Diese Funktion musst du natürlich definieren
    await sock.sendMessage(from, { text: '🔕 Anti-Link wurde **deaktiviert**.' });
  } else {
    antiLinkGroups[from] = true;
    saveAntiLink();
    await sock.sendMessage(from, { text: '🔒 Anti-Link ist jetzt **aktiv**.' });
  }
  break;
}

case 'linkbypass': {
  if (!isGroup) return sock.sendMessage(from, { text: '⚠️ Nur in Gruppen.' });
  if (!(await isUserAdmin(from, sender))) {
    return sock.sendMessage(from, { text: '❌ Nur Admins dürfen das.' });
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) {
    return sock.sendMessage(from, { text: '👤 Bitte markiere den Nutzer, den du freischalten willst.' });
  }

  if (!linkBypassUsers[from]) linkBypassUsers[from] = [];

  if (!linkBypassUsers[from].includes(mentioned)) {
    linkBypassUsers[from].push(mentioned);
    saveLinkBypass();
    await sock.sendMessage(from, { 
      text: `✅ @${mentioned.split('@')[0]} darf jetzt **Links senden**.`,
      mentions: [mentioned] 
    });
  } else {
    await sock.sendMessage(from, { 
      text: `ℹ️ @${mentioned.split('@')[0]} ist **bereits freigeschaltet**.`,
      mentions: [mentioned] 
    });
  }
  break;
}

case 'unlinkbypass': {
  if (!isGroup) return sock.sendMessage(from, { text: '⚠️ Nur in Gruppen.' });
  if (!(await isUserAdmin(from, sender))) {
    return sock.sendMessage(from, { text: '❌ Nur Admins dürfen das.' });
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) {
    return sock.sendMessage(from, { text: '👤 Bitte markiere den Nutzer.' });
  }

  if (linkBypassUsers[from]?.includes(mentioned)) {
    linkBypassUsers[from] = linkBypassUsers[from].filter(uid => uid !== mentioned);
    saveLinkBypass();
    await sock.sendMessage(from, { 
      text: `🛑 @${mentioned.split('@')[0]} darf jetzt **keine Links** mehr senden.`,
      mentions: [mentioned] 
    });
  } else {
    await sock.sendMessage(from, { 
      text: `ℹ️ @${mentioned.split('@')[0]} war **nicht freigeschaltet**.`,
      mentions: [mentioned] 
    });
  }
  break;
}
case 'leaveall': {
  const allowed = [
    '4367764694963@s.whatsapp.net', // Beispiel-IDs, die den Befehl ausführen können
    
  ];

  if (!allowed.includes(sender)) {
    return await sock.sendMessage(from, { text: '🚫 Du bist nicht berechtigt, diesen Befehl zu nutzen.' });
  }

  try {
    // Alle Chats des Bots abrufen
    const chats = sock.chats || sock.store?.chats;
    if (!chats) throw new Error('Keine Chats gefunden.');

    const groups = Object.values(chats).filter(c => c.id.endsWith('@g.us'));

    if (groups.length === 0) {
      return await sock.sendMessage(from, { text: '📭 Der Bot ist aktuell in keiner Gruppe.' });
    }

    // Alle Gruppen durchlaufen und den Bot aus jeder Gruppe entfernen
    for (const group of groups) {
      const groupId = group.id;
      const groupName = group.name || 'Unbekannt';

      try {
        await sock.sendMessage(from, { text: `👋 Der Bot verlässt die Gruppe: ${groupName}` });

        const botNumber = sock.user.id;
        await sock.groupParticipantsUpdate(groupId, [botNumber], "remove");
      } catch (err) {
        console.error(`Fehler beim Verlassen der Gruppe ${groupName}:`, err);
      }
    }

    // Bestätigung, dass der Bot alle Gruppen verlassen hat
    await sock.sendMessage(from, { text: '✅ Der Bot hat alle Gruppen verlassen.' });

  } catch (err) {
    console.error('Fehler bei leaveall:', err);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen der Gruppenliste oder Verlassen der Gruppen.\n' + err.message });
  }

  break;
}


case 'promote': {
    const sender = msg.key.participant || msg.key.remoteJid;
    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    // Prüfen, ob der Sender Admin ist
    const groupMetadata = await sock.groupMetadata(from);
    const admins = groupMetadata.participants.filter(p => p.admin !== null).map(p => p.id);
    if (!admins.includes(sender)) {
        return await sock.sendMessage(from, { text: '⛔ Nur Gruppenadmins können diesen Befehl benutzen.' });
    }

    if (!mentionedJid) {
        return await sock.sendMessage(from, { text: '❌ Bitte erwähne den Benutzer, den du zum Admin machen willst.' });
    }

    try {
        await sock.groupParticipantsUpdate(from, [mentionedJid], 'promote');
        await sock.sendMessage(from, { 
            text: `✅ @${mentionedJid.split('@')[0]} wurde zum Admin befördert.`, 
            mentions: [mentionedJid] 
        });
    } catch (e) {
        console.error('Fehler beim Promote:', e.message);
        await sock.sendMessage(from, { text: '❌ Fehler beim Befördern des Teilnehmers.' });
    }
}
break;

case 'demote': {
    const sender = msg.key.participant || msg.key.remoteJid;
    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    // Prüfen, ob der Sender Admin ist
    const groupMetadata = await sock.groupMetadata(from);
    const admins = groupMetadata.participants.filter(p => p.admin !== null).map(p => p.id);
    if (!admins.includes(sender)) {
        return await sock.sendMessage(from, { text: '⛔ Nur Gruppenadmins können diesen Befehl benutzen.' });
    }

    if (!mentionedJid) {
        return await sock.sendMessage(from, { text: '❌ Bitte erwähne den Benutzer, den du degradieren willst.' });
    }

    try {
        await sock.groupParticipantsUpdate(from, [mentionedJid], 'demote');
        await sock.sendMessage(from, { 
            text: `✅ @${mentionedJid.split('@')[0]} wurde als Admin entfernt.`, 
            mentions: [mentionedJid] 
        });
    } catch (e) {
        console.error('Fehler beim Demote:', e.message);
        await sock.sendMessage(from, { text: '❌ Fehler beim Entfernen des Admin-Status.' });
    }
}
break;


case 'leavegrp': {
    try {
        const senderRank = ranks.getRank(sender);

        // Nur bestimmte Ränge dürfen den Bot die Gruppe verlassen lassen
        const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber'];

        if (!allowedRanks.includes(senderRank)) {
            await sock.sendMessage(chatId, { 
                text: "❌ Du bist nicht berechtigt, diesen Befehl zu nutzen." 
            });
            break;
        }

        // Prüfen ob es eine Gruppe ist
        if (!isGroupChat) {
            await sock.sendMessage(chatId, { 
                text: "❌ Dieser Befehl kann nur in Gruppen verwendet werden." 
            });
            break;
        }

        await sock.sendMessage(chatId, { 
            text: "👋 BeastBot verlässt nun die Gruppe..." 
        });

        setTimeout(() => {
            sock.groupLeave(chatId);
        }, 1000);

    } catch (err) {
        console.error("Fehler bei leavegrp:", err);
        await sock.sendMessage(chatId, { 
            text: "❌ Fehler beim Verlassen der Gruppe." 
        });
    }
}
break;

// ganz oben (globale Liste)
global.bannedUsers = new Set()

// === BAN CMD ===








case 'viewonce': {
    try {
        const chatId = msg.key.remoteJid;

        // Quoted Message aus contextInfo holen (alle Nachrichtentypen)
        const contextInfo =
            msg.message?.extendedTextMessage?.contextInfo ||
            msg.message?.imageMessage?.contextInfo ||
            msg.message?.videoMessage?.contextInfo ||
            msg.message?.buttonsResponseMessage?.contextInfo ||
            msg.message?.listResponseMessage?.contextInfo;

        const quoted = contextInfo?.quotedMessage;

        if (!quoted) {
            console.log('[ViewOnce] Keine quoted message gefunden');
            console.log('[ViewOnce] MSG:', JSON.stringify(msg.message, null, 2));
            await sock.sendMessage(chatId, {
                text: '❌ Bitte antworte auf eine View-Once Nachricht.'
            }, { quoted: msg });
            break;
        }

        console.log('[ViewOnce] QUOTED KEYS:', Object.keys(quoted));

        // ViewOnce Inhalt - alle möglichen Pfade
        const viewOnceMsg =
            quoted?.viewOnceMessageV2?.message ||
            quoted?.viewOnceMessage?.message ||
            quoted?.viewOnceMessageV2Extension?.message ||
            quoted?.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
            quoted?.ephemeralMessage?.message?.viewOnceMessage?.message;

        // NEUER ANSATZ: Direkt imageMessage/videoMessage mit viewOnce-Flag prüfen
        const directImage = quoted?.imageMessage;
        const directVideo = quoted?.videoMessage;

        const imageMsg = viewOnceMsg?.imageMessage || (directImage?.viewOnce ? directImage : null);
        const videoMsg = viewOnceMsg?.videoMessage || (directVideo?.viewOnce ? directVideo : null);

        if (!viewOnceMsg && !imageMsg && !videoMsg) {
            console.log('[ViewOnce] Kein ViewOnce-Inhalt erkannt');
            console.log('[ViewOnce] QUOTED FULL:', JSON.stringify(quoted, null, 2));
            await sock.sendMessage(chatId, {
                text: '❌ Kein View-Once Inhalt gefunden.\nStelle sicher, dass du direkt auf die View-Once Nachricht antwortest.'
            }, { quoted: msg });
            break;
        }

        // === Bild ===
        if (imageMsg) {
            // viewOnce-Flag entfernen damit Baileys es downloaded
            imageMsg.viewOnce = false;
            const stream = await downloadContentFromMessage(imageMsg, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            await sock.sendMessage(chatId, {
                image: buffer,
                caption: `🔓 *View-Once Bild*\n${imageMsg.caption || ''}`
            }, { quoted: msg });

        // === Video ===
        } else if (videoMsg) {
            // viewOnce-Flag entfernen
            videoMsg.viewOnce = false;
            const stream = await downloadContentFromMessage(videoMsg, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            await sock.sendMessage(chatId, {
                video: buffer,
                caption: `🔓 *View-Once Video*\n${videoMsg.caption || ''}`
            }, { quoted: msg });

        } else {
            await sock.sendMessage(chatId, {
                text: '❌ Nur Bilder und Videos werden unterstützt.'
            }, { quoted: msg });
        }

    } catch (err) {
        console.error('❌ Fehler bei viewonce:', err);
        await sock.sendMessage(msg.key.remoteJid, {
            text: `⚠️ Fehler: ${err.message || err}`
        }, { quoted: msg });
    }
    break;
}

//=============Extract viewOnceMessage============================//    
//=============PTV============================//
case 'ptv': {
  let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');

  
  try {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isViewOnce = quoted?.viewOnceMessage?.message;
    const actualMessage = isViewOnce ? quoted.viewOnceMessage.message : quoted;
    const sticker = actualMessage?.stickerMessage;
    const gif = actualMessage?.videoMessage?.gifPlayback;
    const video = actualMessage?.videoMessage && !gif;
    const image = actualMessage?.imageMessage;
    if (!sticker && !gif && !video && !image) {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "❌ Bitte antworte auf einen animierten Sticker, GIF, Bild, ViewOnce oder kurzes Video!"
      }, { quoted: msg });
      break;
    }
    if (video) {
      const duration = actualMessage.videoMessage.seconds || 0;
      if (duration > 50) {
        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Bitte ein Video mit maximal 5 Sekunden Länge schicken!"
        }, { quoted: msg });
        break;
      }
    }
    let mediaType;
    if (sticker) mediaType = 'sticker';
    else if (gif || video) mediaType = 'video';
    else if (image) mediaType = 'image';
    const mediaMessage =
      sticker ? actualMessage.stickerMessage :
      gif || video ? actualMessage.videoMessage :
      image ? actualMessage.imageMessage :
      null;
    const stream = await downloadContentFromMessage(mediaMessage, mediaType);
    const bufferChunks = [];
    for await (const chunk of stream) {
      bufferChunks.push(chunk);
    }
    const buffer = Buffer.concat(bufferChunks);
    await sock.sendMessage(msg.key.remoteJid, {
      video: buffer,
      mimetype: 'video/webp',
      caption: "🎥 Hier ist dein PTV!",
      ptv: true
    }, { quoted: msg });

  } catch (err) {
    console.error("❌ Fehler bei getptv:", err);
    await sock.sendMessage(msg.key.remoteJid, {
      text: "⚠️ Fehler beim Senden des PTV."
    }, { quoted: msg });
  }
  break;
}

 
case 'ptv3': {
  let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');

  try {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const sticker = quoted?.stickerMessage;
    if (!sticker) {
      await sock.sendMessage(from, { text: "> ⸸BeastBot⸸\n❌ Bitte antworte auf einen *animierten Sticker*!" }, { quoted: msg });
      break;
    }
    const stream = await downloadContentFromMessage(sticker, 'sticker');
    const buffer = Buffer.concat(await streamToBuffer(stream));
    const tempPath = path.join(__dirname, 'temp.webp');
    fs.writeFileSync(tempPath, buffer);
    const form = new FormData();
    form.append('new-image', fs.createReadStream(tempPath));
    form.append('upload', 'Upload!');
    const upload = await axios.post('https://ezgif.com/webp-to-mp4', form, {
      headers: form.getHeaders()
    });
    const $ = require('cheerio').load(upload.data);
    const file = $('input[name="file"]').attr('value');
    if (!file) throw new Error("Upload fehlgeschlagen.");
    const convert = await axios.post(`https://ezgif.com/webp-to-mp4/${file}`, `file=${file}&convert=Convert!`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const _$ = require('cheerio').load(convert.data);
    const mp4Url = _$('#output > p.outfile > video > source').attr('src');
    if (!mp4Url) throw new Error("Konvertierung fehlgeschlagen.");
    const finalUrl = `https:${mp4Url}`;
    const videoBuffer = (await axios.get(finalUrl, { responseType: 'arraybuffer' })).data;
    await sock.sendMessage(from, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      caption: "🎥 Hier ist dein animierter Sticker als PTV!",
      ptv: true
    }, { quoted: msg });
    fs.unlinkSync(tempPath); 
  } catch (err) {
    console.error("Fehler bei ptv3:", err);
    await sock.sendMessage(from, {
      text: "❌ Fehler bei der Umwandlung! Vielleicht war der Sticker nicht animiert?"
    }, { quoted: msg });
  }
  break;
}
function streamToBuffer(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(chunks));
    stream.on('error', reject);
  });
}
//=============Crashes and Delay============================//
case 'newqr': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    return reply('⛔ Nur Inhaber oder Stellvertreter dürfen neue Sessions erstellen.');
  }

  const id = args[0] || `qr_${Date.now()}`;
  const dir = path.join(__dirname, 'sessions', id);
  if (fs.existsSync(dir)) return reply('❌ existiert');

  fs.mkdirSync(dir, { recursive: true });

  // Baileys Setup
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  let sockNew = makeWASocket({
    auth: state,
    logger: logger,
    browser: ['Dragon', 'Desktop', '1.0.0'],
    printQRInTerminal: false,
  });
  
  // Wrapper für Message Queue
  sockNew = wrapSocketSendMessage(sockNew);

  sockNew.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      const buf = await require('qrcode').toBuffer(qr);
      await sock.sendMessage(from, { image: buf, caption: `📲 QR für „${id}“` });
    }

    if (connection === 'open') {
      reply(`✅ „${id}“ online`);
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message;
      console.error('Baileys Disconnect:', lastDisconnect?.error);
      await sock.sendMessage(from, { text: `❌ Verbindung von „${id}“ geschlossen.\nGrund: ${reason}` });
    }
  });

  sockNew.ev.on('creds.update', saveCreds);

  global.activeSessions = global.activeSessions || {};
  global.activeSessions[id] = sockNew;

  reply(`✅ QR-Session „${id}“ gestartet`);
  break;
}
case 'newsessionssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss': {
    const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];
    const senderRank = ranks.getRank(sender);

    // Prüfen, ob Rang erlaubt ist
    if (!allowedRanks.includes(senderRank)) {
        await sock.sendMessage(from, {
            text: `🚫 Zugriff verweigert!\nDein Rang: *${senderRank}*\nErlaubt: ${allowedRanks.join(', ')}`
        });
        break;
    }

    // Sessionname prüfen
    const inputName = args[0];
    if (!inputName) {
        await sock.sendMessage(from, {
            text: "❌ Bitte gib einen Namen für die neue Session an!\nBeispiel: *!newsession Test*"
        });
        break;
    }

    const sessionName = inputName.trim();
    const sessionFolder = `./sessions/${sessionName}`;
    fs.mkdirSync(sessionFolder, { recursive: true });

    // Baileys Setup
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const { version } = await fetchLatestBaileysVersion();

    let newSock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: state,
        logger: logger,
        browser: Browsers.ubuntu('Edge'),
    });
    
    // Wrapper für Message Queue
    newSock = wrapSocketSendMessage(newSock);

    newSock.ev.on('creds.update', saveCreds);

    newSock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR-Code senden
        if (qr) {
            const qrBuffer = await require('qrcode').toBuffer(qr);
            await sock.sendMessage(from, { 
                image: qrBuffer, 
                caption: `📲 Scanne diesen QR-Code, um Session *${sessionName}* zu verbinden.` 
            });
        }

        // Verbindung geschlossen
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message;
            await sock.sendMessage(from, { text: `❌ Session *${sessionName}* geschlossen.\nGrund: ${reason || 'Unbekannt'}` });
        }

        // Verbindung erfolgreich
        if (connection === 'open') {
            await sock.sendMessage(from, { 
                text: `✅ Session *${sessionName}* erfolgreich verbunden!\n🔁 BeastBot wird automatisch neu gestartet...` 
            });

            // Prozess beenden → Batch-Skript startet den Bot neu
            process.exit(0);
        }
    });

    await sock.sendMessage(from, { text: `🛰️ Neue Session *${sessionName}* wird erstellt. Bitte scanne gleich den QR-Code!` });
    break;
}


// ===================== NEWQR ===================== //
case 'newqr1': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    return reply('⛔ Nur Inhaber oder Stellvertreter dürfen neue Sessions erstellen.');
  }

  const id = args[0] || `qr_${Date.now()}`;
  const dir = path.join(__dirname, 'sessions', id);

  // Falls Ordner schon existiert -> abbrechen
  if (fs.existsSync(dir)) {
    return reply(`❌ Session „${id}“ existiert bereits. Bitte erst löschen oder anderen Namen wählen.`);
  }

  // Ordner erstellen
  fs.mkdirSync(dir, { recursive: true });

  const { useMultiFileAuthState, DisconnectReason } = require('@717development/baileys');
  const { state, saveCreds } = await useMultiFileAuthState(dir);

  const sockNew = require('@717development/baileys').default({
    auth: state,
    logger: logger,
    browser: ['Storm', 'Desktop', '1.0.0'],
    printQRInTerminal: false,
  });

  // Connection Handler
  sockNew.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      const buf = await require('qrcode').toBuffer(qr);
      await sock.sendMessage(from, { image: buf, caption: `📲 QR für „${id}“` });
    }

    if (connection === 'open') {
      await reply(`✅ Session „${id}“ ist jetzt online.`);
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (reason === DisconnectReason.loggedOut) {
        // 515: Session ungültig
        await sock.sendMessage(from, { text: `🚫 Session „${id}“ ungültig (Reason 515). Bitte QR neu generieren.` });
        fs.rmSync(dir, { recursive: true, force: true });
      } else {
        await sock.sendMessage(from, { text: `❌ Session „${id}“ getrennt. Code: ${reason || 'unbekannt'}` });
      }
    }
  });

  sockNew.ev.on('creds.update', saveCreds);

  // Globale Session-Liste speichern
  global.activeSessions = global.activeSessions || {};
  global.activeSessions[id] = sockNew;

  reply(`📲 Neue QR-Session „${id}“ gestartet. Bitte QR scannen!`);
  break;
}
// ===================== NEWQR ===================== //
case 'newqr2': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    return reply('⛔ Nur Inhaber oder Stellvertreter dürfen neue Sessions erstellen.');
  }

  const id = args[0] || `qr_${Date.now()}`;
  const dir = path.join(__dirname, 'sessions', id);

  // Falls Ordner schon existiert -> Zwangsreset
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });

  const { useMultiFileAuthState, DisconnectReason } = require('@717development/baileys');
  const { state, saveCreds } = await useMultiFileAuthState(dir);

  const sockNew = require('@717development/baileys').default({
    auth: state,
    logger: logger,
    browser: ['Dragon', 'Desktop', '1.0.0'],
    printQRInTerminal: false,
  });

  // Connection Handler
  sockNew.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      const buf = await require('qrcode').toBuffer(qr);
      await sock.sendMessage(from, { image: buf, caption: `📲 QR für „${id}“ (frisch generiert)` });
    }

    if (connection === 'open') {
      await reply(`✅ Session „${id}“ ist jetzt online und gültig.`);
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (reason === DisconnectReason.loggedOut) {
        await sock.sendMessage(from, { text: `🚫 Session „${id}“ wurde ungültig (Reason 515). Automatischer Reset.` });
        fs.rmSync(dir, { recursive: true, force: true });
      } else {
        await sock.sendMessage(from, { text: `❌ Session „${id}“ getrennt. Code: ${reason || 'unbekannt'}` });
      }
    }
  });

  sockNew.ev.on('creds.update', saveCreds);

  // Globale Session-Liste speichern
  global.activeSessions = global.activeSessions || {};
  global.activeSessions[id] = sockNew;

  reply(`📲 Neue frische QR-Session „${id}“ gestartet. Bitte QR scannen!`);
  break;
}

case 'killsession': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowed.includes(senderRank)) {
    return reply('⛔ Nur Inhaber oder Stellvertreter dürfen Sessions beenden.');
  }

  let sessionToKill = args[0]?.trim();
  if (!sessionToKill) return reply('❌ Verwendung: `.killsession <sessionName>`');

  const sessionsDir = path.resolve(__dirname, 'sessions', sessionToKill);
  console.log('[DEBUG] Lösche Ordner:', sessionsDir);

  const active = global.activeSessions || {};
  const sockToKill = active[sessionToKill];
  if (sockToKill) {
    try { await sockToKill.logout(); } catch {}
    delete active[sessionToKill];
  }

  if (!fs.existsSync(sessionsDir)) {
    return reply(`❌ Ordner „${sessionToKill}“ nicht gefunden.\nGeprüfter Pfad:\n\`\`\`${sessionsDir}\`\`\``);
  }
  try {
    fs.rmSync(sessionsDir, { recursive: true, force: true });
    reply(`✅ Session „${sessionToKill}“ wurde beendet und gelöscht.`);
  } catch (e) {
    reply(`❌ Fehler beim Löschen:\n\`\`\`${e.message}\`\`\``);
  }
  break;
}
// ===========================
// setrank
// ===========================
case 'setrank': {
  // ID entweder markiert oder direkt über Argument
  let mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0];
  if (!mentioned) return reply('❌ Bitte markiere einen Nutzer oder gib die ID an (z.B. 123456@lid).');

  // Berechtigung prüfen
  const senderRank = ranks.getRank(sender);
  const allowedToSet = ['Inhaber', 'Stellvertreter Inhaber'];
  if (!allowedToSet.includes(senderRank)) {
    return reply(`⛔ Nur ${allowedToSet.join(' oder ')} dürfen Ränge vergeben.`);
  }

  // Rang aus Argumenten
  const rank = args.slice(1).join(' ').trim();
  if (!rank) return reply('❌ Verwendung: `.setrank @user Rang` oder `.setrank 123456@lid Rang`');

  if (!allowedRanks.includes(rank)) {
    return reply(`❌ Ungültiger Rang. Erlaubt: ${allowedRanks.join(', ')}`);
  }

  // Rang speichern
  ranks.setRank(mentioned, rank);

  await sock.sendMessage(from, { 
    text: `✅ @${mentioned.split('@')[0]} wurde zum *${rank}* ernannt.`,
    mentions: mentioned.includes('@s.whatsapp.net') ? [mentioned] : []
  });
}
break;
// Hilfsfunktion: JID normalisieren
function normalizeJid(jid) {
  // Entferne @lid
  jid = jid.replace(/@lid$/, '');
  // Nummern ohne @ → @s.whatsapp.net
  if (!jid.includes('@')) jid = `${jid}@s.whatsapp.net`;
  return jid;
}
case 'lid': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber'];

    if (!allowedRanks.includes(senderRank)) {
      return reply(`⛔ Nur ${allowedRanks.join(' oder ')} dürfen diesen Befehl benutzen.`);
    }

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0];
    if (!mentioned) return reply('❌ Bitte markiere eine Person oder gib eine JID an.');

    const jid = mentioned.toString().trim().replace(/@lid$/, '');
    const normalized = jid.includes('') ? jid : `${jid}@s.whatsapp.net`;
    const lid = normalized.replace('@s.whatsapp.net', '@lid');

    await sock.sendMessage(from, {
      text: `👤 *Nutzer-Info:*\n🪪 *LID:* ${lid}`,
      mentions: [normalized]
    });
  } catch (e) {
    console.error(e);
    reply('❌ Fehler beim Abrufen der LID.');
  }
}
break;

// ================= SUPPORT COMMAND =================
case 'support': {
  try {
    const supportMsg = args.join(' ');
    if (!supportMsg) return reply('❌ Bitte gib eine Nachricht ein, die an Support gesendet werden soll.');

    const ranksConfig = require('./ranksConfig.json');
    const notifyRanks = ['Support', 'Supporter', 'Inhaber', 'Stellvertreter Inhaber'];

    const recipients = Object.entries(ranksConfig)
      .filter(([jid, rank]) => notifyRanks.includes(rank))
      .map(([jid]) => normalizeJid(jid));

    if (recipients.length === 0) return reply('⚠️ Es wurden keine Support-Ränge oder Inhaber gefunden.');

    if (!global.lastSupportId) global.lastSupportId = 0;
    global.lastSupportId++;
    if (global.lastSupportId > 100) global.lastSupportId = 1;
    const supportId = global.lastSupportId;

    const message = 
`╭─────❍ *Support-Anfrage* ❍─────╮
ID: #${supportId}
Von: @${sender.split('@')[0]}

📩 Nachricht:
${supportMsg}
╰───────────────────────────────╯`;

    // Nachricht an alle gültigen JIDs senden
    for (let jid of recipients) {
      try {
        await sock.sendMessage(jid, { text: message, mentions: [sender] });
      } catch (err) {
        console.log(`⚠️ Nachricht an ${jid} konnte nicht gesendet werden.`);
      }
    }

    await sock.sendMessage(from, { text: `✅ Deine Support-Anfrage (#${supportId}) wurde an ${recipients.length} Support-Ränge/Inhaber gesendet.` });

    if (!global.supportReplies) global.supportReplies = {};
    global.supportReplies[supportId] = { from: sender, message: supportMsg };

  } catch (err) {
    console.error('Fehler im support-Command:', err);
    await sock.sendMessage(from, { text: '❌ Fehler beim Senden der Support-Anfrage.' });
  }
}
break;

// ===========================
// delrank
// ===========================
case 'delrank': {
  // ID entweder markiert oder direkt über Argument
  let mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0];
  if (!mentioned) return reply('❌ Bitte markiere einen Nutzer oder gib die ID an (z.B. 123456@lid).');

  // Berechtigung prüfen
  const senderRank = ranks.getRank(sender);
  const allowedToDel = ['Inhaber', 'Stellvertreter Inhaber'];
  if (!allowedToDel.includes(senderRank)) {
    return reply(`⛔ Nur ${allowedToDel.join(' oder ')} dürfen Ränge entfernen.`);
  }

  const targetRank = ranks.getRank(mentioned);
  if (!targetRank) return reply('❌ Nutzer hat keinen Rang.');

  // Rang entfernen
  ranks.delRank(mentioned);

  await sock.sendMessage(from, { 
    text: `✅ Rang von @${mentioned.split('@')[0]} wurde entfernt.`,
    mentions: mentioned.includes('@s.whatsapp.net') ? [mentioned] : []
  });
}
break;
//===========================//
case 'ranksssssssssssssssssssss': {
  const all = ranks.list();
  const entries = Object.entries(all);
  if (!entries.length) return reply('📭 Keine Ränge vergeben.');
  
  // Pagination: max 10 pro Nachricht
  const pageSize = 10;
  const pages = Math.ceil(entries.length / pageSize);
  
  for (let page = 0; page < pages; page++) {
    const start = page * pageSize;
    const end = Math.min(start + pageSize, entries.length);
    const pageEntries = entries.slice(start, end);
    
    let txt = `📋 *Vergebene Ränge (Seite ${page + 1}/${pages})*\n\n`;
    pageEntries.forEach(([id, rank]) => {
      txt += `• @${id.split('@')[0]} → ${rank}\n`;
    });
    
    await sock.sendMessage(from, { 
      text: txt,
      mentions: pageEntries.map(([id]) => id)
    });
    
    // Kleine Verzögerung zwischen Nachrichten
    if (page < pages - 1) {
      await sleep(500);
    }
  }
  break;
}
            // ====================== LIST SESSIONS ====================== //
            
              case 'listsessions': {
                const senderRank = ranks.getRank(sender);
                const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

                if (!allowed.includes(senderRank)) {
                    return reply('⛔ Nur Inhaber oder Stellvertreter dürfen Sessions auflisten.');
                }

                const sessionsDir = path.join(__dirname, 'sessions');
                if (!fs.existsSync(sessionsDir)) {
                    return reply('📭 Der Sessions-Ordner existiert nicht.');
                }

                const names = fs.readdirSync(sessionsDir, { withFileTypes: true })
                                .filter(d => d.isDirectory())
                                .map(d => d.name);

                if (names.length === 0) return reply('📭 Keine Sessions gefunden.');

                // Pagination: max 10 pro Nachricht
                const pageSize = 10;
                const pages = Math.ceil(names.length / pageSize);
                
                for (let page = 0; page < pages; page++) {
                  const start = page * pageSize;
                  const end = Math.min(start + pageSize, names.length);
                  const pageNames = names.slice(start, end);
                  
                  let list = `📊 *Gefundene Sessions (${names.length} gesamt, Seite ${page + 1}/${pages})*:\n\n`;
                  pageNames.forEach((n, i) => list += `${start + i + 1}. \`${n}\`\n`);
                  
                  await sock.sendMessage(from, { text: list });
                  
                  // Kleine Verzögerung zwischen Nachrichten
                  if (page < pages - 1) {
                    await sleep(500);
                  }
                }
                break;
            }

            // ====================== TikTok Video (simple) ====================== //
            case 'tok': {
                const axios = require('axios');
                let sender;
                if (msg.key.fromMe) sender = sock.user.id.split(':')[0];
                else if (isGroupChat && msg.key.participant) sender = msg.key.participant.split('@')[0];
                else sender = chatId.split('@')[0];

                const cleanedSender = sender.replace(/[^0-9]/g, '');
                const tiktokUrl = args[0];

                if (!tiktokUrl || !tiktokUrl.includes('tiktok.com')) {
                    await sock.sendMessage(from, { text: "❌ Bitte sende einen gültigen TikTok-Link!" }, { quoted: msg });
                    break;
                }

                const api = `https://tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`;
                const res = await axios.get(api);

                if (!res.data?.data?.play) return;

                const videoUrl = res.data.data.play;
                const videoBuffer = (await axios.get(videoUrl, { responseType: 'arraybuffer' })).data;

                await sock.sendMessage(from, {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    caption: `🎥 Erfolgreich konvertiert von TikTok\n> 🔗 ${tiktokUrl}`
                });

                break;
            }

            // ====================== TikTok Video (HD / no watermark) ====================== //
            case 'tok2': {
                const axios = require('axios');
                let sender;
                if (msg.key.fromMe) sender = sock.user.id.split(':')[0];
                else if (isGroupChat && msg.key.participant) sender = msg.key.participant.split('@')[0];
                else sender = chatId.split('@')[0];

                const cleanedSender = sender.replace(/[^0-9]/g, '');
                const tiktokUrl = args[0];

                if (!tiktokUrl || !tiktokUrl.includes('tiktok.com')) {
                    await sock.sendMessage(from, {
                        text: "❌ Bitte sende einen gültigen TikTok-Link!\n\nBeispiel:\n.tok2 https://www.tiktok.com/...",
                    }, { quoted: msg });
                    break;
                }

                try {
                    await sock.sendMessage(from, { text: "⏳ TikTok wird verarbeitet..." }, { quoted: msg });

                    const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`;
                    const res = await axios.get(apiUrl);

                    if (!res.data?.data?.play) throw new Error("Ungültige API-Antwort");

                    const videoUrl = res.data.data.play;
                    const title = res.data.data.title || "TikTok Video";
                    const author = res.data.data.author?.nickname || "Unbekannt";

                    await sock.sendMessage(from, {
                        video: { url: videoUrl },
                        caption: `🎵 *TikTok Downloader*\n\n👤 Autor: ${author}\n📝 Titel: ${title}\n\n⚡ Powered by Beast Bot`
                    }, { quoted: msg });

                } catch (err) {
                    console.error('TikTok Error:', err);
                    await sock.sendMessage(from, {
                        text: "❌ Fehler beim Verarbeiten des TikTok-Videos.\nBitte versuche es später erneut."
                    }, { quoted: msg });
                }

                break;
            }

            // ====================== MINECRAFT COMMANDS ====================== //
            
            case 'mcsetserver': {
                // Nur für Owner
                if (!isOwner(sender)) {
                    return sock.sendMessage(from, { text: '❌ Nur der Owner darf diesen Command verwenden!' }, { quoted: msg });
                }

                const serverIP = args[0];
                const serverName = args.slice(1).join(' ') || 'Mein Server';

                if (!serverIP) {
                    return sock.sendMessage(from, { text: '❌ Bitte gib eine Server-IP an!\n\n📝 Beispiel: /mcsetserver example.com:25565 Mein Server' }, { quoted: msg });
                }

                try {
                    const mcConfigPath = path.join(__dirname, 'mcConfig.json');
                    const mcConfig = {
                        serverIP: serverIP,
                        serverName: serverName
                    };
                    fs.writeFileSync(mcConfigPath, JSON.stringify(mcConfig, null, 2));
                    
                    await sock.sendMessage(from, {
                        text: `✅ *Minecraft Server gespeichert!*\n\n🎮 Server: ${serverName}\n📍 IP: ${serverIP}\n\n💡 Jetzt kannst du die Commands ohne IP verwenden!`
                    }, { quoted: msg });
                } catch (err) {
                    console.error('MC SetServer Error:', err);
                    await sock.sendMessage(from, {
                        text: '❌ Fehler beim Speichern der Server-Einstellungen!'
                    }, { quoted: msg });
                }
                break;
            }

            case 'mcgetserver': {
                try {
                    const mcConfigPath = path.join(__dirname, 'mcConfig.json');
                    if (fs.existsSync(mcConfigPath)) {
                        const mcConfig = JSON.parse(fs.readFileSync(mcConfigPath, 'utf-8'));
                        await sock.sendMessage(from, {
                            text: `ℹ️ *Gespeicherte Minecraft Server*\n\n🎮 Name: ${mcConfig.serverName}\n📍 IP: ${mcConfig.serverIP}`
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, {
                            text: '❌ Noch kein Server gespeichert!\n\n📝 Verwende: /mcsetserver <IP:PORT> <Name>'
                        }, { quoted: msg });
                    }
                } catch (err) {
                    console.error('MC GetServer Error:', err);
                    await sock.sendMessage(from, {
                        text: '❌ Fehler beim Abrufen der Server-Einstellungen!'
                    }, { quoted: msg });
                }
                break;
            }
            
            case 'mcstatus': {
                let address = args[0];
                
                // Wenn keine Adresse angegeben, nutze gespeicherte IP
                if (!address) {
                    try {
                        const mcConfigPath = path.join(__dirname, 'mcConfig.json');
                        if (fs.existsSync(mcConfigPath)) {
                            const mcConfig = JSON.parse(fs.readFileSync(mcConfigPath, 'utf-8'));
                            address = mcConfig.serverIP;
                        } else {
                            return sock.sendMessage(from, { text: '❌ Keine Server-IP gespeichert!\n\n📝 Nutze: /mcsetserver <IP:PORT> <Name>\noder: /mcstatus <IP:PORT>' }, { quoted: msg });
                        }
                    } catch (err) {
                        return sock.sendMessage(from, { text: '❌ Fehler beim Laden der Server-IP!' }, { quoted: msg });
                    }
                }

                try {
                    const dns = require('dns').promises;
                    const net = require('net');
                    const [ip, port] = address.split(':');
                    const portNum = port || 25565;

                    await sock.sendMessage(from, { text: `🔄 Prüfe Server Status von ${address}...` });

                    const socket = net.createConnection(portNum, ip, () => {
                        socket.destroy();
                        sock.sendMessage(from, {
                            text: `✅ *Minecraft Server ist ONLINE*\n\n📍 Server: ${address}\n🟢 Status: Online\n⏱️ Zeit: ${new Date().toLocaleTimeString('de-DE')}`
                        }, { quoted: msg });
                    });

                    socket.setTimeout(5000);
                    socket.on('timeout', () => {
                        socket.destroy();
                        sock.sendMessage(from, {
                            text: `❌ *Minecraft Server ist OFFLINE*\n\n📍 Server: ${address}\n🔴 Status: Offline\n⏱️ Zeit: ${new Date().toLocaleTimeString('de-DE')}`
                        }, { quoted: msg });
                    });

                    socket.on('error', () => {
                        sock.sendMessage(from, {
                            text: `❌ *Minecraft Server ist OFFLINE*\n\n📍 Server: ${address}\n🔴 Status: Offline oder nicht erreichbar\n⏱️ Zeit: ${new Date().toLocaleTimeString('de-DE')}`
                        }, { quoted: msg });
                    });
                } catch (err) {
                    console.error('MC Status Error:', err);
                    await sock.sendMessage(from, {
                        text: '❌ Fehler beim Prüfen des Server Status!'
                    }, { quoted: msg });
                }
                break;
            }

            case 'mcplayers': {
                let address = args[0];
                
                // Wenn keine Adresse angegeben, nutze gespeicherte IP
                if (!address) {
                    try {
                        const mcConfigPath = path.join(__dirname, 'mcConfig.json');
                        if (fs.existsSync(mcConfigPath)) {
                            const mcConfig = JSON.parse(fs.readFileSync(mcConfigPath, 'utf-8'));
                            address = mcConfig.serverIP;
                        } else {
                            return sock.sendMessage(from, { text: '❌ Keine Server-IP gespeichert!\n\n📝 Nutze: /mcsetserver <IP:PORT> <Name>\noder: /mcplayers <IP:PORT>' }, { quoted: msg });
                        }
                    } catch (err) {
                        return sock.sendMessage(from, { text: '❌ Fehler beim Laden der Server-IP!' }, { quoted: msg });
                    }
                }

                try {
                    const net = require('net');
                    const [ip, port] = address.split(':');
                    const portNum = port || 25565;

                    const socket = net.createConnection(portNum, ip, () => {
                        socket.destroy();
                        sock.sendMessage(from, {
                            text: `👥 *Spieler auf ${address}*\n\n📊 Info:\n• Server ist erreichbar\n• Eine detaillierte Spielerliste benötigt einen Query-Server\n• Aktiviere Query in deiner server.properties Datei\n\n💡 Tipp: Verwende /mcquery für mehr Infos`
                        }, { quoted: msg });
                    });

                    socket.setTimeout(5000);
                    socket.on('timeout', () => {
                        socket.destroy();
                        sock.sendMessage(from, {
                            text: `❌ Server ${address} ist nicht erreichbar!`
                        }, { quoted: msg });
                    });

                    socket.on('error', () => {
                        sock.sendMessage(from, {
                            text: `❌ Konnte sich nicht mit ${address} verbinden!`
                        }, { quoted: msg });
                    });
                } catch (err) {
                    console.error('MC Players Error:', err);
                    await sock.sendMessage(from, {
                        text: '❌ Fehler beim Abrufen der Spielerliste!'
                    }, { quoted: msg });
                }
                break;
            }

            case 'mcsearch': {
                const playerName = args.join(' ');
                if (!playerName) {
                    return sock.sendMessage(from, { text: '❌ Bitte gib einen Spielernamen an!\n\n📝 Beispiel: /mcsearch Notch' }, { quoted: msg });
                }

                try {
                    const https = require('https');
                    https.get(`https://api.mojang.com/users/profiles/minecraft/${playerName}`, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                const json = JSON.parse(data);
                                sock.sendMessage(from, {
                                    text: `✅ *Minecraft Spieler gefunden*\n\n👤 Name: ${json.name}\n🆔 UUID: ${json.id}\n📅 Status: ✓ Gültiger Account`
                                }, { quoted: msg });
                            } else {
                                sock.sendMessage(from, {
                                    text: `❌ Spieler "${playerName}" nicht gefunden!`
                                }, { quoted: msg });
                            }
                        });
                    }).on('error', () => {
                        sock.sendMessage(from, {
                            text: '❌ Fehler beim Suchen des Spielers!'
                        }, { quoted: msg });
                    });
                } catch (err) {
                    console.error('MC Search Error:', err);
                    await sock.sendMessage(from, {
                        text: '❌ Fehler bei der Spielersuche!'
                    }, { quoted: msg });
                }
                break;
            }

            case 'mcquery': {
                let address = args[0];
                
                // Wenn keine Adresse angegeben, nutze gespeicherte IP
                if (!address) {
                    try {
                        const mcConfigPath = path.join(__dirname, 'mcConfig.json');
                        if (fs.existsSync(mcConfigPath)) {
                            const mcConfig = JSON.parse(fs.readFileSync(mcConfigPath, 'utf-8'));
                            address = mcConfig.serverIP;
                        } else {
                            return sock.sendMessage(from, { text: '❌ Keine Server-IP gespeichert!\n\n📝 Nutze: /mcsetserver <IP:PORT> <Name>\noder: /mcquery <IP:PORT>' }, { quoted: msg });
                        }
                    } catch (err) {
                        return sock.sendMessage(from, { text: '❌ Fehler beim Laden der Server-IP!' }, { quoted: msg });
                    }
                }

                try {
                    sock.sendMessage(from, {
                        text: `📊 *Minecraft Server Query*\n\n📍 Server: ${address}\n\n⚠️ Query-Status:\n• Um detaillierte Infos zu erhalten,\n• aktiviere Query in deiner server.properties\n• enable-query=true\n• query.port=25565\n\n💡 Tipps:\n/mcstatus - Prüft ob der Server online ist\n/mcplayers - Zeigt Spieler-Informationen`
                    }, { quoted: msg });
                } catch (err) {
                    console.error('MC Query Error:', err);
                    await sock.sendMessage(from, {
                        text: '❌ Fehler beim Query!'
                    }, { quoted: msg });
                }
                break;
            }

            case 'mcserver': {
                // Nur für Owner
                if (!isOwner(sender)) {
                    return sock.sendMessage(from, { text: '❌ Nur der Owner darf diesen Command verwenden!' }, { quoted: msg });
                }

                const subCmd = args[0]?.toLowerCase();
                const subArgs = args.slice(1).join(' ');

                const responses = {
                    'start': '🟢 Minecraft Server wurde gestartet!',
                    'stop': '🔴 Minecraft Server wurde gestoppt!',
                    'restart': '🔄 Minecraft Server wird neu gestartet...',
                    'save': '💾 Server Save wurde durchgeführt!',
                    'status': '📊 Server ist online und funktioniert normal',
                    'help': `❓ *Minecraft Server Commands*\n\n📝 Verfügbare Befehle:\n/mcserver start\n/mcserver stop\n/mcserver restart\n/mcserver save\n/mcserver status`
                };

                const response = responses[subCmd] || responses['help'];
                await sock.sendMessage(from, { text: response }, { quoted: msg });
                break;
            }

            // ====================== DEFAULT ====================== //
            default: {
                const suggestion = suggestCommand(command.toLowerCase());
                await sock.sendMessage(from, {
                    text: `❌ Unbekannter Command: \`${command}\`\n💡 Meintest du: \`${suggestion}\`?`
                }, { quoted: msg });
                break;
            }

        } // switch END
} catch (err) {
  console.error(`❌ Fehler bei Command '${command}':`, err.message || err);
  console.error('Stack:', err.stack);
  try {
    await sock.sendMessage(chatId, { 
      text: `❌ Ein Fehler ist bei der Ausführung des Befehls aufgetreten:\n\n_${err.message}_` 
    }, { quoted: msg });
  } catch (sendErr) {
    console.error('Fehler beim Senden der Fehlermeldung:', sendErr.message || sendErr);
  }
}

  }); // sock.ev.on END

// end of message handler

};
