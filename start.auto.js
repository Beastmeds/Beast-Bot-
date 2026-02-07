#!/usr/bin/env node

/**
 * Beast Bot Starter (Non-Interactive)
 * 
 * Starts Beast Bot with the first available session
 * Use this if you want non-interactive startup
 */

const fs = require('fs');
const path = require('path');

console.log('\n🤖 Beast Bot Starting (Non-Interactive Mode)...\n');

// Check if sessions exist
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
  console.log('⚠️  No sessions found. Creating sessions directory...');
  console.log('📱 Next time you run npm start, use option [n] to create a new session.\n');
  process.exit(0);
}

const sessions = fs.readdirSync(sessionsDir).filter(f => 
  fs.statSync(path.join(sessionsDir, f)).isDirectory()
);

if (sessions.length === 0) {
  console.log('⚠️  No sessions found in ./sessions/');
  console.log('📝 To create a session:');
  console.log('   1. Run: npm start');
  console.log('   2. Select: [n] Neue Session starten\n');
  process.exit(0);
}

console.log(`✅ Found ${sessions.length} session(s): ${sessions.join(', ')}\n`);
console.log(`📱 Starting with first session: ${sessions[0]}\n`);

// Pass first session as argument to index.js
process.argv.push(sessions[0]);
require('./index.js');
