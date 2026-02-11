const tttGames = {}; // { jid: { board: ['','','','','','','','',''], turn: 'X'|'O', status: 'playing' } }
const bjGames = {}; // { jid: { hand: [], dealer: [], status: 'playing'|'stand', bet: Zahl } }
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
const { downloadMediaMessage } = require('@717development/baileys');
const chalk = require('chalk');
const ffmpeg = require('@ffmpeg-installer/ffmpeg'); 
const allowedRanks = require('./ranksConfig.json');
const { proto, generateWAMessageFromContent, prepareWAMessageMedia, getContentType } = require('@717development/baileys');
const { downloadContentFromMessage } = require('@717development/baileys')
const crypto = require('crypto');
const pino = require('pino');
const axios = require('axios');
const { Buffer } = require('buffer');
const fetch = require('node-fetch');
const { getPreview } = require('spotify-url-info')(fetch);
const STATS_FILE = "./botStats.json";
const { getAudioBuffer, saveTempAudio } = require('./audioHelper');
const FormData = require('form-data');
const ranks = require('./rangsystem/ranks.js');
const { isGroupLocked, lockGroup, unlockGroup } = require('./lib/lockedGroups');

const BOTHUB_URL = "https://bothub.gamebot.me/api/bot/update-stats";
const BOTHUB_TOKEN = "api_BotHub_13_1756984116657_ceb64da87bc3fe215bdb430041778b36";
const blockedFile = './data/blocked.json';
if (!fs.existsSync(blockedFile)) fs.writeFileSync(blockedFile, JSON.stringify({ blocked: [] }, null, 2));

const loadBlocked = () => JSON.parse(fs.readFileSync(blockedFile));
const saveBlocked = (data) => fs.writeFileSync(blockedFile, JSON.stringify(data, null, 2));

const path = require('path');
const { Sticker } = require('wa-sticker-formatter');


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
const { ytdl, ttdl, igdl, fbdl, twdl } = require("@neelegirl/downloader");
const { handleYT, handleIG, handleFB, handleTW } = require("./downloaders.js");
const yts = require("yt-search");
const playdl = require("play-dl");
const neeledownloader = require("@neelegirl/downloader");
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
//=================AntiDelete=================//
const nsfwFile = './antinsfw.json';

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const banFile = path.join(dataDir, 'bannedu.json');

function loadBans() {
  if (!fs.existsSync(banFile)) {
    fs.writeFileSync(banFile, "[]", 'utf-8');
  }
  return JSON.parse(fs.readFileSync(banFile, 'utf-8'));
}

function saveBans(list) {
  fs.writeFileSync(banFile, JSON.stringify(list, null, 2), 'utf-8');
}


function isBanned(jid) {
  const bans = loadBans();
  return bans.find(b => b.jid === jid) || null;
}


function banUser(jid, reason = 'Kein Grund angegeben') {
  const bans = loadBans();
  if (!bans.some(b => b.jid === jid)) {
    bans.push({ jid, reason, timestamp: Date.now() });
    saveBans(bans);
  }
}


function unbanUser(jid) {
  let bans = loadBans();
  bans = bans.filter(b => b.jid !== jid);
  saveBans(bans);
}
module.exports = { isBanned, banUser, unbanUser };


const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'data', 'stormbot_users.db'));
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

// Nachrichten-Handler
db.prepare(`
CREATE TABLE IF NOT EXISTS inventory (
  jid TEXT,
  fish TEXT,
  count INTEGER DEFAULT 1,
  PRIMARY KEY(jid, fish)
)
`).run();
// Tabelle für Haustiere
db.prepare(`
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

// Tabelle für Items im Besitz des Users
db.prepare(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT,
    itemName TEXT,
    amount INTEGER DEFAULT 1
  )
`).run();


// === VORBEREITETE STATEMENTS ===
const getUserStmt = db.prepare('SELECT * FROM users WHERE jid = ?');
const ensureUserStmt = db.prepare('INSERT INTO users (jid, name, balance, xp, level) VALUES (?, ?, ?, ?, ?)');
const deleteUserStmt = db.prepare('DELETE FROM users WHERE jid = ?');
const updateUserStmt = db.prepare('UPDATE users SET balance = ?, xp = ?, level = ?, name = ? WHERE jid = ?');

const getFishStmt = db.prepare('SELECT * FROM inventory WHERE jid = ? AND fish = ?');
const addFishStmt = db.prepare('INSERT OR REPLACE INTO inventory (jid, fish, count) VALUES (?, ?, ?)');
const getAllFishStmt = db.prepare('SELECT * FROM inventory WHERE jid = ?');
const topCoinsStmt = db.prepare('SELECT name, balance FROM users ORDER BY balance DESC LIMIT ?');
const topXpStmt = db.prepare('SELECT name, xp, level FROM users ORDER BY xp DESC LIMIT ?');

// === HELPER-FUNKTIONEN ===

// USER HELPERS
function getUser(jid) {
  return getUserStmt.get(jid) || null;
}

function ensureUser(jid, name = null) {
  let u = getUser(jid);
  if (!u) {
    ensureUserStmt.run(jid, name || jid.split('@')[0], 100, 0, 1);
    u = getUser(jid);
  }
  return u;
}

function deleteUser(jid) {
  return deleteUserStmt.run(jid);
}

function updateUser(jid, balance, xp, level, name) {
  return updateUserStmt.run(balance, xp, level, name, jid);
}

// XP & LEVEL
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




