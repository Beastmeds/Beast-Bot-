# 💰 Beast Bot Economy System - Vollständiger Guide

## 📊 Überblick

Das Economy-System ist jetzt vollständig in Beast Bot integriert! Mit drei verschiedenen Währungen und vielen Aktivitäten können Spieler Geld verdienen, sparen und spielen.

---

## 💵 Die 3 Währungen

### 1. **💵 Cash (Bargeld)**
- Normale Währung für tägliche Transaktionen
- Kann verloren gehen (Glücksspiele, Raube, etc.)
- Wird für /slots, /roulette, /dice benötigt

### 2. **🏦 Bank (Bankkonto)**
- Sichere Währung - kann nicht durch Raube verloren gehen
- Verdient 1% Zinsen monatlich
- Kostet 10 monatliche Gebühr
- `/bank deposit` und `/bank withdraw` für Verwaltung

### 3. **💎 Gems (Premium-Währung)**
- Seltene Währung für zukünftige Premium-Items
- Kann durch spezielle Events verdient werden
- Wird in `/me` angezeigt

---

## 💼 Basic Economy Commands

### `/balance` oder `/bal`
Zeigt dein aktuelles Vermögen an:
- 💵 Cash
- 🏦 Bank
- 💎 Gems

**Cooldown:** Keine

---

### `/daily`
Tägliche Belohnung abholen!
- **Reward:** 100-150 Cash
- **Cooldown:** 24 Stunden

```
/daily
→ ✅ Tägliche Belohnung!
→ 💵 +125 Cash
→ 💰 Neuer Kontostand: 225
```

---

### `/weekly`
Wöchentliche Belohnung abholen!
- **Reward:** 500-700 Cash
- **Cooldown:** 7 Tage

```
/weekly
→ ✅ Wöchentliche Belohnung!
→ 💵 +650 Cash
→ 💰 Neuer Kontostand: 875
```

---

### `/work`
Arbeite und verdiene Geld!
- **Reward:** 30-100 Cash (+ 20% Bonus Chance)
- **Cooldown:** 10 Minuten
- **Jobs:** Kaffee verkauft, Programm geschrieben, etc.

```
/work
→ 👷 Du hast Kaffee verkauft
→ 💵 +60 Cash
→ ✨ +12 Bonus!
```

---

### `/beg`
Betteln um Geld
- **Reward:** 10-40 Cash (50% Erfolgsrate)
- **Cooldown:** 30 Sekunden
- **Chance:** 50% erfolgreich

```
/beg
→ 🤲 Du bettelst...
→ ✅ Jemand gab dir 25 Cash!
```

---

## 🎰 Gambling Commands

### `/slots <Betrag>`
Spiele an der Slotmaschine!
- **Gewinn:** Betrag x 3 bei Jackpot
- **Symbol:** 🍎 🍊 🍋 🍒 💎
- **Ablauf:** 
  - Wenn alle 3 Symbole gleich: 🎉 Jackpot!
  - Ansonsten: Betrag verloren

```
/slots 100
→ 🎰 SLOTS
→ 🍎 🍎 🍎
→ 🎉 JACKPOT! +300
→ 💰 Neuer Kontostand: 400
```

---

### `/roulette <Betrag>`
Spiele Roulette!
- **Gewinn:** Betrag x 1 (50% Chance)
- **Farben:** 🟢 ROT oder ⚫ SCHWARZ
- **Auszahlung:** Betrag verdoppelt oder verloren

```
/roulette 50
→ 🎰 ROULETTE
→ 🟢 ROT!
→ 🎉 Gewonnen! +50
```

---

### `/dice <Betrag>`
Würfel-Duell gegen den Bot!
- **Gewinn:** Betrag x 2 bei höherem Wurf
- **Unentschieden:** Kein Geld verloren
- **Würfel-Range:** 1-6

```
/dice 100
→ 🎲 WÜRFEL
→ 👤 Dein Wurf: 5
→ 🤖 Bot Wurf: 3
→ 🎉 Gewonnen! +200
```

