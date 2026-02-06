# Base44 Integration für Beast Bot

## 🚀 Quick Start

### 1. Konfiguration (base44Config.json)

Bereits vorausgefüllt mit deinen Credentials:
```json
{
  "apiKey": "0a57a3ba4f154d3ab11b5b3526933051",
  "appId": "6986355575310ef553a49a58"
}
```

### 2. Import in deinen Bot

```javascript
const { 
  createLog, 
  incrementCommandUsage, 
  updateSession 
} = require('./lib/base44Helper');
```

### 3. Commands Loggen

```javascript
// Wenn Command ausgeführt wird
await createLog('command', '!ban ausgeführt', 'Meine Gruppe', 'UserName');
await incrementCommandUsage('ban');
```

### 4. Sessions Aktualisieren

```javascript
// Status der Gruppe aktualisieren
await updateSession('Meine Gruppe', messagesCount, commandsCount, 'online');
```

---

## 📊 Entities in Base44

### 1. **BotLog** - Logging
Speichert alle Commands und Events

**Felder:**
- `type` - Typ (command, join, leave, error, etc.)
- `message` - Nachricht
- `group_name` - Gruppen-Name
- `user_name` - Benutzer-Name
- `severity` - Severity (info, warning, error)
- `timestamp` - Zeitstempel

**Beispiel:**
```javascript
await createLog('command', '!ping ausgeführt', 'Meine Gruppe', 'Max', 'info');
```

---

### 2. **BotCommand** - Command Tracking
Zählt die Nutzung jedes Commands

**Felder:**
- `name` - Command-Name
- `usage_count` - Anzahl der Ausführungen
- `last_used` - Letzte Verwendung
- (weitere Custom Fields)

**Beispiel:**
```javascript
await incrementCommandUsage('ping');
await incrementCommandUsage('ban');
```

---

### 3. **BotSession** - Session Management
Verwaltet aktive Sessions pro Gruppe

**Felder:**
- `group_name` - Gruppen-Name
- `messages_today` - Nachrichten heute
- `commands_today` - Commands heute
- `status` - Status (online, offline, away)
- `created_at` - Erstellungszeit
- `last_activity` - Letzte Aktivität

**Beispiel:**
```javascript
await updateSession('Meine Gruppe', 150, 45, 'online');
```

---

## 💡 Praktische Beispiele

### Beispiel 1: Command Execution Logging

```javascript
// In deinem Command-Handler
async function executeCommand(commandName, groupName, userName) {
  // Command ausführen
  const result = await runCommand(commandName);
  
  // Zu Base44 loggen
  await createLog('command', `!${commandName} ausgeführt`, groupName, userName);
  await incrementCommandUsage(commandName);
  
  return result;
}

// Verwendung
await executeCommand('ban', 'Meine Gruppe', 'Max');
```

---

### Beispiel 2: Message Counter

```javascript
let messageCount = {};
let commandCount = {};

// Bei jeder Nachricht
sock.ev.on('messages.upsert', async (m) => {
  const msg = m.messages[0];
  const groupId = msg.key.remoteJid;
  const groupName = groupsMap[groupId] || groupId;
  
  // Counter erhöhen
  messageCount[groupName] = (messageCount[groupName] || 0) + 1;
  
  // Wenn Command
  if (msg.message?.conversation?.startsWith('!')) {
    commandCount[groupName] = (commandCount[groupName] || 0) + 1;
  }
  
  // Session aktualisieren
  await updateSession(
    groupName, 
    messageCount[groupName], 
    commandCount[groupName], 
    'online'
  );
});
```

---

### Beispiel 3: Error Logging

```javascript
// Bei Fehlern
try {
  await someOperation();
} catch (error) {
  await createLog('error', error.message, 'Bot System', 'System', 'error');
}
```

---

### Beispiel 4: Bot Events

```javascript
// Bot startet
await createLog('info', 'Bot gestartet', 'System', 'Bot', 'info');

// Benutzer tritt Gruppe bei
await createLog('join', 'User joined', 'Meine Gruppe', 'NewUser', 'info');

// Benutzer verlässt Gruppe
await createLog('leave', 'User left', 'Meine Gruppe', 'OldUser', 'info');
```

---

## 📁 Dateien

| Datei | Beschreibung |
|-------|-------------|
| `lib/base44Adapter.js` | Direkte API-Kommunikation |
| `lib/base44Integration.js` | Zentrale Verwaltung |
| `lib/base44Helper.js` | Einfache Helper-Funktionen |
| `base44Config.json` | Konfiguration |

---

## 🔑 Wichtige Funktionen

### createLog(type, message, groupName, userName, severity)
```javascript
await createLog('command', '!ban ausgeführt', 'Gruppe1', 'Admin', 'info');
```

### incrementCommandUsage(commandName)
```javascript
await incrementCommandUsage('ban');
```

### updateSession(groupName, messagesCount, commandsCount, status)
```javascript
await updateSession('Gruppe1', 100, 25, 'online');
```

### logCommandExecution(commandName, groupName, userName, message)
```javascript
await logCommandExecution('ping', 'Gruppe1', 'Max', '!ping');
```

---

## 🌐 Website-Integration

Deine Website kann die Base44-Daten abrufen:

```javascript
// Backend
const base44Config = require('./base44Config.json');

app.get('/api/bot-logs', async (req, res) => {
  try {
    // Direkt mit Base44 API
    const response = await fetch(
      `https://app.base44.com/api/apps/${base44Config.appId}/entities/BotLog`,
      {
        headers: {
          'api_key': base44Config.apiKey
        }
      }
    );
    const logs = await response.json();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## ⚙️ Konfiguration

`base44Config.json`:
```json
{
  "enabled": true,              // Integration aktivieren
  "apiKey": "your_api_key",     // API-Key
  "appId": "your_app_id",       // App-ID
  "debugMode": false            // Debug-Ausgaben
}
```

---

## 🔒 Sicherheit

⚠️ **Wichtig:**
- API-Key und APP-ID nie in Git committen
- Nutze `.env` für Produktion:

```bash
# .env
BASE44_API_KEY=your_api_key
BASE44_APP_ID=your_app_id
```

Code:
```javascript
const apiKey = process.env.BASE44_API_KEY || require('./base44Config.json').apiKey;
```

---

## 🐛 Fehlerbehebung

### "Base44 Integration nicht aktiviert"
- Überprüfe `base44Config.json`
- Stelle sicher, `apiKey` und `appId` eingetragen sind

### "Cannot find module 'base44Helper'"
- Stelle sicher, die Dateien sind in `lib/` vorhanden
- Überprüfe den require-Pfad

### Logs erscheinen nicht in Base44
- Überprüfe API-Key und App-ID
- Überprüfe Internetverbindung
- Nutze `debugMode: true` in der Konfiguration

---

## 📚 Weitere Ressourcen

- [Base44 Website](https://base44.com)
- [Base44 API Docs](https://docs.base44.com)
- [Account Settings](https://app.base44.com/settings)

---

**Version:** 2.0.0 (Angepasst für echte Base44 API)