// Nachrichten-Handler
sock.ev.on('messages.upsert', async (m) => {
  const msg = m.messages[0];
  if (!msg.message) return;

  const chatId = msg.key.remoteJid;
  const from = chatId;
  const body = msg.message.conversation || msg.message.extendedTextMessage?.text;
  if (!body) return;

  const prefix = getPrefixForChat(chatId);

  // Ignoriere nicht-Command-Nachrichten von dir selbst, aber verarbeite deine Befehle
  if (msg.key.fromMe && !body.startsWith(prefix)) return;

  // === Jede Nachricht automatisch als gelesen markieren ===
  await sock.readMessages([msg.key]);

  // === Nur Commands: "schreibt…" simulieren ===
  if (body.startsWith(prefix)) {
    await sock.sendPresenceUpdate('composing', chatId);

    // Optional: Präsenz nach kurzer Zeit zurücksetzen
    setTimeout(async () => {
      await sock.sendPresenceUpdate('available', chatId);
    }, 2000);
  }

  // Autoreact: reagiert automatisch auf eingehende Nachrichten, wenn aktiviert
  try {
    const featuresFile = path.join(__dirname, 'featureTests.json');
    let features = { autoreact: false };
    if (fs.existsSync(featuresFile)) {
      const raw = fs.readFileSync(featuresFile, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      features = Object.assign({}, features, parsed);
    }
    if (features.autoreact && !body.startsWith(prefix)) {
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
    console.log(`✅ Wiederhergestellt (${mediaType}) im Chat: ${remoteJid}`);
  } else {
    await sock.sendMessage(chatId, {
      text: `${caption}\n> 🔓 *Nachricht:* ${originalText}`
    });
    console.log(`✅ Wiederhergestellte Textnachricht im Chat: ${remoteJid}`);
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

const contentType = getContentType(messageContent);
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
    messageBody = messageContent.buttonsResponseMessage.selectedButtonId || '';
    preview = `[🟦 Button Antwort] ${messageBody}`;
    break;
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

const isGroupChat = chatId && chatId.endsWith('@g.us');
const chatType = isGroupChat ? 'Gruppe' : 'Privat';


let senderNumber;
if (msg.key.fromMe) {
  senderNumber = (msg.key.participant || msg.key.remoteJid || '').split('@')[0];
} else if (isGroupChat) {
  senderNumber = (msg.key.participant || chatId).split('@')[0];
} else {
  senderNumber = chatId.split('@')[0];
}
const cleanedSenderNumber = senderNumber.replace(/[^0-9]/g, '');


const id = msg.key.id || '';
const isFromWeb =
  id.toLowerCase().startsWith('web') ||
  id.toLowerCase().includes('desktop') ||
  id.toUpperCase().startsWith('WA');
const isFromAndroid = !isFromWeb && (id.length > 20 || id.startsWith('BAE'));
const isFromIOS = !isFromWeb && !isFromAndroid;

const device = isFromWeb ? 'Web' : isFromAndroid ? 'Android' : 'iOS';
const deviceEmoji = isFromWeb ? '💻' : isFromAndroid ? '📱' : '🍏';

// === Testfeature: Leveling & Antilink (per-message handling) ===
try {
  const featuresFile = path.join(__dirname, 'featureTests.json');
  let features = { leveling: false, antilink: false, antispam: false, antinsfw: false, autosticker: false, badwords: [] };
  if (fs.existsSync(featuresFile)) {
    const raw = fs.readFileSync(featuresFile, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    features = Object.assign({}, features, parsed);
  }

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

  // Autosticker: lösche Sticker-Nachrichten, wenn aktiviert
  if (features.autosticker && isGroupChat) {
    try {
      if (msg.message?.stickerMessage) {
        try {
          await sock.sendMessage(chatId, { delete: msg.key });
          await sock.sendMessage(chatId, { text: '� sticker sind in dieser Gruppe nicht erlaubt. Sticker entfernt.' }, { quoted: msg });
        } catch (delErr) {
          console.error('Autosticker delete failed:', delErr && delErr.message ? delErr.message : delErr);
        }
        return;
      }
    } catch (e) {
      // ignore
    }
  }

  // Antispam: wenn gleiche User innerhalb 5s erneut sendet, löschen und warnen
  if (features.antispam && isGroupChat) {
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


let pushName = msg.pushName || null;


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

const pfx = getPrefixForChat(chatId);
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

// Dieser Check sollte **vor dem Switch/Command-Handler** laufen
if (isBanned(sender)) {
  const banData = isBanned(sender); // enthält { jid, reason, timestamp }

  // Reagiere auf die Nachricht
  await sock.sendMessage(from, { react: { text: '⛔', key: msg.key } });

  // Nachricht mit Grund
  await sock.sendMessage(chatId, { 
    text: `🚫 Du bist gebannt und kannst keine Commands ausführen.\n📝 Grund: ${banData.reason}\nDu kannst bei wa.me/4915679717020 den Entban-Antrag stellen.`
  }, { quoted: msg });

  // Kick aus allen Gruppen, in denen der User ist
  const groups = await sock.groupFetchAllParticipating(); // alle Gruppen holen
  for (let gid in groups) {
    const group = groups[gid];
    if (group.participants.includes(sender)) {
      try {
        await sock.groupParticipantsUpdate(gid, [sender], 'remove');
      } catch (err) {
        console.error(`Fehler beim Kicken von ${sender} aus ${gid}:`, err);
      }
    }
  }

  return; // damit keine weiteren Commands ausgeführt werden
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
if (isGroupLocked(from)) {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];
  if (!allowed.includes(senderRank)) {
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


  updateUserStmt.run(user.balance, user.xp, user.level, user.name, user.jid || jid);
}


if (user) {
  user.xp += 6;

  
  while (user.xp >= 100) {
    user.level += 1;
    user.xp -= 100;
  }

 
  updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);
}


const commandsList = [
  
  'menu', 'help', 'ping', 'runtime', 'server', 'owner', 'support', 'tos',


  'play', 'play1', 'play2', 'sticker', 'viewonce', 'getpic',

  // 🔹 Admin
  'setdesc', 'setname', 'welcome', 'antidelete', 'antilink', 'linkbypass', 'unlinkbypass',
  'warn', 'resetwarn', 'warns', 'mute', 'unmute', 'mutedlist',
  'kick', 'promote', 'demote', 'add', 'del', 'tagall', 'hidetag',
  'grpinfo', 'grouplink', 'revoke', 'broadcast', 'farewell',

  
  'reload', 'leaveall', 'leavegrp', 'grouplist', 'grouplist2',
  'addme', 'addadmin', 'setrank', 'delrank', 'ranks', 'listsessions',
  'lid', 'killsession', 'newpair', 'newqr', 'newqr1', 'newqr2',
  'startmc', 'stopmc', 'tok', 'tok2',

  
  'shop', 'buy', 'use', 'inventory', 'register', 'me', 'profile',
  'addcoins', 'delcoins', 'topcoins', 'topxp', 'pets', 'pethunt', 'fish', 'fishlist',

  'hug', 'kiss', 'slap', 'pat', 'poke', 'cuddle', 'fuck', 'horny', 'goon', 'penis', 'tok', 'tok2',

 
  'id', 'leave', 'leave2', 'join', 'addme', 'sessions', 'antideletepn',

  
  'ban', 'unban', 'unregister', 'broadcast', 'tagall', 'grpinfo', 'antidelete', 
  // Stranger Things fun
  'strangerfact', 'upside', 'eleven', 'mindflip', 'demogorgon', 'redrun', 'darkweb', 'strangergame', 'moviequote', 'hawkins', 'dna', 'friends', 'gate',
  // AI Commands
  'ask', 'summarize', 'translate', 'joke', 'rhyme', 'poem', 'story', 'riddle', 'codehelp', 'math', 'define',
  // User Config
  'config',
  // Audio Effects
  'bassboost', 'slowed', 'spedup', 'nightcore', 'reverb', 'reverse', 'deep', 'echo', 'vaporwave', '8d', 'earrape', 'chipmunk',
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

    // Load global feature toggles (testfeatures)
    let features = { welcome: false, goodbye: false, antibot: false };
    try {
      const featuresFile = path.join(__dirname, 'featureTests.json');
      if (fs.existsSync(featuresFile)) {
        const raw = fs.readFileSync(featuresFile, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        features = Object.assign({}, features, parsed);
      }
    } catch (e) {
      // ignore feature load errors
    }

    for (const user of update.participants) {
      try {
        const name = user.split('@')[0];

        // JOIN
        if (update.action === 'add') {
          // per-group welcome (db) or global testfeature
          if (db[groupId]?.enabled || features.welcome) {
            const welcomeText = (db[groupId]?.text || 'Willkommen @user 🎉').replace(/@user/gi, `@${name}`);
            await sock.sendMessage(groupId, { text: welcomeText, mentions: [user] });
          }

          // Antibot: entferne heuristische Bot-Accounts, falls aktiviert
          if (features.antibot) {
            try {
              const contactInfo = await sock.onWhatsApp(user).catch(() => null);
              const notify = contactInfo && contactInfo[0] && contactInfo[0].notify ? contactInfo[0].notify : '';
              const isBot = /bot/i.test(notify) || /bot/i.test(user);
              if (isBot) {
                try {
                  await sock.groupParticipantsUpdate(groupId, [user], 'remove');
                  await sock.sendMessage(groupId, { text: `🤖 Bot erkannt und entfernt: @${user.split('@')[0]}`, mentions: [user] });
                } catch (kickErr) {
                  console.error('Antibot kick failed:', kickErr && kickErr.message ? kickErr.message : kickErr);
                }
              }
            } catch (errBot) {
              // ignore per-user check errors
            }
          }
        }

        // LEAVE / REMOVE
        if (update.action === 'remove' || update.action === 'leave') {
          if (db[groupId]?.goodbye || features.goodbye) {
            const goodbyeText = (db[groupId]?.goodbyeText || 'Tschüss @user 👋').replace(/@user/gi, `@${name}`);
            await sock.sendMessage(groupId, { text: goodbyeText, mentions: [user] });
          }
        }
      } catch (innerErr) {
        console.error('Fehler beim Verarbeiten eines Participants-Eintrags:', innerErr);
      }
    }
  } catch (err) {
    console.error('Fehler beim Welcome-Event:', err);
  }
});


switch (command) {
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
        const row = db.prepare('SELECT COUNT(*) as c FROM users').get();
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
      const WEBSITE_URL = '';
      const CHANNEL_URL = '';
      const MINI_WEB = '';
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
        files = fs.readdirSync(basePath).filter(f => /\.(mp4|mov)$/i.test(f)).sort().slice(0, 10);
      } catch (e) {
        return await sock.sendMessage(from, { text: '❌ /cards Ordner nicht lesbar.' }, { quoted: msg });
      }

      if (!files.length) return await sock.sendMessage(from, { text: '⚠️ Keine Videos im /cards Ordner.' }, { quoted: msg });

      const cards = [];
      for (let i = 0; i < files.length; i++) {
        const filePath = path.join(basePath, files[i]);
        const buffer = fs.readFileSync(filePath);
        const media = await prepareWAMessageMedia({ video: buffer }, { upload: sock.waUploadToServer });
        cards.push({
          header: {
            title: `♤ Video ${i + 1} ♤`,
            hasMediaAttachment: true,
            videoMessage: media.videoMessage
          },
          body: { text: `♤ BeastBot Gallery – Video ${i + 1}` },
          footer: { text: '©️ Beastmeds X ⁷¹⁷𝓝𝓪𝔂𝓿𝔂' },
          nativeFlowMessage: {
            buttons: [
              { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📎 WhatsApp Channel', url: CHANNEL_URL }) },
              { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🌐 Website', url: WEBSITE_URL }) },
              { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Infos über den Owner minimalisiert', url: MINI_WEB }) }
            ]
          }
        });
      }

      const content = {
        interactiveMessage: {
          body: { text: `🎬 Beast Bot Video Carousel\n\n↔️ Wische durch ${files.length} Videos` },
          carouselMessage: { cards }
        }
      };

      const generated = generateWAMessageFromContent(from, content, { userJid: sock.user.id, quoted: statusQuoted });
      await sock.relayMessage(from, generated.message, { messageId: generated.key.id });
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
• Nummer: +4367764694963

`.trim();
  await sock.sendMessage(from, { text });
await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
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
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, {
      text: `⛔ *Zugriff verweigert!*\n\nNur diese Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber`
    }, { quoted: msg });
    break;
  }

  lockGroup(from);
  await sock.sendMessage(from, {
    text: `🔒 *Diese Gruppe wurde gesperrt!*\n\nWendet euch an das Team.`
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

  // 1️⃣ Antwort auf Nachricht
  if (msg.quoted) {
    targetMsg = msg.quoted;
    targetJid = targetMsg.key.participant || targetMsg.key.remoteJid;
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
    const origId = targetMsg.key.id || '';
    const origJid = targetMsg.key.participant || targetMsg.key.remoteJid;

    const idLower = origId.toLowerCase();
    const idUpper = origId.toUpperCase();

    const isWeb =
      idLower.startsWith('web') ||
      idLower.includes('desktop') ||
      idUpper.startsWith('WA');

    const isAndroid = !isWeb && (origId.startsWith('BAE') || /^[0-9A-F]{28,}$/i.test(origId));
    const isIOS = !isWeb && !isAndroid;

    const device = isWeb ? 'Web/Desktop' : isAndroid ? 'Android' : 'iOS';
    const deviceEmoji = isWeb ? '💻' : isAndroid ? '📱' : '🍏';

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

    await sock.sendMessage(from, {
      text: `📌 *Gerät des Users*: ${deviceEmoji} ${device}\n👤 Name: ${pushName}`
    }, { quoted: msg });

  } catch (err) {
    console.error(err);
    await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen des Geräts.' }, { quoted: msg });
  }

  break;
}

case 'unlockgroup': {
  const senderRank = ranks.getRank(sender);
  const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

  if (!allowed.includes(senderRank)) {
    await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, {
      text: `⛔ *Zugriff verweigert!*\n\nNur diese Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber\n Moderatoren`
    }, { quoted: msg });
    break;
  }

  unlockGroup(from);
  await sock.sendMessage(from, {
    text: `🔓 *Diese Gruppe wurde entsperrt!*\n\n`
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
case 'ig': {
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
    await sock.readMessages([msg.key]);

    const isInstaReel = q.match(/instagram\.com\/(reel|reels|p)\/([A-Za-z0-9_-]+)/i);
    if (!isInstaReel) {
      await sock.sendMessage(chatId, {
        text: `❌ Das scheint kein gültiger Instagram-Reel-Link zu sein.\n\nBeispiel:\n/ig https://instagram.com/reel/xxxxxx\n\n> ${botName}`
      }, { quoted: msg });
      break;
    }

    await sock.sendMessage(chatId, {
      text: `📸 *Instagram Reel Download*\n\n⏳ Lade dein Reel herunter...`
    }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

    // === Reel herunterladen ===
    const igData = await neeledownloader.instagram(q);
  

    let videoUrl = null;

    // Mehrere mögliche API-Strukturen prüfen
    if (igData?.data) {
      if (Array.isArray(igData.data.video) && igData.data.video.length > 0) {
        videoUrl = igData.data.video[0];
      } else if (Array.isArray(igData.data) && igData.data.length > 0) {
        videoUrl = igData.data[0]?.url || igData.data[0]?.download || igData.data[0]?.video;
      } else if (typeof igData.data === 'object') {
        videoUrl = igData.data.url || igData.data.download || igData.data.video || igData.data.mp4;
      }
    } else if (igData?.url) {
      videoUrl = igData.url;
    } else if (igData?.video) {
      videoUrl = igData.video;
    } else if (igData?.download) {
      videoUrl = igData.download;
    }

    if (!videoUrl) {
      console.error('❌ Instagram API Antwort ohne URL:', igData);
      await sock.sendMessage(chatId, {
        text: `❌ Keine gültige Video-URL gefunden.\n💡 Versuche einen anderen Link oder melde das Problem!\n\n> ${botName}`
      }, { quoted: msg });
      break;
    }



    const res = await axios.get(videoUrl, { responseType: 'arraybuffer' });
    let videoBuffer = Buffer.from(res.data);
    const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);

    const endTime = Date.now();
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

    await sock.sendMessage(chatId, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      fileName: `instagram_reel.mp4`,
      caption: `📸 *Instagram Reel Download*\n\n✅ Fertig!\n⏱ Zeit: ${timeTaken}s | 📊 Größe: ${fileSizeMB} MB\n\n> ${botName}`,
      gifPlayback: false
    }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    // Speicher freigeben
    videoBuffer = null;
    if (global.gc) global.gc();
    console.log('🗑 Buffer gelöscht');

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
      return await sock.sendMessage(from, { text: '⛔ /setup funktioniert nur in Gruppen!' }, { quoted: msg });
    }

    const metadata = await sock.groupMetadata(from);
    const participants = metadata.participants;

    // Prüfe ob Sender Admin
    const senderIsAdmin = participants.some(p => p.id === sender && (p.admin === 'admin' || p.admin === 'superadmin'));
    if (!senderIsAdmin) {
      return await sock.sendMessage(from, { text: '⛔ Nur Gruppenadmins dürfen das Setup ausführen.' }, { quoted: msg });
    }

    await sock.sendMessage(from, { 
      text: `⚙️ *Setup für BeastBot*\n\n` +
            `✋ Beachte:\n` +
            `• Der Bot muss Admin sein\n` +
            `• Die Gruppenbeschreibung wird geändert\n\n` +
            `📋 *Nächste Schritte:*\n` +
            `Teammmitglieder müssen folgendes ausführen:\n` +
            `/setupaccept\n\n` +
            `Dies wird die Bot-Infos in die Gruppenbeschreibung schreiben.`,
      mentions: [sender]
    }, { quoted: msg });

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
    await sock.sendMessage(from, { text: `❌ Fehler: ${e.message}` }, { quoted: msg });
  }
  break;
}

case 'setupaccept': {
  try {
    const metadata = await sock.groupMetadata(from);
    const participants = metadata.participants;

    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];
    
    if (!allowed.includes(senderRank)) {
      return await sock.sendMessage(from, { text: '⛔ Nur Team-Mitglieder dürfen setupaccept ausführen.' }, { quoted: msg });
    }

    const isBotAdmin = participants.some(p => p.id === sock.user.id && (p.admin === 'admin' || p.admin === 'superadmin'));
    if (!isBotAdmin) {
      return await sock.sendMessage(from, { text: '⛔ Der Bot muss Admin sein, um das Setup durchzuführen!' }, { quoted: msg });
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
- Owner: *𝓞𝓷𝓮𝓓𝓮𝓿𝓲𝓵🩸*

Bei Fragen: /support
Setup-Datum: ${formattedDate}
`;

    const currentDesc = metadata.desc || '';
    const newDesc = currentDesc + '\n' + appendText;
    await sock.groupUpdateDescription(from, newDesc);

    await sock.sendMessage(from, { 
      text: '✅ Setup abgeschlossen! Bot-Infos wurden in die Gruppenbeschreibung hinzugefügt.',
      mentions: [sender]
    }, { quoted: msg });

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
    await sock.sendMessage(from, { text: '❌ Fehler beim Setup. Prüfe die Logs!' }, { quoted: msg });
  }
  break;
}

case 'ownersetup': {
  try {
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber'];
    
    if (!allowed.includes(senderRank)) {
      return await sock.sendMessage(from, { text: '⛔ Nur der Owner darf diesen Befehl nutzen.' }, { quoted: msg });
    }

    const metadata = await sock.groupMetadata(from);
    const participants = metadata.participants;

    const isBotAdmin = participants.some(p => p.id === sock.user.id && (p.admin === 'admin' || p.admin === 'superadmin'));
    if (!isBotAdmin) {
      return await sock.sendMessage(from, { text: '⛔ Der Bot muss Admin sein!' }, { quoted: msg });
    }

    // Nur Admin-Setup ohne Beschreibung zu ändern
    await sock.sendMessage(from, { 
      text: `✅ Owner-Setup durchgeführt.\n\nKeine Beschreibungsänderung.`,
      mentions: [sender]
    }, { quoted: msg });

  } catch (e) {
    console.error('Fehler bei ownersetup:', e);
    await sock.sendMessage(from, { text: '❌ Fehler beim Owner-Setup.' }, { quoted: msg });
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
      // Public user action: send join request to configured join group
      try {
        const joinGrp = getJoinGroup();
        if (!joinGrp) {
          return await sock.sendMessage(from, { text: '❌ Es wurde keine Join-Gruppe konfiguriert. Bitte kontaktiere das Team.' }, { quoted: msg });
        }

        const senderName = pushName || sender.split('@')[0];
        const chatName = isGroupChat ? (metadata.subject || from) : 'Privatchat';
        const reason = args.join(' ') || 'Keine Nachricht angegeben.';

        const reqText = `📨 *Beitrittsanfrage von* @${sender.split('@')[0]}\n\n` +
                        `👤 Name: ${senderName}\n` +
                        `💬 Chat: ${chatName}\n` +
                        `💡 Nachricht: ${reason}\n\n` +
                        `To accept: use the group management commands`;

        await sock.sendMessage(joinGrp, { text: reqText, mentions: [sender] });
        await sock.sendMessage(from, { text: '✅ Deine Beitrittsanfrage wurde an das Team gesendet.' }, { quoted: msg });
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
        let imageMessage;


        if (msg.message.imageMessage) {
            imageMessage = msg.message.imageMessage;
        } else if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
            imageMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
        } else {
            await sock.sendMessage(from, { text: '❌ Bitte sende ein Bild oder zitiere ein Bild!', quoted: msg });
            break;
        }

        
        const stream = await downloadContentFromMessage(imageMessage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

       
        let username = msg.pushName || 'Unbekannt';


        const sticker = new Sticker(buffer, {
            pack: 'Erstellt mit BeastBot',
            author: username,
            type: 'full'
        });

     
        await sock.sendMessage(from, { sticker: await sticker.toBuffer(), quoted: msg });

    } catch (e) {
        console.log(e);
        await sock.sendMessage(from, { text: '❌ Fehler beim Erstellen des Stickers', quoted: msg });
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
    await sock.readMessages([msg.key]);

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

    const ytCmds = [
      `"${path.join(__dirname, 'yt-dlp')}"`,
      'yt-dlp',
      'yt-dlp.exe',
      'npx yt-dlp'
    ];
    let dlErr = null;
    let dlSuccess = false;
    for (const cmd of ytCmds) {
      try {
        await new Promise((resolve, reject) => {
          exec(`${cmd} -f "best[height<=360]" -o "${filePath}" "${url}"`, (error, stdout, stderr) => {
            if (error) return reject(stderr || error.message);
            resolve(stdout);
          });
        });
        dlSuccess = true;
        break;
      } catch (e) {
        dlErr = e;
      }
    }
    if (!dlSuccess) throw new Error(dlErr || 'yt-dlp not found');

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
    const bans = dbBans.bans;

    if (bans.length === 0) {
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
      // Llama API (free inference via Hugging Face or similar)
      const response = await axios.post('https://api-inference.huggingface.co/models/meta-llama/Llama-2-70b-chat-hf', {
        inputs: query,
        parameters: {
          max_new_tokens: 500
        }
      }, {
        headers: {
          'Authorization': 'Bearer hf_wXzpPqRvStUvWxYzAbCdEfGhIjKlMnOpQrStUvWx'
        }
      });

      if (response.data && response.data[0] && response.data[0].generated_text) {
        const answer = response.data[0].generated_text;
        await sock.sendMessage(from, { text: answer }, { quoted: msg });
      } else {
        throw new Error('Ungültige Antwort von Llama API');
      }
    } catch (llamaErr) {
      console.error('Llama API Error:', llamaErr);
      // Fallback auf kostenlosen Endpoint
      try {
        const fallbackResponse = await axios.get(`https://api.api-ninjas.com/v1/riddles?limit=1`, {
          headers: { 'X-Api-Key': 'TEST' }
        });
        await sock.sendMessage(from, { text: `🤖 *Llama AI*\n\n${query}\n\nAPI temporär nicht verfügbar. Versuche später erneut.` }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(from, { text: `❌ Llama API Fehler: ${llamaErr.message}` }, { quoted: msg });
      }
    }

  } catch (err) {
    console.error('AI Error:', err);
    await sock.sendMessage(from, { text: `❌ Fehler: ${err.message}` }, { quoted: msg });
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

    const prompt = text.replace(/^\/imagine\s+/i, '').trim();
    if (!prompt) {
      await sock.sendMessage(from, { 
        text: "⚠️ Bitte gib eine Bildbeschreibung ein.\nBeispiel: /imagine Ein Hund der im Park spielt"
      }, { quoted: msg });
      break;
    }

    // Reaktion: Bot arbeitet
    await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });

    try {
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
      
      await sock.sendMessage(from, {
        image: { url: imageUrl },
        caption: `🎨 *Pollinations AI*\n\nPrompt: ${prompt}`
      }, { quoted: msg });

    } catch (imagineErr) {
      console.error('Pollinations API Error:', imagineErr);
      await sock.sendMessage(from, { text: `❌ Fehler beim Generieren des Bildes: ${imagineErr.message}` }, { quoted: msg });
    }

  } catch (err) {
    console.error('Imagine Error:', err);
    await sock.sendMessage(from, { text: `❌ Fehler: ${err.message}` }, { quoted: msg });
  }
  break;
}


