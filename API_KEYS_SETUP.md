# 🔑 API Keys Konfiguration

## Wo müssen die API Keys eingetragen werden?

Die API Keys werden in der Datei **`apiConfig.json`** gespeichert, die sich im Hauptverzeichnis des Beast Bots befindet.

---

## 📋 Schritt-für-Schritt Anleitung

### 1. **apiConfig.json öffnen**
Öffne die Datei: `/Beast Bot/apiConfig.json`

### 2. **API Keys eintragen**

#### **Claude (Anthropic)**
```json
"claude": {
  "enabled": true,
  "apiKey": "sk-ant-v0-xxxxxxxxxxxxxxxxxxxx",
  "baseUrl": "https://api.anthropic.com/v1",
  "model": "claude-3-sonnet-20240229"
}
```
- API Key bekommst du auf: https://console.anthropic.com/
- Benutzerrolle: Account > API Keys

#### **Groq**
```json
"groq": {
  "enabled": true,
  "apiKey": "gsk_xxxxxxxxxxxxxxxxxxxx",
  "baseUrl": "https://api.groq.com/openai/v1",
  "model": "mixtral-8x7b-32768"
}
```
> **Tipp:** du kannst den Schlüssel statt in `apiConfig.json` auch in einer
> Umgebungsvariable ablegen (`NYX_API_KEY`). Der Bot liest ihn automatisch und
> überschreibt dann den Wert aus der JSON‑Datei. Auf einem Linux/macOS‑Host
> exportiere etwa `export NYX_API_KEY="nyx_..."` oder trage ihn in deine
> `config.env`/`.env`-Datei ein. Dadurch landet der Key nie im Git‑Repo.
> Optional kannst du einen anderen Host/Port angeben (z.B. beim lokalen
> Testen). Setze dazu `NYX_HOST` als Umgebungsvariable oder in `config.env`:
> `NYX_HOST="http://localhost:8000/v1"`. Dieser Wert überschreibt den
> `baseUrl`-Eintrag in `apiConfig.json`.

**Request-Beispiel** (wenn du das LLM-Service unabhängig testen möchtest):
```
POST /v1/generate HTTP/1.1
Host: localhost:8000
Content-Type: application/json
X-API-Key: nyx_YOUR_KEY_HERE

{"prompt":"Hello, world","max_new_tokens":50}
```
Jeder gültige Aufruf muss den `X-API-Key`-Header enthalten; der Bot fügt ihn
automatisch aus der Umgebungsvariable oder `apiConfig.json` hinzu.

*Hinweis:* bei einem **HTTP 412 Precondition Failed** kommt der Dienst gern
wenn das JSON nicht genau stimmt (z.B. zusätzlicher Feldnamen). Der Bot
protokolliert solche Fehler und versucht automatisch einen zweiten Aufruf ohne
`max_new_tokens`. Falls du den Fehler wieder siehst, kontrolliere `NYX_HOST`
und die Server‑Logs.*

#### **Nyxion**
Hinweis: wenn du den Key per `NYX_API_KEY` einstellst, funktioniert der Befehl
genauso – es ist nur keiner in den Quellen gespeichert.
```json
**Nyxion-spezifisch:** Jeder Schlüssel ist rate‑limitiert (ca. 500 Anfragen/min, 
100 000 / Tag) und kann über `DELETE /v1/keys/<id>` oder die Verwaltungs‑API
revoked werden. Wird ein Schlüssel kompromittiert, sofort löschen und neu
anlegen.
  "apiKey": "nyx_xxxxxxxxxxxxxxxxxxxx",
  "baseUrl": "https://api.nyxion.ai/v1",
  "model": "nyxion-v1"
}
```
- API Key bekommst du auf: https://nyxion.ai/
- Dokumentation: https://docs.nyxion.ai/

**Hinweis:** in manchen Sandbox-Setups (z.B. Preview-Umgebungen) ist der komplette
Endpoint inklusive Pfad nötig (z.B. `https://preview-sandbox--.../api/validateApiKey`).
Setze dann `baseUrl` auf diesen vollen Link; der Bot sendet den Inhalt als `{ message: ... }`.

#### **OpenAI** (Falls benötigt)
```json
"openai": {
  "enabled": true,
  "apiKey": "sk-xxxxxxxxxxxxxxxxxxxx",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4"
}
```
- API Key bekommst du auf: https://platform.openai.com/api-keys

#### **Axiom**
```json
"axiom": {
  "enabled": true,
  "apiKey": "axiom_playground_xxxxxxxxxxxxx",
  "baseUrl": "https://fluorescent-leana-doubtful.ngrok-free.dev",
  "model": "axiom-playground"
}
```
- Der API Key kann auch in `AXIOM_API_KEY` als Umgebungsvariable abgelegt werden.
- `AXIOM_HOST` erlaubt das Überschreiben des Endpunkts (z.B. für Sandbox oder Produktion).

---

## 🎯 Nutzung in Commands

Nach dem Eintragen der API Keys können diese Commands genutzt werden:

