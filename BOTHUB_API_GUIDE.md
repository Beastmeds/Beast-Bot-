# 🤖 BotHub API Integration Guide

## ✅ Status
Die BotHub API Integration wurde erfolgreich in deinen Beast Bot integriert!

## 📋 Übersicht

Die BotHub API ermöglicht es deinem Beast Bot, sich mit der BotHub-Plattform zu verbinden und Statistiken zu synchronisieren. Folgende Funktionen sind verfügbar:

### ✨ Features
- ✅ **Bot-Authentifizierung** - Authentifiziere deinen Bot mit dem API Token
- ✅ **Session Management** - Verwalte deine WhatsApp Sessions (Nummern & LIDs)
- ✅ **Heartbeat System** - Halte deinen Bot als "online" gekennzeichnet (alle 2 Minuten)
- ✅ **Statistiken** - Aktualisiere Bot-Statistiken (User, Gruppen, Commands)
- ✅ **Nummer-Prüfung** - Prüfe ob eine Nummer zu deinem Bot gehört

---

## 🔑 API Token & Konfiguration

### API Token
```
api_BotHub_37_1768129571193_c878cc6ad311523598adf74ebeecc1cadef6b3a87841f7ee87c013e4b0a60671
```

### Konfiguration (botConfig.json)
```json
{
  "BOTHUB_API_TOKEN": "api_BotHub_37_1768129571193_c878cc6ad311523598adf74ebeecc1cadef6b3a87841f7ee87c013e4b0a60671",
  "botName": "Beast Bot",
  "sessions": {
    "Beast Bot": {
      "numbers": ["+49"],
      "lids": []
    }
  },
  "heartbeatInterval": 120000
}
```

---

## 🚀 Automatische Integration

### Beim Bot-Start
Der Bot initialisiert die BotHub API **automatisch** beim Starten:

```javascript
// In index.js
const bothub = require('./lib/bothub');
process.env.BOTHUB_API_TOKEN = process.env.BOTHUB_API_TOKEN || 'api_BotHub_...';
bothub.init().catch(err => console.error('Bothub init failed:', err.message));
```

**Was beim Start passiert:**
1. ✅ Bot authentifiziert sich mit der BotHub API
2. ✅ Heartbeat wird alle 2 Minuten gesendet (hält Bot als "online")
3. ✅ Bot-Statistiken werden aktualisiert

### Heartbeat-Mechanismus
- **Interval:** 120 Sekunden (2 Minuten) - **EMPFOHLEN**
- **Mindestanforderung:** Alle 5 Minuten
- **Ohne Heartbeat:** Bot wird als OFFLINE markiert

---

## 📡 API Endpoints

### Base URL
```
https://bothub.gamebot.me/api/botapi
```

### 1. POST `/auth`
**Authentifiziere deinen Bot**

```javascript
const botInfo = await bothub.authenticate();
// Rückgabe: { name, status, version, ... }
```

### 2. POST `/numbers/sync`
**Synchronisiere alle Sessions mit Nummern & LIDs**

```javascript
await bothub.syncSessions({
  'session1': {
    numbers: ['+491234567890'],
    lids: ['lid_abc123']
  },
  'session2': {
    numbers: ['+491234567891'],
    lids: ['lid_def456']
  }
});
```

### 3. POST `/numbers/add`
**Füge eine Session hinzu oder aktualisiere sie**

```javascript
await bothub.addSession('MySession', ['+491234567890'], ['lid_xyz']);
```

### 4. DELETE `/numbers/remove`
**Entferne eine komplette Session**

```javascript
await bothub.removeSession('MySession');
```

### 5. GET `/numbers/list`
**Rufe alle registrierten Nummern ab**

```javascript
const numbers = await bothub.listNumbers();
// Rückgabe: [ { session, numbers, lids }, ... ]
```

### 6. POST `/numbers/check`
**Prüfe ob eine Nummer zu deinem Bot gehört**

```javascript
const result = await bothub.checkNumber('+1234567890');
// Rückgabe: { isBot: true/false, session: 'name' }
```

### 7. POST `/stats/update`
**Aktualisiere Bot-Statistiken**

```javascript
await bothub.updateStats({
  userCount: 1500,
  groupCount: 42,
  commandCount: 8500,
  version: '1.0.0'
});
```

### 8. POST `/heartbeat`
**Sende einen Heartbeat** (wird automatisch alle 2 Min gesendet)

```javascript
await bothub.sendHeartbeat();
```

---

## 💻 Manuelle API-Nutzung

### In deinen Command-Handlern

