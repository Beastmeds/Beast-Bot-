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
    // Versuche mit der exakten userId
    if (data[userId]) return data[userId];
    
    // Wenn userId mit @s.whatsapp.net endet, versuche ohne Suffix
    if (userId && userId.endsWith('@s.whatsapp.net')) {
      const userIdWithoutSuffix = userId.replace('@s.whatsapp.net', '');
      if (data[userIdWithoutSuffix]) return data[userIdWithoutSuffix];
    }
    
    // Wenn userId nur die Nummer ist, versuche mit @s.whatsapp.net
    if (userId && !userId.includes('@')) {
      const userIdWithSuffix = userId + '@s.whatsapp.net';
      if (data[userIdWithSuffix]) return data[userIdWithSuffix];
    }
    
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