```
/ask <Frage>          - KI antwortet auf eine Frage
/summarize <Text>     - Fasst einen Text zusammen
/translate <Lang> <Text> - Übersetzt Text
/codehelp <Code>      - KI hilft mit Code
/nyxion <Frage>       - Fragt direkt den Nyxion-API-Endpunkt (Key in apiConfig.json)
```

---

## ⚙️ Standardmodelle

| Provider | Modell | Kosten | Speed |
|----------|--------|--------|-------|
| Claude | claude-3-sonnet-20240229 | 💰💰 | ⚡⚡ |
| Groq | mixtral-8x7b-32768 | 💰 | ⚡⚡⚡ |
| Nyxion | nyxion-v1 | 💰 | ⚡⚡ |
| Axiom | axiom-playground | 💰 | ⚡⚡ |
| OpenAI | gpt-4 | 💰💰💰 | ⚡ |

---

## 🔒 Sicherheitshinweise

- ⚠️ **Niemals** die apiConfig.json mit API Keys ins Git pushen!
- 💾 Die Datei ist in `.gitignore` eingetragen (nicht vergessen!)
- 🔐 API Keys sollten regelmäßig rotiert werden
- 📝 Backup der Keys an sicherer Stelle speichern

---

## ❓ Häufige Fragen

**F: Kann ich mehrere Provider gleichzeitig nutzen?**
A: Ja! Setze `enabled: true` bei den gewünschten Providern.

**F: Welcher Provider ist am schnellsten?**
A: Groq ist am schnellsten, kostet aber auch nichts im kostenlosen Tier.

**F: Was passiert, wenn mehrere aktiviert sind?**
A: Der Bot verwendet den ersten aktiven Provider in der Reihenfolge.

**F: Kann ich die Modelle wechseln?**
A: Ja, ändere den `model` Parameter für jeden Provider.

---

## 📞 Support

Bei Problemen mit den API Keys:
1. Überprüfe, ob der API Key korrekt kopiert wurde
2. Stelle sicher, dass der Provider aktiviert (`enabled: true`) ist
3. Prüfe die Dokumentation des Providers
4. Starte den Bot neu (`npm start`)

---

## 🛠 Web‑App: API-Key System

Falls du eine Base44 Web‑App betreibst, kannst du Nutzern erlauben, eigene
API‑Keys zu erstellen. Dazu muss die **User‑Entität** erweitert werden (siehe
`/schemas/user_entity.json`):

```json
"api_keys": {
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {"type": "string"},
      "key": {"type": "string"},
      "name": {"type": "string"},
      "created": {"type": "string", "format": "date-time"}
    }
  },
  "default": []
}
```

Nachdem das Schema aktualisiert ist, kannst du ein Edge-Function (z.B. unter
`functions/validateApiKey.js`) deployen, die Anfragen prüft und dann beliebige
Logik (z.B. eine LLM‑Anfrage) ausführt. Beispielcode findest du ebenfalls im
Repository.

Frontend‑seitig bietet `components/chat/ApiKeyManager.jsx` ein Modal zum
Verwalten, Erzeugen und Kopieren der Schlüssel. Es nutzt Tailwind (Dark
Theme), Framer Motion und lucide‑react Icons; die eigentliche Speicherung läuft
über `base44.auth.updateMe()`.

Bot‑Beispiele für WhatsApp, Telegram und Discord sind direkt im Modal gezeigt,
die Aufrufe identisch mit den bisherigen Abschnitten im Bot bleiben.

### Test
Eine schnelle curl‑Abfrage zum Verifizieren des Setups:

```bash
curl -X POST https://app-url/api/validateApiKey \
  -H "Authorization: Bearer sk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hallo"}'
```

Erwartete Antwort:
```json
{ "success": true, "response": "...", "user": "user@example.com" }
```
 
---

## 🚀 API-Key verwenden (Schritt-für-Schritt)

1️⃣ **Key generieren**
   * Öffne das Chat-Interface und klicke oben rechts auf den 🔑 *API-Keys* Button.
   * Drücke auf **+ Neuer API-Key**.
   * Kopiere den angezeigten Token (z.B. `sk_abc123xyz...`).

2️⃣ **Key im Bot einsetzen**
   *Test mit curl*:

```bash
curl -X POST https://your-app.base44.com/api/validateApiKey \
  -H "Authorization: Bearer sk_dein_key_hier" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hallo, wie geht es dir?"}'
```

   *WhatsApp‑Bot Beispiel (Node.js)*:

```js
const axios = require('axios');

const API_KEY = 'sk_dein_key_hier'; // Dein generierter Key
const API_URL = 'https://your-app.base44.com/api/validateApiKey';

// Bei jeder eingehenden Nachricht:
const response = await axios.post(API_URL, {
  message: 'Benutzernachricht hier'
}, {
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  }
});

console.log(response.data.response); // KI-Antwort
```

3️⃣ **Response-Format**

Der Endpunkt liefert immer ein JSON mit folgenden Feldern:

```json
{
  "success": true,
  "response": "Die KI-Antwort auf deine Nachricht",
  "user": "deine@email.com"
}
```

Nutze `response` im Bot, um dem Nutzer die Antwort zurückzugeben.


---