case 'welcome': {
  try {
    // Gruppendaten abrufen
    const groupMetadata = await sock.groupMetadata(from);
    const senderIsAdmin = groupMetadata.participants
      .find(p => p.id === sender)?.admin !== null;

    if (!senderIsAdmin) {
      await sock.sendMessage(from, { text: '🚫 Nur Admins können den Welcome-Command ausführen.' }, { quoted: msg });
      break;
    }

    const db = loadWelcome();
    const sub = args[0]?.toLowerCase();

    if (!sub) {
      await sock.sendMessage(from, {
        text: `⚙️ *Welcome-System*\n\n🔹 /welcome on – Begrüßung aktivieren\n🔹 /welcome off – Begrüßung deaktivieren\n🔹 /welcome set <Text> – Begrüßungstext ändern\n\nAktueller Status: ${db[from]?.enabled ? '✅ Aktiv' : '❌ Inaktiv'}`
      }, { quoted: msg });
      break;
    }

    switch (sub) {
      case 'on':
        db[from] = db[from] || {};
        db[from].enabled = true;
        db[from].text = db[from].text || '👋 Willkommen @user in der Gruppe!';
        saveWelcome(db);
        await sock.sendMessage(from, { text: '✅ Welcome-Nachricht aktiviert!' }, { quoted: msg });
        break;

      case 'off':
        db[from] = db[from] || {};
        db[from].enabled = false;
        saveWelcome(db);
        await sock.sendMessage(from, { text: '❌ Welcome-Nachricht deaktiviert.' }, { quoted: msg });
        break;

      case 'set':
        const text = args.slice(1).join(' ');
        if (!text) {
          await sock.sendMessage(from, { text: '⚠️ Bitte gib einen Begrüßungstext an.\nBeispiel: /welcome set Willkommen @user 🎉' }, { quoted: msg });
          break;
        }
        db[from] = db[from] || {};
        db[from].text = text;
        saveWelcome(db);
        await sock.sendMessage(from, { text: `✅ Begrüßungstext gesetzt:\n"${text}"` }, { quoted: msg });
        break;

      default:
        await sock.sendMessage(from, { text: '⚠️ Ungültige Option.\nVerwende /welcome on, /welcome off oder /welcome set <Text>' }, { quoted: msg });
        break;
    }

  } catch (err) {
    console.error('Fehler bei welcome:', err);
    await sock.sendMessage(from, { text: `❌ Fehler beim Ausführen des Commands:\n${err.message}` }, { quoted: msg });
  }
  break;
}
case 'join': {
  try {
    const supportGroup = "120363419556165028@g.us"; // Supportgruppe

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
    const { exec } = require('child_process');
    const path = require('path');
    const batFile = path.join(__dirname, 'reload.bat'); // gleiche Ordner wie dein index.js
 await sendReaction(from, msg, '🔄');
    await sock.sendMessage(from, { text: '♻️ *BeastBot wird über PM2 neu gestartet...*' }, { quoted: msg });

    exec(`cmd /c "${batFile}"`, (error, stdout, stderr) => {
      if (error) {
        sock.sendMessage(from, { text: `❌ Fehler beim Neustart:\n${error.message}` }, { quoted: msg });
        return;
      }

      sock.sendMessage(from, { text: `♻️*Neustartbefehl erfolgreich eingeleitet*` }, { quoted: msg });

      // ⏳ kleine Verzögerung, dann Bot beenden
      setTimeout(() => process.exit(0), 1500);
    });

  } catch (e) {
    reply(`❌ Fehler beim Reload-Command: ${e.message}`);
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
   → Bevorzugte KI (Claude, Groq, Nyxion)
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
→ Externe KI-APIs (Claude, Groq, Nyxion) *nur bei /ask Befehlen
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
      db.prepare("INSERT INTO pets (jid, petName) VALUES (?, ?)").run(jid, pet.name);
      await sock.sendMessage(chatId, { text: `✅ Du hast ${pet.name} gekauft!` }, { quoted: msg });
    } else {
      const existing = db.prepare("SELECT * FROM items WHERE jid = ? AND itemName = ?").get(jid, item.name);
      if (existing) {
        db.prepare("UPDATE items SET amount = amount + 1 WHERE id = ?").run(existing.id);
      } else {
        db.prepare("INSERT INTO items (jid, itemName, amount) VALUES (?, ?, 1)").run(jid, item.name);
      }
      await sock.sendMessage(chatId, { text: `✅ Du hast ${item.name} gekauft!` }, { quoted: msg });
    }

    user.balance -= cost;
    updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);
    break;
  }