---

## 🛠️ Jobs / Aktivitäten

### `/mine`
Bergbau und Ressourcenabbau
- **Ores:** Kohle (30), Eisen (50), Gold (100), Diamant (200)
- **Cooldown:** 20 Sekunden

```
/mine
→ ⛏️ Du hast Diamant abgebaut!
→ 💵 +200 Cash
```

---

### `/hunt`
Jage Tiere und verdiene Geld!
- **Animals:** Kaninchen (40), Hirsch (80), Bär (150)
- **Cooldown:** 15 Sekunden

```
/hunt
→ 🏹 Du hast einen Hirsch gejagt!
→ 💵 +80 Cash
```

---

### `/farm`
Baue Pflanzen an!
- **Crops:** Weizen (35), Maize (45), Tomaten (55)
- **Cooldown:** 25 Sekunden

```
/farm
→ 🌾 Du hast Tomaten angebaut!
→ 💵 +55 Cash
```

---

## 💸 Crime Commands

### `/rob @user`
Raube einem anderen Spieler Geld!
- **Erfolgsrate:** 60%
- **Raub-Betrag:** Bis zu 50% des Opfers
- **Beim Scheitern:** Du verlierst 10 Cash

```
/rob @username
→ 💸 ÜBERFALL
→ ✅ Erfolgreicher Raub!
→ 🎉 +150 Cash
```

**Warnung:** Opfer werden nicht benachrichtigt!

---

### `/crime`
Begehe kriminelle Aktionen!
- **Crimes:** Raub, Trickbetrug, Hacker-Anschlag
- **Rewards:** 80-200 Cash
- **Risiko:** 60-80% Verhaftungsrate
- **Strafe:** 1 Minute Gefängnis bei Verhaftung

```
/crime
→ 🔓 Hacker-Anschlag
→ ❌ Verhaftet! 1 Minute Gefängnis
```

---

### `/heist`
Bankenraub (kommend!)
- Wird bald verfügbar
- Gruppencontent für 2-4 Spieler

---

### `/jail`
Überprüfe deinen Gefängnis-Status
- Zeigt verbleibende Zeit
- Du kannst während Haft nicht arbeiten

```
/jail
→ ⛓️ Du sitzt im Gefängnis!
→ Entlassung in: 45s
```

---

## 🏦 Bank Commands

### `/bank balance`
Überprüfe deinen Kontostand
- Zeigt: Cash, Bank, Zinsrate

```
/bank balance
→ 🏦 Bankkontostand:
→ Cash: 500
→ Bank: 1.000
→ Zinsrate: 1%
```

---

### `/bank deposit <Betrag>`
Zahle Cash auf dein Bankkonto ein
- Transfer von Cash → Bank
- Sicherer vor Raube

```
/bank deposit 100
→ ✅ 100 auf dein Bankkonto eingezahlt!
→ 💵 Cash: 400
→ 🏦 Bank: 1.100
```

---

### `/bank withdraw <Betrag>`
Zahle Geld von der Bank aus
- Transfer von Bank → Cash
- Für Glücksspiele nötig

```
/bank withdraw 200
→ ✅ 200 von der Bank abgehoben!
→ 💵 Cash: 600
→ 🏦 Bank: 900
```

---

### `/bank interest`
Ziehe deine monatlichen Zinsen ein
- **Zinsen:** 1% von deinem Bank-Saldo
- **Gebühr:** 10 Cash monatlich

```
/bank interest
→ 💰 Monatliche Zinsen
→ +10 Zinsen
→ -10 Gebühr
→ 💵 Neuer Cash: 100
→ 🏦 Neue Bank: 890
```

---

## 📊 Leaderboards

### `/topbalance`
Zeige die Top 10 reichsten Spieler
- Nach Cash-Saldo sortiert
- Nur Spieler-Coins, nicht Bank/Gems

