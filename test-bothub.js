#!/usr/bin/env node

/**
 * BotHub API Integration Test Script
 * Testet die Verbindung zur BotHub API
 */

const bothub = require('./lib/bothub');

async function runTests() {
  console.log('🧪 Starte BotHub API Tests...\n');

  try {
    // Test 1: Authentifizierung
    console.log('1️⃣ Test: Authentifizierung');
    const botInfo = await bothub.authenticate();
    console.log('✅ Authentifizierung erfolgreich\n');

    // Test 2: Heartbeat
    console.log('2️⃣ Test: Heartbeat senden');
    await bothub.sendHeartbeat();
    console.log('✅ Heartbeat erfolgreich gesendet\n');

    // Test 3: Nummern auflisten
    console.log('3️⃣ Test: Nummern auflisten');
    const numbers = await bothub.listNumbers();
    console.log(`✅ ${numbers?.length || 0} Nummern/Sessions gefunden\n`);

    // Test 4: Session hinzufügen (optional)
    console.log('4️⃣ Test: Neue Session hinzufügen');
    // await bothub.addSession('TestSession', ['+491234567890'], ['lid_test']);
    console.log('⏭️ Übersprungen (manuell starten wenn nötig)\n');

    // Test 5: Stats aktualisieren
    console.log('5️⃣ Test: Statistiken aktualisieren');
    await bothub.updateStats({
      userCount: 0,
      groupCount: 0,
      commandCount: 0,
      version: '1.0.0'
    });
    console.log('✅ Statistiken aktualisiert\n');

    console.log('✨ Alle Tests abgeschlossen!');
    process.exit(0);

  } catch (err) {
    console.error('❌ Fehler während Tests:', err.message);
    process.exit(1);
  }
}

runTests();
