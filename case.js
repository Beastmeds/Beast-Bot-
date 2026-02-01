// extractCases.js
const fs = require('fs');
const path = require('path');

// Pfad zur Bot-Datei
const botFile = path.join(__dirname, '2StormBot.js');
// Pfad zur Ausgabedatei
const outFile = path.join(__dirname, 'commandsList.txt');

// Datei einlesen
const content = fs.readFileSync(botFile, 'utf-8');

// Regex: alle case '...' oder case "..."
const caseRegex = /case\s+['"`](.+?)['"`]\s*:/g;

const matches = [];
let m;
while ((m = caseRegex.exec(content)) !== null) {
  matches.push(m[1]);
}

// In Datei schreiben
fs.writeFileSync(outFile, matches.join('\n'), 'utf-8');

console.log(`✅ ${matches.length} Commands extrahiert und in ${outFile} gespeichert.`);
