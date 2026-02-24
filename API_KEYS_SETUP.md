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
- API Key bekommst du auf: https://console.groq.com/
- Kostenloses Tier: 30 API Calls pro Minute

#### **Nyxion**
```json
"nyxion": {
  "enabled": true,
  "apiKey": "nyx_xxxxxxxxxxxxxxxxxxxx",
  "baseUrl": "https://api.nyxion.ai/v1",
  "model": "nyxion-v1"
}
```
- API Key bekommst du auf: https://nyxion.ai/
- Dokumentation: https://docs.nyxion.ai/

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

---

## 🎯 Nutzung in Commands

Nach dem Eintragen der API Keys können diese Commands genutzt werden:

```
/ask <Frage>          - KI antwortet auf eine Frage
/summarize <Text>     - Fasst einen Text zusammen
/translate <Lang> <Text> - Übersetzt Text
/codehelp <Code>      - KI hilft mit Code
```

---

## ⚙️ Standardmodelle

| Provider | Modell | Kosten | Speed |
|----------|--------|--------|-------|
| Claude | claude-3-sonnet-20240229 | 💰💰 | ⚡⚡ |
| Groq | mixtral-8x7b-32768 | 💰 | ⚡⚡⚡ |
| Nyxion | nyxion-v1 | 💰 | ⚡⚡ |
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