```
/topbalance
→ 🏆 Top 10 Cash
→ 1. Beastmeds - 9.999.984.000
→ 2. MᴿTwᎥﾒ - 100.116
→ ...
```

---

## 👤 Profile Integration

### `/me` oder `/profile`
Überprüfe dein komplettes Profil
Zeigt jetzt auch:
- 💵 Bargeld
- 🏦 Bank-Saldo
- 💎 Gems-Menge

---

## 🎯 Strategien zum Geld verdienen

### 1. **Passive Income (Sicher)**
- Täglich `/daily` abholen → 100-150 Cash
- Wöchentlich `/weekly` abholen → 500-700 Cash
- Total pro Woche: ~1000 Cash

### 2. **Aktive Arbeit (Sicher)**
- `/work` repeaten (10min cooldown) → 30-100 Cash
- `/mine` repeaten (20sec cooldown) → 30-200 Cash
- `/hunt` repeaten (15sec cooldown) → 40-150 Cash
- Schnellster Weg für Anfänger!

### 3. **Gambling (Riskant)**
- `/slots` - Luck-basiert, 3x Multiplikator
- `/roulette` - 50/50 Chance
- `/dice` - 2x Multiplikator wenn gewonnen

⚠️ **Tip:** Bank-Geld nicht zum Zocken verwenden!

### 4. **Verbrechen (Sehr Riskant)**
- `/rob` - 60% Erfolgsrate, hoher Ertrag
- `/crime` - 20-40% Erfolgsrate, Gefängnis-Risiko

### 5. **Strategie Kombo**
```
1. Jeden Tag: /daily + /weekly
2. Aktiv arbeiten: /work + /mine + /farm
3. Zinsen abholen: /bank interest
4. Ein paar kleine Glücksspiele: /dice
5. Überschuss zur Bank: /bank deposit
```

---

## 📈 Anfänger-Roadmap

### Woche 1: Grundlagen
- ✅ `/register` - Registrierung
- ✅ `/daily` jeden Tag abholen (150 Cash/Woche)
- ✅ `/work` repeaten (komm auf 500+ Cash)
- ✅ `/balance` überprüfen

### Woche 2: Diversifikation
- ✅ `/mine` und `/hunt` dazu nehmen
- ✅ Erstes `/slots` Experiment (vorsichtig!)
- ✅ `/bank deposit 200` - Sicherheit
- ✅ `/topbalance` ansehen

### Woche 3+: Optimieren
- ✅ `/crime` testen (50/50 Gefängnis)
- ✅ `/rob` mit Bedacht nutzen
- ✅ `/bank interest` monatlich abholen
- ✅ Ziel: 10.000+ Cash zusammen sparen

---

## ⚠️ Wichtige Tipps

1. **Bank ist sicher** - 💵 Geld auf der Bank kann nicht geraubt werden
2. **Cooldowns beachten** - Manche Commands haben lange Wartezeiten
3. **Nicht alles verzocken** - Halte immer Rücklagen!
4. **Gefängnis vermeiden** - Crime kann zu 1 Minute Haft führen
5. **Regelmäßig spielen** - Daily/Weekly sind deine beste Einnahmequelle

---

## 🐛 Bekannte Fehlerbehebungen

- ✅ Datenbank-Migrationen für neue Spalten
- ✅ Economy-Daten werden persistiert
- ✅ Cooldowns funktionieren systemweit
- ✅ Bank-Gebühren werden korrekt abgezogen

---

## 🚀 Geplante Zusätze

- ⏳ **Heist System** - Gruppenraube
- ⏳ **Trading System** - Spieler-zu-Spieler Handel
- ⏳ **Investments** - Langfristige Rendite
- ⏳ **Lotterie** - Riesige Jackpots
- ⏳ **Monopol System** - Grund/Häuser kaufen

---

## 📞 Support

Fragen zur Economy? Nutze `/support` oder schreib eine Nachricht!

**Viel Spaß beim Geldverdienen! 🎉**