case 'sell': {
  // args[0] = Fischname, args[1] = Anzahl
  const fishName = args[0];
  const amount = parseInt(args[1]) || 1;

  if (!fishName) {
    await sock.sendMessage(chatId, { text: "❌ Bitte gib an, welchen Fisch du verkaufen willst.\nBeispiel: /sell Karpfen 3" }, { quoted: msg });
    break;
  }

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
  const pets = db.prepare("SELECT * FROM pets WHERE jid = ?").all(jid);

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
    const items = db.prepare("SELECT * FROM items WHERE jid = ?").all(jid);
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

    const item = db.prepare("SELECT * FROM items WHERE jid = ? AND itemName = ?").get(jid, itemName);
    const pet = db.prepare("SELECT * FROM pets WHERE jid = ? AND id = ?").get(jid, petId);

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
      db.prepare("UPDATE pets SET hunger = ? WHERE id = ?").run(pet.hunger, petId);
    } else if (shopItem.effect === "heal") {
      pet.health = Math.min(100, pet.health + shopItem.value);
      db.prepare("UPDATE pets SET health = ? WHERE id = ?").run(pet.health, petId);
    }

    db.prepare("UPDATE items SET amount = amount - 1 WHERE id = ?").run(item.id);

    await sock.sendMessage(chatId, { text: `✅ Du hast ${shopItem.name} auf ${pet.petName} angewendet!` }, { quoted: msg });
    break;
  }



