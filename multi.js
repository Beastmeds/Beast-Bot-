const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} = require('@717development/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const sessionsDir = './sessions';
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);

const targetJid = '4915147733037@s.whatsapp.net'; // Deine WhatsApp-Nummer für QR-Codes

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

async function startSock(sessionName) {
  const sessionFolder = path.join(sessionsDir, sessionName);
  fs.mkdirSync(sessionFolder, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: state,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: true,
    emitOwnEvents: true,
    browser: Browsers.ubuntu('Edge')
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.clear();
      console.log(`== Session: ${sessionName} - Bitte QR Code scannen ==`);
      qrcode.generate(qr, { small: true });

      try {
        await sock.sendMessage(targetJid, { text: `🔑 QR-Code für Session *${sessionName}*:\n\n${qr}` });
        console.log(`QR-Code an ${targetJid} gesendet.`);
      } catch (e) {
        console.error('Fehler beim Senden der QR-Code Nachricht:', e);
      }
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log(`Session ${sessionName} wurde abgemeldet. Bitte Auth-Daten löschen und neu starten.`);
      } else {
        console.log(`Session ${sessionName} Verbindung getrennt. Grund: ${reason}. Versuche neu zu verbinden...`);
        startSock(sessionName); // Reconnect versuchen
      }
    }

    if (connection === 'open') {
      console.log(`Session ${sessionName} erfolgreich verbunden!`);
      await sock.sendMessage(targetJid, { text: 'Beast Bot ist jetzt online' });
    }
  });

  // Hier wird die Bot-Logik aus StormBot.js eingebunden:
  const stormBotPath = path.resolve('./StormBot.js');
  let stormBot = require(stormBotPath);

  stormBot(sock, sessionName); // sock + sessionName an StormBot übergeben

  // Hot-Reload für StormBot.js (optional)
  fs.watchFile(stormBotPath, () => {
    console.log(`BeastBot.js wurde geändert. Lade neu...`);
    delete require.cache[require.resolve(stormBotPath)];
    try {
      stormBot = require(stormBotPath);
      stormBot(sock, sessionName);
      console.log(`BeastBot.js erfolgreich neu geladen.`);
    } catch (err) {
      console.error(`Fehler beim Neuladen von BeastBot.js:`, err);
    }
  });

  return sock;
}

(async () => {
  console.clear();
  console.log('BeastBot Multi-Session gestartet.');

  // Vorhandene Sessions automatisch starten
  const existingSessions = fs.readdirSync(sessionsDir)
    .filter(name => fs.statSync(path.join(sessionsDir, name)).isDirectory());

  if (existingSessions.length) {
    console.log(`Starte vorhandene Sessions: ${existingSessions.join(', ')}`);
    existingSessions.forEach(session => {
      startSock(session);
    });
  } else {
    console.log('Keine vorhandenen Sessions gefunden.');
  }

  // CLI Loop: /newsession <name> oder exit
  while (true) {
    const input = await askQuestion('> ');
    if (input.startsWith('/newsession ')) {
      const sessionName = input.split(' ')[1];
      if (!sessionName) {
        console.log('Bitte einen Session-Namen angeben, z.B. /newsession Lorenz');
        continue;
      }
      console.log(`Starte neue Session ${sessionName}...`);
      startSock(sessionName);
    } else if (input.toLowerCase() === 'exit') {
      console.log('Beende BeastBot.');
      process.exit(0);
    } else {
      console.log('Unbekannter Befehl. Nutze /newsession <name> oder exit');
    }
  }
})();
