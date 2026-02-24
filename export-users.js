#!/usr/bin/env node

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'stormbot_users.db');
const usersJsonPath = path.join(__dirname, 'data', 'users.json');

try {
  const db = new Database(dbPath);
  
  // Alle User aus der Datenbank auslesen
  const users = db.prepare('SELECT * FROM users').all();
  
  if (!users || users.length === 0) {
    console.log('❌ Keine User in der Datenbank gefunden.');
    db.close();
    process.exit(1);
  }
  
  // In JSON-Format umwandeln
  const usersData = {};
  users.forEach(user => {
    usersData[user.jid] = {
      jid: user.jid,
      name: user.name || user.jid.split('@')[0],
      balance: user.balance || 0,
      xp: user.xp || 0,
      level: user.level || 1,
      lastUpdated: new Date().toISOString()
    };
  });
  
  // In JSON-Datei speichern
  fs.writeFileSync(usersJsonPath, JSON.stringify(usersData, null, 2), 'utf-8');
  
  console.log(`✅ ${users.length} User erfolgreich exportiert!`);
  console.log(`📄 Gespeichert in: ${usersJsonPath}`);
  
  db.close();
  process.exit(0);
} catch (err) {
  console.error('❌ Fehler beim Export:', err.message);
  process.exit(1);
}