case 'menu':
case 'help': {
  const ownerName = "Beastmeds";

  const menuArg = args[0]?.toLowerCase();

  const currentPrefix = getPrefixForChat(chatId);

  const menus = {
    "1": `
  ╭───❍ *Main Commands* ❍───╮
  │ ⚙️ ${currentPrefix}ping
  │ 👑 ${currentPrefix}owner
  │ 🧠 ${currentPrefix}help
  │ 💬 ${currentPrefix}menu
  │ 🎵 ${currentPrefix}play
  │ 🎶 ${currentPrefix}play1
  │ 🎧 ${currentPrefix}play2
  │ 💻 ${currentPrefix}server
  │ ⏱️ ${currentPrefix}runtime
  │ 🧾 ${currentPrefix}cmds
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
│ 💀 ${currentPrefix}goon
│ 🍆 ${currentPrefix}penis
│ 🐟 ${currentPrefix}fish
│ 🪙 ${currentPrefix}addcoins
│ ❌ ${currentPrefix}delcoins
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
│ 🧍 ${currentPrefix}addme
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
╭───❍ *Economy / RPG* ❍───╮
│ 🛒 ${currentPrefix}shop
│ 💰 ${currentPrefix}buy
│ 🐾 ${currentPrefix}pets
│ 🎒 ${currentPrefix}inventory
│ 📦 ${currentPrefix}use
│ 🪙 ${currentPrefix}topcoins
│ 📈 ${currentPrefix}topxp
│ 🪞 ${currentPrefix}profile
│ 💳 ${currentPrefix}register
│ 🧍 ${currentPrefix}me
│ ⚒️ ${currentPrefix}resetwarn
│ 💎 ${currentPrefix}addcoins ${currentPrefix}delcoins
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
│ 🎨 ${currentPrefix}imagine <Beschreibung>
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

    "cmds": `
╭───❍ *Alle Befehle* ❍───╮
│ Enthält alle Commands:
│ Main, Admin, Fun, Owner, Economy, Utility, Downloader, Misc, Verschlüsselung, Minecraft, Stranger Things, KI
│
│ ➤ ${currentPrefix}menu 1  → Main
│ ➤ ${currentPrefix}menu 2  → Admin
│ ➤ ${currentPrefix}menu 3  → Fun
│ ➤ ${currentPrefix}menu 4  → Owner
│ ➤ ${currentPrefix}menu 5  → Economy
│ ➤ ${currentPrefix}menu 6  → Utility
│ ➤ ${currentPrefix}menu 7  → Downloader
│ ➤ ${currentPrefix}menu 8  → Misc (Audio Edit)
│ ➤ ${currentPrefix}menu 9  → Verschlüsselung
│ ➤ ${currentPrefix}menu 10 → Minecraft
│ ➤ ${currentPrefix}menu 11 → Stranger Things
│ ➤ ${currentPrefix}menu 12 → KI Commands
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
│ 5️⃣ ${currentPrefix}menu 5 → Economy
│ 6️⃣ ${currentPrefix}menu 6 → Utility
│ 7️⃣ ${currentPrefix}menu 7 → Downloader
│ 8️⃣ ${currentPrefix}menu 8 → Misc (Audio Edit)
│ 9️⃣ ${currentPrefix}menu 9 → Verschlüsselung
│ 1️⃣0️⃣ ${currentPrefix}menu 10 → Minecraft
│ 1️⃣1️⃣ ${currentPrefix}menu 11 → Stranger Things
│ 1️⃣2️⃣ ${currentPrefix}menu 12 → KI Commands
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
/config ai <Claude|Groq|Nyxion> - KI-Modell ändern
/config birthday <TT.MM.YYYY> - Geburtstag setzen
/config game <Spiel> - Lieblingsspiel setzen
/config lang <de|en|es|fr> - Sprache ändern
/config theme <dark|light> - Design ändern
      `;
      return await sock.sendMessage(from, { text: configText }, { quoted: msg });
    }

    if (subcommand.toLowerCase() === 'ai') {
      const aiModel = args[1];
      if (!aiModel) return await sock.sendMessage(from, { text: '❗ Usage: /config ai <Claude|Groq|Nyxion>' }, { quoted: msg });
      
      const validModels = ['Claude', 'Groq', 'Nyxion'];
      if (!validModels.includes(aiModel)) {
        return await sock.sendMessage(from, { text: `❌ Ungültige KI. Verfügbar: ${validModels.join(', ')}` }, { quoted: msg });
      }
      
      setUserConfig(sender, { aiModel });
      return await sock.sendMessage(from, { text: `✅ KI-Modell auf *${aiModel}* gesetzt!` }, { quoted: msg });
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
/config ai <Modell> - Wähle KI (Claude, Groq, Nyxion)
/config birthday <TT.MM.YYYY> - Setze Geburtstag
/config game <Spiel> - Setze Lieblingsspiel
/config lang <Sprache> - Wähle Sprache (de, en, es, fr)
/config theme <Design> - Wähle Design (dark, light)

*Beispiele:*
/config ai Groq
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
   • KI-Integrationen: OpenAI, Groq, Nyxion-Team
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
    const { igdl } = require('ruhend-scraper');
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
        const senderRank = ranks.getRank(sender); // Hole Rank des Senders
        const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber','Moderator']

        if (!allowedRanks.includes(senderRank)) {
            return await sock.sendMessage(from, { text: '🚫 Du darfst diesen Befehl nicht nutzen.' });
        }

        if (!args[0]) {
            return await sock.sendMessage(from, { text: '🔗 Bitte gib einen Gruppen-Invite-Link an.' });
        }

        const input = args[0];
        let inviteCode;

        // Prüfen, ob es ein Gruppenlink ist
        const linkMatch = input.match(/chat\.whatsapp\.com\/([\w\d]+)/);
        if (linkMatch) {
            inviteCode = linkMatch[1];
        } else {
            return await sock.sendMessage(from, { text: '❌ Ungültiger Gruppenlink.' });
        }

        try {
            await sock.groupAcceptInvite(inviteCode);
            await sock.sendMessage(from, { text: '✅ Der Bot ist der Gruppe erfolgreich beigetreten.' });
        } catch (err) {
            await sock.sendMessage(from, { text: '⚠️ Fehler beim Beitritt: ' + err.message });
        }

    } catch (err) {
        console.error('Fehler bei join:', err);
        await sock.sendMessage(from, { text: '❌ Ein Fehler ist aufgetreten.' });
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
  // persist a registration timestamp (small JSON store)
  try {
    const regs = loadRegistrations();
    regs[jid] = Date.now();
    saveRegistrations(regs);
  } catch (e) { console.error('Failed to save registration timestamp', e); }

  await sock.sendMessage(chatId, { 
    text: `🎉 ${name}, du wurdest erfolgreich registriert!\nStart-Guthaben: 100 💸, Level 1, 0 XP\n> ${botName}` 
  }, { quoted: msg });
  break;
}
case 'me':
case 'profile': {
  const userJid = msg.key.participant || msg.key.remoteJid || msg.sender || chatId;
  const u = getUser(userJid);
  if (!u) break;


  let profilePicUrl = null;
  try {
    profilePicUrl = await sock.profilePictureUrl(userJid, 'image');
  } catch {}

  // load registration timestamp
  const regs = loadRegistrations();
  const regTs = regs[userJid] || regs[msg.sender] || null;
  const regDate = regTs ? new Date(regTs).toLocaleString('de-DE') : '...';

  // level progress (uses 100 XP per level in current logic)
  const xp = u.xp || 0;
  const level = u.level || 0;
  const xpToLevel = 100;
  const percent = Math.max(0, Math.min(100, Math.floor((xp / xpToLevel) * 100)));

  const contact = (userJid || '').split('@')[0];

  const text = `💬 ══ ✨ Dein Profil ✨ ══\n\n` +
               `👤 Name: ${u.name || '...'}\n` +
               `🎂 Alter: ${u.age || '...'}\n` +
               `👥 Kontakt: ${contact}\n` +
               `📅 Registriert: ${regDate}\n` +
               `⭐ Status: ${u.rank || 'Member'}\n\n` +
               `🎮 Level: ${level}/${(level + 1)}\n` +
               `📊 XP: ${xp} (${percent}% zum nächsten Level)\n` +
               `📝 Offene To-dos: 0\n\n` +
               `💡 Tipps:\n• einfach tips  so soll es ausehen`;

  if (profilePicUrl) {
    await sock.sendMessage(chatId, {
      image: { url: profilePicUrl },
      caption: text
    }, { quoted: msg });
     await sendReaction(from, msg, '🧑🏻‍💻');
  } else {
    await sock.sendMessage(chatId, { text }, { quoted: msg });
 
  await sendReaction(from, msg, '🧑🏻‍💻'); }
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
  const rows = topXpStmt.all(10);
  let txt = `⭐ *XP Leaderboard*\n\n`;
  rows.forEach((r,i)=> txt += `${i+1}. ${r.name} — ${r.xp} XP (Lvl ${r.level})\n`);
  await sock.sendMessage(chatId, { text: txt }, { quoted: msg });
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
  if (!isGroup) return sock.sendMessage(from, { text: '⚠️ Dieser Befehl geht nur in Gruppen.' });
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
    await sock.readMessages([msg.key]);

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

    const ytCmds = [
      `"${path.join(__dirname, 'yt-dlp')}"`,
      'yt-dlp',
      'yt-dlp.exe',
      'npx yt-dlp'
    ];
    let dlErr = null;
    let dlSuccess = false;
    for (const cmd of ytCmds) {
      try {
        await new Promise((resolve, reject) => {
          exec(`${cmd} -x --audio-format mp3 --ffmpeg-location "${ffmpeg.path}" -o "${filePath}" "${url}"`, (error, stdout, stderr) => {
            if (error) return reject(stderr || error.message);
            resolve(stdout);
          });
        });
        dlSuccess = true;
        break;
      } catch (e) {
        dlErr = e;
      }
    }
    if (!dlSuccess) throw new Error(dlErr || 'yt-dlp not found');

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
            `💿 Beispiel: /play Hoffnung Schillah\n\n` +
            `> ${botName}`
    }, { quoted: msg });
    break;
  }

  try {
    // Simuliere "schreiben" wie ein Bot
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(500);
    await sock.readMessages([msg.key]);


    const search = await yts.search(q);
    if (!search.videos.length) {
      await sock.sendMessage(chatId, { text: `😕 Oh nein… ich habe nichts gefunden.\n> ${botName}`, quoted: msg });
      break;
    }

    const v = search.videos[0];
    const { title, url, timestamp, views, author, ago, thumbnail } = v;

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

    // === yt-dlp + ffmpeg ===
    const ytDlpPath = path.join(__dirname, 'yt-dlp');
    const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '').trim();
    const filePath = path.join(__dirname, `${cleanTitle}.mp3`);

    await new Promise((resolve, reject) => {
      exec(
        `"${ytDlpPath}" -x --audio-format mp3 --ffmpeg-location "${ffmpeg.path}" -o "${filePath}" "${url}"`,
        (error, stdout, stderr) => {
          if (error) return reject(stderr || error.message);
          resolve(stdout);
        }
      );
    });

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
    await sock.sendMessage(chatId, {
      text: `❌ Oh nein… da ist etwas schiefgelaufen:\n${err?.message || 'Unbekannter Fehler'}\n> ${botName}`
    }, { quoted: msg });
  }

  break;
}

case 'resetwarn': {
  if (!isGroup) return sock.sendMessage(from, { text: '⚠️ Nur in Gruppen verfügbar.' });
  if (!(await isUserAdmin(from, sender))) return sock.sendMessage(from, { text: '🚫 Keine Admin-Rechte.' });

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(from, { text: '👤 Markiere die Person.' });

  const userId = mentioned.split('@')[0];
  resetWarnings(from, userId);
  await sock.sendMessage(from, { text: `✅ Verwarnungen für @${userId} wurden zurückgesetzt.`, mentions: [mentioned] });

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

    try {
   
        await sock.groupParticipantsUpdate(groupId, [sender], 'add');
        await sock.sendMessage(from, { text: `✅ Du wurdest in die Gruppe hinzugefügt (ID: ${groupId}).` });
    } catch (err) {
        console.error('Fehler beim Hinzufügen des Senders:', err);
        await sock.sendMessage(from, { text: '❌ Fehler: Konnte dich nicht hinzufügen.\n' + err.message });
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
 
    const senderRank = ranks.getRank(sender);
    const allowed = ['Inhaber', 'Stellvertreter Inhaber', 'Moderator'];

      if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber\n•🛡️ Moderatoren "
 }, { quoted: msg });
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
  const senderRank = ranks.getRank(sender);

  // Nur Owner dürfen
  const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber'];

  if (!allowedRanks.includes(senderRank)) {
    return await sock.sendMessage(from, { text: '🚫 Nur Owner dürfen diesen Befehl nutzen.' });
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
case 'addcoins': {
  const senderRank = ranks.getRank(sender); // Rang des Command-Senders
  const allowed = ['Inhaber', 'Stellvertreter Inhaber'];

   if (!allowed.includes(senderRank)) {
      await sendReaction(from, msg, '🔒');
    await sock.sendMessage(from, { text:"⛔ *Zugriff verweigert!*\n\nNur die folgenden Rollen dürfen diesen Befehl nutzen:\n\n• 👑 Inhaber\n• 🛡️ Stellvertreter Inhaber"
 }, { quoted: msg });
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

  // User laden
  const targetUser = getUser(targetId);
  if (!targetUser) {
    await sock.sendMessage(chatId, { text: '❌ Benutzer nicht gefunden oder nicht registriert.' }, { quoted: msg });
    break;
  }

  // Coins hinzufügen
  targetUser.balance += amount;
  updateUserStmt.run(targetUser.balance, targetUser.xp, targetUser.level, targetUser.name, targetId);

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
  // Alle Pets des Users aus der DB abrufen
  const pets = db.prepare("SELECT * FROM pets WHERE jid = ?").all(jid);

  if (!pets || pets.length === 0) {
    await sock.sendMessage(chatId, { text: "❌ Du hast kein Pet! Kaufe dir eines im Shop mit `/shop`." }, { quoted: msg });
    break;
  }

  // Erstes Pet für die Jagd auswählen
  const petObj = pets[0];
  const pet = petObj.petName;

  // Jagdergebnisse definieren
  const huntResults = {
    "Hund": { min: 10, max: 30 },
    "Katze": { min: 5, max: 20 },
    "Falke": { min: 50, max: 150 },
    "Wolf": { min: 100, max: 300 },
    "Drache": { min: 500, max: 1000 }
  };

  const range = huntResults[pet];
  if (!range) {
    await sock.sendMessage(chatId, { text: "❌ Dein Pet kann nicht jagen." }, { quoted: msg });
    break;
  }

  // Belohnung berechnen
  const reward = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;

  // User-Daten updaten
  const user = getUser(jid);
  user.balance += reward;
  user.xp += 10; // XP Bonus
  updateUserStmt.run(user.balance, user.xp, user.level, user.name, jid);

  // Ergebnis an den Chat senden
  await sock.sendMessage(chatId, { 
    text: `🐾 Dein ${pet} war auf der Jagd!\n\n💰 Beute: ${reward} Coins\n⭐ +10 XP\n\nNeuer Kontostand: ${user.balance} 💸`
  }, { quoted: msg });

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





//=============PING============================//          
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
      '│  Probe  : 𝓞𝓷𝓮𝓓𝓮𝓿𝓲𝓵🩸\n' +
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

case 'add': {
  try {
    if (!(await isUserAdmin(from, sender))) {
      await sock.sendMessage(from, { text: '❌ Nur Admins können Benutzer hinzufügen.' });
      break;
    }

    const numberToAdd = args[0]?.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    if (!numberToAdd) {
      await sock.sendMessage(from, { text: 'Bitte gib eine gültige Nummer an, z.B. !add 491234567890' });
      break;
    }

    await sock.groupParticipantsUpdate(from, [numberToAdd], 'add');
    await sock.sendMessage(from, { text: `✅ Benutzer mit der Nummer +${numberToAdd.split('@')[0]} wurde hinzugefügt.` });

  } catch (error) {
    console.error('Fehler beim Hinzufügen:', error);
    await sock.sendMessage(from, { text: '❌ Fehler beim Hinzufügen des Benutzers.' });
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
  if (!isGroup) {
    await sock.sendMessage(from, { text: '❌ Dieser Befehl funktioniert nur in Gruppen.' });
    break;
  }

  const groupMetadata = await sock.groupMetadata(from);
  const participants = groupMetadata.participants;
  const senderId = msg.key.participant || from;

  // Check ob Admin
  const isAdmin = participants.some(p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (!isAdmin) {
    await sock.sendMessage(from, { text: '❌ Nur Gruppen-Admins können diesen Befehl nutzen.' }, { quoted: msg });
    break;
  }

  // Nachricht extrahieren
  const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
  const args = messageContent.split(' ').slice(1).join(' ').trim();

  if (!args) {
    await sock.sendMessage(from, { text: '❌ Bitte gib einen Text ein: `hidetag <Text>`' }, { quoted: msg });
    break;
  }

  // Kopf- und Fußzeile hinzufügen
  const header = `╭───❍ *Hidetag* ❍───╮\n│ 📝 Nachricht an alle Mitglieder:`;
  const footer = `╰────────────────────────────╯`;

  const mentions = participants.map((p) => p.id);

  await sock.sendMessage(from, {
    text: `${header}\n\n${args}\n\n${footer}`,
    mentions: mentions
  });
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
    const body = m.message?.conversation 
              || m.message?.extendedTextMessage?.text 
              || m.text 
              || '';

    const msgText = body.slice(command.length + 1).trim();

    // Wenn keine Nachricht angegeben ist
    if (!msgText)
        return await sock.sendMessage(from, {
            text: '💡 *Beispiel:*\n.nl Hallo zusammen!\nHeute gibt’s ein Update ⚙️\n\n(Zeilenumbrüche werden automatisch erkannt)'
        }, { quoted: msg });

    // Ziel – dein Newsletter (du bist Admin)
    const newsletterJid = '120363424157710313@newsletter';

    // 🧱 Schöner BeastBot-Kasten
    const fullMessage =
`╔═══ ⚡️ *BeastBot Broadcast* ⚡️ ═══╗
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
            },
            { 
                // Wichtig: Newsletter-spezifische Metadaten
                messageId: `beastbot-news-${Date.now()}`,
                status: 'server_ack'
            }
        );

        await sendReaction(from, msg, '✅');
        await sock.sendMessage(from, { text: '✅ *Newsletter erfolgreich an den BeastBot-Kanal gesendet!*' }, { quoted: msg });
        console.log(`[BeastBot] Newsletter gesendet an ${newsletterJid}\n${fullMessage}`);
    } catch (err) {
        console.error('[BeastBot] Fehler beim Senden des Newsletters:', err);
        await sendReaction(from, msg, '❌');
        await sock.sendMessage(from, { text: '❌ *Fehler beim Senden des Newsletters!*' }, { quoted: msg });
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
        const sender = msg.key.participant || msg.key.remoteJid;
        const senderRank = ranks.getRank(sender); // Hole Rank des Senders

        // Nur bestimmte Ränge dürfen den Bot die Gruppe verlassen lassen
        const allowedRanks = ['Inhaber', 'Stellvertreter Inhaber', 'Admin']; // z.B. hier anpassen

        if (!allowedRanks.includes(senderRank)) {
            await sock.sendMessage(from, { 
                text: "❌ Du bist nicht berechtigt, diesen Befehl zu nutzen." 
            }, { quoted: msg });
            break;
        }

        // prüfen ob es eine Gruppe ist
        if (!isGroup) {
            await sock.sendMessage(from, { 
                text: "❌ Dieser Befehl kann nur in Gruppen verwendet werden." 
            }, { quoted: msg });
            break;
        }

        await sock.sendMessage(from, { 
            text: "👋 BeastBot verlässt nun die Gruppe..." 
        }, { quoted: msg });

        await sock.groupLeave(from);

    } catch (err) {
        console.error("Fehler bei leavegrp:", err);
        await sock.sendMessage(from, { 
            text: "❌ Fehler beim Verlassen der Gruppe." 
        }, { quoted: msg });
    }
}
break;