```javascript
const bothub = require('./lib/bothub');

// Beispiel: Command um Stats zu aktualisieren
async function handleUpdateStatsCommand() {
  try {
    await bothub.updateStats({
      userCount: 150,
      groupCount: 5,
      commandCount: 750,
      version: '1.0.0'
    });
  } catch (err) {
    console.error('Fehler beim Update:', err.message);
  }
}

// Beispiel: Prüfe ob Nummer ein Bot ist
async function handleCheckBotCommand(phoneNumber) {
  try {
    const result = await bothub.checkNumber(phoneNumber);
    if (result.isBot) {
      console.log(`✅ ${phoneNumber} ist ein Bot! Session: ${result.session}`);
    } else {
      console.log(`❌ ${phoneNumber} ist kein Bot`);
    }
  } catch (err) {
    console.error('Fehler bei Check:', err.message);
  }
}
```

---

## 🧪 Tests durchführen

### Test-Script ausführen
```bash
node test-bothub.js
```

**Testet:**
1. Authentifizierung
2. Heartbeat
3. Nummern-Abfrage
4. Statistik-Update

---

## 📊 Modul: lib/bothub.js

Die `bothub.js` in `lib/` enthält alle Funktionen:

```javascript
const bothub = require('./lib/bothub');

// Verfügbare Methoden:
bothub.setToken(token)           // Setze API Token manuell
bothub.authenticate()             // Authentifiziere Bot
bothub.syncSessions(sessions)     // Synchronisiere Sessions
bothub.addSession(name, nums, lids)
bothub.removeSession(name)
bothub.listNumbers()
bothub.checkNumber(phoneNumber)
bothub.updateStats(stats)
bothub.sendHeartbeat()
bothub.startHeartbeat(intervalMs) // Starte Heartbeat-Loop
bothub.stopHeartbeat()            // Stoppe Heartbeat-Loop
bothub.init(options)              // Initialisiere alles
```

---

## 🔧 Umgebungsvariablen

Du kannst den API Token auch über Umgebungsvariablen setzen:

```bash
export BOTHUB_API_TOKEN="api_BotHub_37_1768129571193_..."
node index.js
```

---

## ⚠️ Wichtige Hinweise

### Authorization Header
**ALLE API Requests erfordern den Authorization Header:**
```
Authorization: Bearer YOUR_API_TOKEN
```

### Heartbeat-Anforderung
- Minimum: Alle 5 Minuten
- Empfohlen: Alle 2-3 Minuten (aktuell: 2 Min)
- Ohne Heartbeat → Bot wird als OFFLINE markiert

### Error Handling
Alle API-Calls haben Error Handling:
```javascript
try {
  await bothub.updateStats({ ... });
} catch (err) {
  console.error('API Error:', err.message);
  // Fallback oder Retry-Logik
}
```

---

## 📈 Bot-Statistiken Beispiel

Regelmäßig Update senden (z.B. stündlich):

```javascript
setInterval(async () => {
  try {
    const stats = {
      userCount: global.userCount || 0,
      groupCount: global.groupCount || 0,
      commandCount: global.commandCount || 0,
      version: require('./package.json').version
    };
    await bothub.updateStats(stats);
  } catch (err) {
    console.error('Stat-Update fehlgeschlagen:', err.message);
  }
}, 3600000); // Jede Stunde
```

---

## ✅ Checkliste

- ✅ API Token in botConfig.json gespeichert
- ✅ bothub.js Modul mit allen Funktionen verfügbar
- ✅ Automatische Initialisierung in index.js
- ✅ Heartbeat läuft automatisch alle 2 Minuten
- ✅ Error Handling für alle API-Calls
- ✅ Test-Script verfügbar (test-bothub.js)

---

## 🎯 Nächste Schritte

1. **Test durchführen:**
   ```bash
   node test-bothub.js
   ```

2. **Bot starten und Logs prüfen:**
   ```bash
   node index.js
   ```

3. **Statistiken in deinen Commands integrieren:**
   - Nutze `bothub.updateStats()` in deinen Command-Handlern
   - Zähle User, Gruppen und Commands mit

4. **Sessions verwalten:**
   - Nutze `bothub.addSession()` wenn neue Session hinzukommt
   - Nutze `bothub.syncSessions()` um alle Sessions zu synchronisieren

---

## 💬 Support

Bei Fragen oder Problemen:
- Logs anschauen (❌ Fehler-Meldungen)
- test-bothub.js ausführen
- Heartbeat-Status überprüfen
- API Token validieren

Viel Spaß mit deinem Beast Bot! 🚀
