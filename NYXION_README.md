# 🤖 Nyxion AI Integration

Nyxion ist eine KI, die in deinen Beast Bot integriert wurde. Sie kann Fragen beantworten und intelligente Unterstützung bieten.

## 📝 Verwendung

Verwende den Befehl `*/nyx <Frage>*` um Nyxion zu aktivieren:

```
/nyx Wie funktioniert Photosynthese?
```

## ⚙️ Konfiguration

Die Nyxion-Integration wird durch folgende Umgebungsvariablen in `config.env` konfiguriert:

```env
# Nyxion API Key
NYX_API_KEY=nyx_4OefNuxWk4XdrsBP0Abqm1Jv6JQYz77wPwU1JGj2MNM

# Nyxion API Base URL (Standard: Render-Deployment)
NYXION_API_URL=https://nyxion-beastmeds.onrender.com
```

## 🔧 Funktionen

- **Kontextbewusstsein**: Nyxion speichert die letzten 10 Nachrichten pro Chat, um sinnvolle Antworten zu geben
- **Session Management**: Jeder Chat hat seine eigene Session (Timeout nach 15 Minuten Inaktivität)
- **Fehlerverwaltung**: Intelligente Fehlermeldungen bei API-Ausfällen oder Rate-Limiting
- **Nachrichtensplitting**: Lange Antworten werden automatisch aufgeteilt
- **Präsenz-Update**: Der Bot zeigt an, dass er "schreibt" während er antwortet

## 📁 Dateien

- [lib/nyxion.js](lib/nyxion.js) - Hauptmodul
- [config.env](config.env) - Konfigurationsdatei mit API-Schlüsseln

## 🚨 Fehlerbehandlung

Wenn Nyxion offline ist oder es Probleme gibt:
- **Rate Limit**: "⚠️ Rate limit erreicht. Bitte später versuchen."
- **Authentifizierung**: "🔐 API-Authentifizierung fehlgeschlagen."
- **Verbindungsfehler**: "🌐 Nyxion-Service ist nicht erreichbar."

## 💡 Tipps

- Nyxion arbeitet am besten mit klaren, konkreten Fragen
- Die Session speichert den Kontext, also können Folgefraden gestellt werden
- Nutze `*/nyx* ohne Argument für die Hilfe-Nachricht

## 🔌 API Integration

Nyxion ist mit dem Service verbunden unter:
- **URL**: https://nyxion-beastmeds.onrender.com
- **Endpoint**: `/api/chat` (POST)

**Request-Format**:
```json
{
  "message": "Benutzer-Frage",
  "session_id": "chat_id",
  "messages": [/* Previous messages */],
  "api_key": "API-Schlüssel"
}
```

**Response-Format**:
```json
{
  "response": "KI-Antwort"
}
```
