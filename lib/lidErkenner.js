// lib/lidErkenner.js
const fs = require('fs');
const path = require('path');

const LID_DB_FILE = './datenbank/lid_datenbank.json';

// 🔹 Ordner erstellen
[ './datenbank' ].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(LID_DB_FILE)) fs.writeFileSync(LID_DB_FILE, '{}');

// 🔹 LID aus JID ziehen (echt!)
function extractLidFromJid(jid) {
  if (!jid) return null;
  const cleanJid = jid.replace(/:.+/, ''); // Entferne Device-ID
  const parts = cleanJid.split('@')[0].split(':'); // z. B. "49123456789:9876543210"
  return parts.length > 1 ? parts[1] : null; // LID ist der zweite Teil
}

// 🔹 LID-Datenbank laden
function readLidDb() {
  try {
    return JSON.parse(fs.readFileSync(LID_DB_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

// 🔹 LID-Datenbank speichern
function writeLidDb(data) {
  fs.writeFileSync(LID_DB_FILE, JSON.stringify(data, null, 2));
}

// 🔹 LID für JID speichern
function saveLidForJid(jid, lid, name = 'Unbekannt') {
  const db = readLidDb();
  const cleanJid = jid.replace(/:.+/, '');
  db[cleanJid] = { jid: cleanJid, lid, name, ts: Date.now() };
  writeLidDb(db);
}

// 🔹 LID für JID abrufen
function getLidForJid(jid) {
  const db = readLidDb();
  const cleanJid = jid.replace(/:.+/, '');
  return db[cleanJid]?.lid || null;
}

module.exports = {
  extractLidFromJid,
  saveLidForJid,
  getLidForJid,
  readLidDb,
  writeLidDb
};