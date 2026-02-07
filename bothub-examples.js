#!/usr/bin/env node
/**
 * BotHub API Integration - Quick Start
 * 
 * Diese Datei zeigt die wichtigsten Funktionen auf einem Blick
 */

const bothub = require('./lib/bothub');

// ============================================
// 1. AUTHENTIFIZIERUNG
// ============================================
async function example_authenticate() {
  const botInfo = await bothub.authenticate();
  console.log('Bot Info:', botInfo);
}

// ============================================
// 2. SESSIONS VERWALTEN
// ============================================
async function example_session_management() {
  // Session hinzufügen
  await bothub.addSession('MySession', 
    ['+491234567890'],  // Telefonnummern
    ['lid_abc123']      // LIDs
  );

  // Alle Nummern auflisten
  const numbers = await bothub.listNumbers();
  console.log('Sessions:', numbers);

  // Session entfernen
  // await bothub.removeSession('MySession');
}

// ============================================
// 3. STATISTIKEN AKTUALISIEREN
// ============================================
async function example_stats() {
  await bothub.updateStats({
    userCount: 150,
    groupCount: 5,
    commandCount: 750,
    version: '1.0.0'
  });
}

// ============================================
// 4. NUMMER PRÜFEN
// ============================================
async function example_check_number() {
  const result = await bothub.checkNumber('+1234567890');
  if (result.isBot) {
    console.log(`✅ Ist ein Bot! Session: ${result.session}`);
  } else {
    console.log('❌ Kein Bot');
  }
}

// ============================================
// 5. HEARTBEAT (wird automatisch gesendet!)
// ============================================
async function example_heartbeat() {
  // Wird automatisch alle 2 Minuten gesendet
  // Manuell senden:
  await bothub.sendHeartbeat();
}

// ============================================
// 6. VOLLSTÄNDIGE INITIALISIERUNG
// ============================================
async function example_full_init() {
  await bothub.init({
    apiToken: 'your_token_here',
    sessions: {
      'session1': {
        numbers: ['+491234567890'],
        lids: ['lid_abc']
      }
    },
    heartbeatIntervalMs: 120000  // 2 Minuten
  });
}

// ============================================
// VERWENDUNG IN DEINEN COMMAND-HANDLERN
// ============================================

// Beispiel Command Handler
async function handleMyCommand(sock, msg) {
  const from = msg.key.remoteJid;
  
  try {
    // Nutze BotHub APIs hier
    await bothub.updateStats({
      userCount: 150,
      groupCount: 5,
      commandCount: 750
    });
    
    await sock.sendMessage(from, { 
      text: '✅ Statistiken aktualisiert!' 
    });
  } catch (err) {
    console.error('Fehler:', err.message);
    await sock.sendMessage(from, { 
      text: '❌ Fehler beim Update!' 
    });
  }
}

// ============================================
// MODULE EXPORTS
// ============================================
module.exports = {
  example_authenticate,
  example_session_management,
  example_stats,
  example_check_number,
  example_heartbeat,
  example_full_init,
  handleMyCommand
};

console.log(`
✅ BotHub API Integration erfolgreich eingebunden!

📚 Verfügbare Funktionen in 'lib/bothub.js':
  • authenticate()           - Bot authentifizieren
  • syncSessions(sessions)   - Sessions synchronisieren
  • addSession(name, numbers, lids)    - Session hinzufügen
  • removeSession(name)      - Session entfernen
  • listNumbers()            - Alle Nummern auflisten
  • checkNumber(number)      - Nummer prüfen
  • updateStats(stats)       - Statistiken aktualisieren
  • sendHeartbeat()          - Heartbeat senden
  • startHeartbeat(ms)       - Heartbeat-Loop starten
  • stopHeartbeat()          - Heartbeat-Loop stoppen
  • init(options)            - Alles initialisieren

📖 Mehr Infos: BOTHUB_API_GUIDE.md
🧪 Tests: node test-bothub.js
`);
