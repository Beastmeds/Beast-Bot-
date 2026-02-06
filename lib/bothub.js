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

function getHeaders() {
  return {
    Authorization: `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

async function authenticate() {
  if (!API_TOKEN) throw new Error('BOTHUB API token not set (set process.env.BOTHUB_API_TOKEN or add to botConfig.json)');
  const response = await axios.post(`${BASE_URL}/auth`, {}, { headers: getHeaders() });
  console.log('Bothub — Bot Info:', response.data.bot);
  return response.data.bot;
}

async function syncSessions(sessions) {
  const response = await axios.post(`${BASE_URL}/numbers/sync`, { sessions }, { headers: getHeaders() });
  console.log('Bothub:', response.data.message);
  return response.data;
}

async function addSession(sessionName, numbers = [], lids = []) {
  const response = await axios.post(`${BASE_URL}/numbers/add`, { session: sessionName, numbers, lids }, { headers: getHeaders() });
  console.log('Bothub:', response.data.message);
  return response.data;
}

async function removeSession(sessionName) {
  const response = await axios.delete(`${BASE_URL}/numbers/remove`, { headers: getHeaders(), data: { session: sessionName } });
  console.log('Bothub:', response.data.message);
  return response.data;
}

async function listNumbers() {
  const response = await axios.get(`${BASE_URL}/numbers/list`, { headers: getHeaders() });
  console.log('Bothub — Registered Numbers:', response.data.numbers);
  return response.data.numbers;
}

async function checkNumber(phoneNumber) {
  const response = await axios.post(`${BASE_URL}/numbers/check`, { phoneNumber }, { headers: getHeaders() });
  console.log('Bothub — Is Bot:', response.data.isBot, 'Session:', response.data.session);
  return response.data;
}

async function updateStats(stats = {}) {
  const response = await axios.post(`${BASE_URL}/stats/update`, stats, { headers: getHeaders() });
  console.log('Bothub:', response.data.message);
  return response.data;
}

async function sendHeartbeat() {
  try {
    await axios.post(`${BASE_URL}/heartbeat`, {}, { headers: getHeaders() });
  } catch (err) {
    console.error('Bothub heartbeat error:', err.message);
  }
}

let heartbeatTimer = null;
function startHeartbeat(intervalMs = 120000) {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => { sendHeartbeat(); }, intervalMs);
  return heartbeatTimer;
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function init(options = {}) {
  if (options.apiToken) API_TOKEN = options.apiToken;
  await authenticate();
  if (options.sessions) await syncSessions(options.sessions);
  startHeartbeat(options.heartbeatIntervalMs || 120000);
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
