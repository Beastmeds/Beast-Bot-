// check-required.js
// Dieses Skript durchsucht die Datei 2StormBot.js nach eingebundenen Dateien
// und schreibt alle gefundenen Dateinamen in req.txt

const fs = require('fs');
const path = require('path');

const targetFile = path.join(process.cwd(), '2StormBot.js');
const outputFile = path.join(process.cwd(), 'req.txt');

if (!fs.existsSync(targetFile)) {
  console.error('❌ Datei 2StormBot.js wurde nicht gefunden!');
  process.exit(1);
}

const content = fs.readFileSync(targetFile, 'utf8');

// Diese Regexe finden verschiedene Arten von Datei-Einbindungen
const regexes = [
  /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /import\s+(?:[^'"]+\s+from\s+)?['"`]([^'"`]+)['"`]/g,
  /fs\.readFile(?:Sync)?\(\s*['"`]([^'"`]+)['"`]/g,
  /fs\.createReadStream\(\s*['"`]([^'"`]+)['"`]/g,
  /sendFile\(\s*['"`]([^'"`]+)['"`]/g,
  /res\.sendFile\(\s*['"`]([^'"`]+)['"`]/g,
  /['"`]((?:\.{1,2}\/|\/)[^'"`]+\.(?:png|jpg|jpeg|gif|webp|svg|mp3|wav|ogg|json|db|sqlite|txt|html|css|mp4|m4a|ttf|otf|pem|key|crt))['"`]/gi
];

const found = new Set();

for (const regex of regexes) {
  let match;
  while ((match = regex.exec(content)) !== null) {
    found.add(match[1]);
  }
}

// Schreibe in req.txt
if (found.size > 0) {
  const sorted = [...found].sort();
  fs.writeFileSync(outputFile, sorted.join('\n'), 'utf8');
  console.log(`✅ ${found.size} Datei(en) gefunden und in req.txt geschrieben.`);
} else {
  fs.writeFileSync(outputFile, 'Keine Dateien gefunden.', 'utf8');
  console.log('ℹ️ Keine Dateien gefunden.');
}
