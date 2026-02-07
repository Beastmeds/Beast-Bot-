#!/usr/bin/env node

/**
 * 🤖 Beast Bot - Startup Guide
 * 
 * Dieses Script zeigt die verschiedenen Startup-Optionen
 */

const pkg = require('./package.json');

console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                   🤖 BEAST BOT - STARTUP OPTIONEN 🤖                     ║
╚═══════════════════════════════════════════════════════════════════════════╝

📋 VERFÜGBARE NPM COMMANDS:

1️⃣  npm start
    ├─ Startet den Bot INTERAKTIV
    ├─ Du wählst eine Session aus
    ├─ Neue Sessions können erstellt werden
    └─ Perfekt für Setup & Session Management
    
    Command:
    $ npm start
    
    Dann wählst du:
    [1] Beast Bot           ← Erste Session (wenn vorhanden)
    [a] Alle Sessions starten
    [n] Neue Session starten

═══════════════════════════════════════════════════════════════════════════════

2️⃣  npm run start:auto
    ├─ Startet den Bot AUTOMATISCH
    ├─ Nutzt die erste verfügbare Session
    ├─ Keine Eingabe erforderlich
    └─ Perfekt für Production/Automation
    
    Command:
    $ npm run start:auto

═══════════════════════════════════════════════════════════════════════════════

3️⃣  npm run dev
    ├─ Alias für npm start
    ├─ Interaktiv wie "start"
    └─ Schneller zu tippen
    
    Command:
    $ npm run dev

═══════════════════════════════════════════════════════════════════════════════

4️⃣  npm test
    ├─ Führt BotHub API Tests durch
    ├─ Prüft Authentifizierung
    ├─ Testet Heartbeat & Stats
    └─ Gibt Feedback über API Status
    
    Command:
    $ npm test

═══════════════════════════════════════════════════════════════════════════════

5️⃣  npm run check
    ├─ Prüft Setup/Installation
    ├─ Validiert alle Dateien
    ├─ Testet Dependencies
    └─ Gibt Statusbericht
    
    Command:
    $ npm run check

═══════════════════════════════════════════════════════════════════════════════

🎯 EMPFOHLEN:

Für ersten Start (Setup):
  $ npm start
  → Wähle [n] für neue Session oder [1] für bestehende

Für normalen Betrieb:
  $ npm run start:auto
  → Bot läuft ohne Eingabe

Für Testing/Debugging:
  $ npm test
  $ npm run check

═══════════════════════════════════════════════════════════════════════════════

❓ FRAGEN & ANTWORTEN:

F: Was bedeutet "nichts passiert" bei npm start?
A: Der Bot STARTET, aber wartet auf deine Eingabe (Session Auswahl)
   Tippe "1" und drücke Enter oder nutze "npm run start:auto"

F: Wie starte ich den Bot ohne Eingabe?
A: npm run start:auto
   Das startet automatisch die erste Session

F: Wie teste ich die API?
A: npm test
   Das prüft alle BotHub API Endpoints

F: Wie prüfe ich, dass alles richtig installiert ist?
A: npm run check
   Das gibt einen detaillierten Status

═══════════════════════════════════════════════════════════════════════════════

🚀 QUICK START:

Erste Session erstellen:
  $ npm start
  → Wähle: [n]
  → Scanne QR-Code
  
Bot dann starten:
  $ npm run start:auto
  
Tests durchführen:
  $ npm test

═══════════════════════════════════════════════════════════════════════════════

💡 TIPPS:

• Der Bot lädt BotHub Integration automatisch
• Heartbeat sendet sich automatisch alle 2 Minuten
• Bei Fehlern siehe logs in der Konsole
• npm run check prüft alle Requirements

═══════════════════════════════════════════════════════════════════════════════
`);
