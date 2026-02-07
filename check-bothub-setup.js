#!/usr/bin/env node

/**
 * BotHub Integration Status Check
 * Prüft, ob die Integration korrekt eingebaut ist
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 BotHub Integration Status Check\n');
console.log('=' .repeat(50));

let allGood = true;

// Check 1: bothub.js existiert
console.log('\n✓ Checking lib/bothub.js...');
const bothubPath = path.join(__dirname, 'lib', 'bothub.js');
if (fs.existsSync(bothubPath)) {
  const content = fs.readFileSync(bothubPath, 'utf-8');
  const hasAuth = content.includes('authenticate');
  const hasHeartbeat = content.includes('startHeartbeat');
  const hasInit = content.includes('function init');
  
  if (hasAuth && hasHeartbeat && hasInit) {
    console.log('  ✅ lib/bothub.js vorhanden mit allen Funktionen');
  } else {
    console.log('  ⚠️ lib/bothub.js existiert, aber einige Funktionen fehlen');
    allGood = false;
  }
} else {
  console.log('  ❌ lib/bothub.js NICHT GEFUNDEN!');
  allGood = false;
}

// Check 2: botConfig.json konfiguriert
console.log('\n✓ Checking botConfig.json...');
const configPath = path.join(__dirname, 'botConfig.json');
if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.BOTHUB_API_TOKEN) {
      console.log('  ✅ botConfig.json existiert mit API Token');
      console.log(`     Token: ${config.BOTHUB_API_TOKEN.substring(0, 20)}...`);
    } else {
      console.log('  ⚠️ botConfig.json existiert aber kein API Token gesetzt');
      allGood = false;
    }
  } catch (e) {
    console.log('  ❌ botConfig.json ist nicht gültig JSON!');
    allGood = false;
  }
} else {
  console.log('  ❌ botConfig.json NICHT GEFUNDEN!');
  allGood = false;
}

// Check 3: index.js has bothub integration
console.log('\n✓ Checking index.js Integration...');
const indexPath = path.join(__dirname, 'index.js');
if (fs.existsSync(indexPath)) {
  const content = fs.readFileSync(indexPath, 'utf-8');
  const hasRequire = content.includes("require('./lib/bothub')");
  const hasInit = content.includes('bothub.init()');
  const hasToken = content.includes('BOTHUB_API_TOKEN');
  
  if (hasRequire && hasInit && hasToken) {
    console.log('  ✅ index.js hat bothub Integration');
  } else {
    if (!hasRequire) console.log('    - require bothub: ❌');
    if (!hasInit) console.log('    - bothub.init(): ❌');
    if (!hasToken) console.log('    - API Token: ❌');
    allGood = false;
  }
} else {
  console.log('  ❌ index.js NICHT GEFUNDEN!');
  allGood = false;
}

// Check 4: Dokumentation existiert
console.log('\n✓ Checking Documentation...');
const files = [
  { name: 'BOTHUB_API_GUIDE.md', label: 'API Guide' },
  { name: 'test-bothub.js', label: 'Test Script' },
  { name: 'bothub-examples.js', label: 'Examples' },
  { name: 'INTEGRATION_COMPLETE.md', label: 'Integration Info' }
];

let docCount = 0;
for (const file of files) {
  if (fs.existsSync(path.join(__dirname, file.name))) {
    console.log(`  ✅ ${file.label} (${file.name})`);
    docCount++;
  } else {
    console.log(`  ⚠️ ${file.label} NICHT GEFUNDEN`);
  }
}

// Check 5: axios installed
console.log('\n✓ Checking Dependencies...');
try {
  require('axios');
  console.log('  ✅ axios installiert');
} catch (e) {
  console.log('  ❌ axios NICHT installiert - npm install axios erforderlich!');
  allGood = false;
}

// Summary
console.log('\n' + '='.repeat(50));

if (allGood && docCount === files.length) {
  console.log('\n✨ ALLES PERFEKT! Die Integration ist bereit! ✨\n');
  console.log('🚀 Nächste Schritte:');
  console.log('   1. node index.js           - Bot starten');
  console.log('   2. node test-bothub.js     - API Tests durchführen\n');
  process.exit(0);
} else {
  console.log('\n⚠️ WARNUNG: Es gibt noch offene Punkte!\n');
  console.log('🔧 Zu Tun:');
  if (!allGood) {
    console.log('   - Überprüfe die oben gekennzeichneten Fehler');
  }
  if (docCount < files.length) {
    console.log('   - Dokumentation ist unvollständig');
  }
  console.log();
  process.exit(1);
}
