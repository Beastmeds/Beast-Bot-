const fs = require('fs');
const path = require('path');

const ranksFile = path.join(__dirname, 'userRanks.json');

// Datei initialisieren, falls sie nicht existiert
if (!fs.existsSync(ranksFile)) {
  fs.writeFileSync(ranksFile, JSON.stringify({}, null, 2));
}

function loadRanks() {
  return JSON.parse(fs.readFileSync(ranksFile));
}

function saveRanks(data) {
  fs.writeFileSync(ranksFile, JSON.stringify(data, null, 2));
}

module.exports = {
  setRank(userId, rank) {
    const data = loadRanks();
    data[userId] = rank;
    saveRanks(data);
  },

  getRank(userId) {
    const data = loadRanks();
    if (!userId) return null;

    // Exact match first
    if (data[userId]) return data[userId];

    // Split local part (numeric id) from any suffix
    const local = userId.includes('@') ? userId.split('@')[0] : userId;

    // If sender is a @lid, prefer @lid entries only, then plain numeric key
    if (userId.endsWith('@lid')) {
      if (data[local + '@lid']) return data[local + '@lid'];
      if (data[local]) return data[local];
      return null;
    }

    // For non-@lid senders: match by numeric id or by @s.whatsapp.net, but do NOT use @lid entries
    if (data[local]) return data[local];
    if (data[local + '@s.whatsapp.net']) return data[local + '@s.whatsapp.net'];

    return null;
  },

  delRank(userId) {
    const data = loadRanks();
    delete data[userId];
    saveRanks(data);
  },

  list() {
    return loadRanks();
  }
};