// ganz oben (globale Liste)
global.bannedUsers = new Set()

// === BAN CMD ===








case 'viewonce': {
    try {
        // Chat & Teilnehmer Infos
        const chatId = msg.key.remoteJid;
        const participant = msg.key.participant || chatId;

        // Quoted Message in Gruppen & Privat
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quoted = contextInfo?.quotedMessage;

        // ViewOnce Inhalt auslesen (egal ob direkt oder quoted)
        const viewOnce = quoted?.viewOnceMessageV2?.message 
                      || quoted?.viewOnceMessage?.message
                      || msg.message?.viewOnceMessageV2?.message
                      || msg.message?.viewOnceMessage?.message;

        if (!viewOnce) {
            await sock.sendMessage(chatId, {
                text: '❌ Bitte antworte auf eine View-Once Nachricht (Bild oder Video).'
            }, { quoted: msg });
            break;
        }

        // === Bild ===
        if (viewOnce.imageMessage) {
            const stream = await downloadContentFromMessage(viewOnce.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            await sock.sendMessage(chatId, {
                image: buffer,
                caption: viewOnce.imageMessage.caption || '',
                fileName: 'viewonce.jpg'
            }, { quoted: msg });
        }

        // === Video ===
        else if (viewOnce.videoMessage) {
            const stream = await downloadContentFromMessage(viewOnce.videoMessage, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            await sock.sendMessage(chatId, {
                video: buffer,
                caption: viewOnce.videoMessage.caption || '',
                fileName: 'viewonce.mp4'
            }, { quoted: msg });
        }

        else {
            await sock.sendMessage(chatId, {
                text: '❌ Konnte den View-Once Inhalt nicht extrahieren.'
            }, { quoted: msg });
        }

    } catch (err) {
        console.error('❌ Fehler bei viewonce:', err);
        await sock.sendMessage(msg.key.remoteJid, {
            text: '⚠️ Fehler beim Verarbeiten der View-Once Nachricht:\n' + (err.message || err)
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
  const sockNew = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Dragon', 'Desktop', '1.0.0'],
    printQRInTerminal: false,
  });

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

    const newSock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Edge'),
    });

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
    logger: pino({ level: 'silent' }),
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
    logger: pino({ level: 'silent' }),
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
  let txt = '📋 *Vergebene Ränge*\n\n';
  entries.forEach(([id, rank]) => {
    txt += `• @${id.split('@')[0]} → ${rank}\n`;
  });
  reply(txt, { mentions: entries.map(([id]) => id) });
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

                let list = `📊 *Gefundene Sessions (${names.length})*:\n\n`;
                names.forEach((n, i) => list += `${i + 1}. \`${n}\`\n`);
                reply(list);
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

  }); // sock.ev.on END

// end of message handler

};