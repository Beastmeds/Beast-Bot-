/* Bothub / GameBot API helper
   - Reads API token from process.env.BOTHUB_API_TOKEN or ../botConfig.json
   - Exports functions for authenticate, session management, stats and heartbeat
*/
const axios = require('axios');

const botConfig = (() => {
  try { return require('../botConfig.json'); } catch (e) { return {}; }
})();

let API_TOKEN = process.env.BOTHUB_API_TOKEN || botConfig.BOTHUB_API_TOKEN || botConfig.bothubApiToken || '';
const BASE_URL = 'https://bothub.gamebot.me/api/botapi';
let authenticated = false;

function getHeaders() {
  return {
    Authorization: `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

async function authenticate() {
  if (!API_TOKEN) throw new Error('BOTHUB API token not set (set process.env.BOTHUB_API_TOKEN or add to botConfig.json)');
  try {
    const response = await axios.post(`${BASE_URL}/auth`, {}, { headers: getHeaders(), timeout: 5000 });
    authenticated = true;
    console.log('✅ Bothub — Bot erfolgreich authentifiziert:', response.data.bot?.name || 'Unknown');
    return response.data.bot;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    if (err.code !== 'ECONNABORTED' && !errMsg.includes('404')) {
      console.warn('⚠️ Bothub Authentifizierung fehlgeschlagen (nicht kritisch)');
    }
    throw err;
  }
}

async function syncSessions(sessions) {
  try {
    const response = await axios.post(`${BASE_URL}/numbers/sync`, { sessions }, { headers: getHeaders() });
    console.log('✅ Bothub — Sessions synchronisiert:', response.data.message);
    return response.data;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error('❌ Bothub Session-Sync fehlgeschlagen:', errMsg);
    throw err;
  }
}

async function addSession(sessionName, numbers = [], lids = []) {
  try {
    const response = await axios.post(`${BASE_URL}/numbers/add`, { session: sessionName, numbers, lids }, { headers: getHeaders() });
    console.log('✅ Bothub — Session hinzugefügt:', response.data.message);
    return response.data;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error('❌ Bothub addSession fehlgeschlagen:', errMsg);
    throw err;
  }
}

async function removeSession(sessionName) {
  try {
    const response = await axios.delete(`${BASE_URL}/numbers/remove`, { headers: getHeaders(), data: { session: sessionName } });
    console.log('✅ Bothub — Session entfernt:', response.data.message);
    return response.data;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error('❌ Bothub removeSession fehlgeschlagen:', errMsg);
    throw err;
  }
}

async function listNumbers() {
  try {
    const response = await axios.get(`${BASE_URL}/numbers/list`, { headers: getHeaders() });
    console.log('✅ Bothub — Nummern abgerufen:', response.data.numbers?.length || 0, 'Sessions');
    return response.data.numbers;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error('❌ Bothub listNumbers fehlgeschlagen:', errMsg);
    throw err;
  }
}

async function checkNumber(phoneNumber) {
  try {
    const response = await axios.post(`${BASE_URL}/numbers/check`, { phoneNumber }, { headers: getHeaders() });
    console.log('✅ Bothub — Nummern-Check:', response.data.isBot ? 'Ist ein Bot' : 'Kein Bot', 'Session:', response.data.session || 'N/A');
    return response.data;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error('❌ Bothub checkNumber fehlgeschlagen:', errMsg);
    throw err;
  }
}

async function updateStats(stats = {}) {
  try {
    const response = await axios.post(`${BASE_URL}/stats/update`, stats, { headers: getHeaders() });
    console.log('✅ Bothub — Statistiken aktualisiert:', response.data.message);
    return response.data;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error('❌ Bothub updateStats fehlgeschlagen:', errMsg);
    throw err;
  }
}

async function sendHeartbeat() {
  try {
    await axios.post(`${BASE_URL}/heartbeat`, {}, { headers: getHeaders() });
    console.log('💓 Bothub Heartbeat gesendet');
  } catch (err) {
    console.error('❌ Bothub Heartbeat-Fehler:', err.message);
  }
}

let heartbeatTimer = null;
function startHeartbeat(intervalMs = 120000) {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  console.log(`⏱️ Bothub Heartbeat gestartet (Intervall: ${intervalMs}ms)`);
  heartbeatTimer = setInterval(() => { sendHeartbeat(); }, intervalMs);
  return heartbeatTimer;
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    console.log('⏹️ Bothub Heartbeat gestoppt');
  }
  heartbeatTimer = null;
}

async function init(options = {}) {
  try {
    if (options.apiToken) API_TOKEN = options.apiToken;
    if (!API_TOKEN) {
      console.warn('⚠️ Bothub API Token nicht gesetzt! Überspringe Initialisierung.');
      return;
    }
    console.log('🔧 Starte Bothub-Initialisierung...');
    try {
      await authenticate();
      if (options.sessions) await syncSessions(options.sessions);
      console.log('✅ Bothub erfolgreich verbunden');
    } catch (authErr) {
      console.warn('⚠️ Bothub nicht erreichbar, aber Bot läuft trotzdem');
      console.warn('   (Fehler: ' + authErr.message + ')');
    }
    startHeartbeat(options.heartbeatIntervalMs || 120000);
    console.log('✅ Bothub Heartbeat aktiv');
  } catch (err) {
    console.error('❌ Bothub Fehler:', err.message);
  }
}

module.exports = {
  setToken: (token) => { API_TOKEN = token; },
  authenticate,
  syncSessions,
  addSession,
  removeSession,
  listNumbers,
  checkNumber,
  updateStats,
  sendHeartbeat,
  startHeartbeat,
  stopHeartbeat,
  init
};
