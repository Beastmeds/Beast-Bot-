#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const usersJsonPath = path.join(__dirname, 'data', 'users.json');

console.log('📝 Test: Ändere Coins und XP in users.json...\n');

// Lese aktuelle Daten
const users = JSON.parse(fs.readFileSync(usersJsonPath, 'utf-8'));

// Finde ersten User
const firstJid = Object.keys(users)[0];
const user = users[firstJid];

if (!user) {
  console.log('❌ Keine User gefunden');
  process.exit(1);
}

console.log(`👤 Bearbeiteter User: ${user.name}`);
console.log(`   Alte Coins: ${user.balance}`);
console.log(`   Alte XP: ${user.xp}\n`);

// Ändere Werte
user.balance = Math.floor(Math.random() * 10000);
user.xp = Math.floor(Math.random() * 500);
user.lastUpdated = new Date().toISOString();

// Speichere Änderungen
fs.writeFileSync(usersJsonPath, JSON.stringify(users, null, 2), 'utf-8');

console.log(`✅ Neue Coins: ${user.balance}`);
console.log(`✅ Neue XP: ${user.xp}\n`);

console.log('⏳ Der Bot synchronisiert die Änderungen automatisch in die Datenbank!');
console.log('   (Warte auf die Meldung "🔄 Syncing changes" im Bot-Log)\n');
