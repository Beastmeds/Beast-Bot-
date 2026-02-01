//Bei targetJid bitte deine Telefonnummer Mit @s.whatsapp.net oder deine Gruppen id mit @g.us

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} = require('@onedevil405/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

function printLogo() {
  const logoPath = path.join(__dirname, 'logo.txt');
  if (fs.existsSync(logoPath)) {
    const logo = fs.readFileSync(logoPath, 'utf-8');
    console.log(logo);
  } else {
    console.log('[!] logo.txt nicht gefunden!');
  }
}

/**
 * Startet eine WhatsApp-Socket-Verbindung für eine bestimmte Session.
 * @param {string} sessionName Der Name des Session-Ordners (z.B. 'session1', 'session2').
 * @param {'qr' | 'pair'} mode Der Verbindungsmodus ('qr' für QR-Code, 'pair' für Pairing-Code).
 */
async function startSock(sessionName, mode) {
  const sessionFolder = `./sessions/${sessionName}`;
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

    if (qr && mode === 'qr') {
      console.clear();
      printLogo();
      console.log(`🔍 Scanne diesen QR-Code für Session: ${sessionName}`);
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log(`🔴 Session ${sessionName} abgemeldet! Lösche den Session-Ordner und starte neu.`);
        startSock(sessionName, mode);
      } else {
        console.log(`🔄 Session ${sessionName} Verbindung getrennt, versuche erneut zu verbinden...`);
        startSock(sessionName, mode);
      }
    }

    if (connection === 'open') {
      console.log(`✅ Session ${sessionName} Verbindung erfolgreich hergestellt!`);
      console.log(`🌐 Session ${sessionName} ist jetzt online!`);

      const targetJid = '4367764694963@s.whatsapp.net';
      try {
        await sock.sendMessage(targetJid, { text: `Hallo! Session ${sessionName} ist jetzt online und bereit.` });
        console.log(`✉️ Online-Nachricht an ${targetJid} gesendet!`);
      } catch (error) {
        console.log(`❌ Fehler beim Senden der Online-Nachricht für Session ${sessionName}: ${error.message}`);
      }

      // Wrap groupMetadata with a small cache and retry to avoid rate-overlimit crashes
      try {
        const originalGroupMetadata = sock.groupMetadata.bind(sock);
        const groupMetadataCache = new Map();
        sock.groupMetadata = async (jid) => {
          const now = Date.now();
          const cached = groupMetadataCache.get(jid);
          if (cached && (now - cached.ts) < 60 * 1000) return cached.md;
          try {
            const md = await originalGroupMetadata(jid);
            groupMetadataCache.set(jid, { md, ts: Date.now() });
            return md;
          } catch (e) {
            const msg = e && e.message ? e.message : '';
            if (msg.includes('rate-overlimit') || (e && e.data === 429)) {
              // brief backoff then retry once
              await new Promise(r => setTimeout(r, 2000));
              const md2 = await originalGroupMetadata(jid);
              groupMetadataCache.set(jid, { md: md2, ts: Date.now() });
              return md2;
            }
            throw e;
          }
        };
      } catch (e) {
        console.error('Warn: could not wrap groupMetadata:', e.message || e);
      }

      const mainPath = path.resolve('./2StormBot.js');
      let mainModule = require(mainPath);
      mainModule(sock, sessionName);

      fs.watchFile(mainPath, async () => {
        console.clear();
        printLogo();
        console.log(`🔁 BeastBot wurde geändert. Lade neu für Session ${sessionName}...`);
        delete require.cache[require.resolve(mainPath)];
        try {
          mainModule = require(mainPath);
          mainModule(sock, sessionName);
          console.log(`✅ BeastBot neu geladen!`);
        } catch (err) {
          console.log(`❌ Fehler beim Neuladen von BeastBot: ${err.message}`);
        }
      });
    }
  });

  if (!state.creds.registered && mode === 'pair') {
    const phoneNumber = await askQuestion(
      `📞 Telefonnummer mit Ländervorwahl für Session ${sessionName} eingeben:\n> `
    );
    const pairingCodeRaw = await sock.requestPairingCode(phoneNumber.replace(/[^\d]/g, ''));
    const pairingCodeFormatted = pairingCodeRaw?.match(/.{1,4}/g)?.join('-') || pairingCodeRaw;
    console.log(`🔑 Pairing-Code für Session ${sessionName}: ${pairingCodeFormatted}`);
    console.log(`👉 Gib diesen Code in WhatsApp unter "Gerät koppeln" ein.`);
  }
}

(async () => {
  console.log('=== index.js starting ===');
  // console.clear();  // temporarily disabled to keep startup logs visible
  printLogo();

  const sessionsDir = './sessions';
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);

  const existingSessions = fs.readdirSync(sessionsDir)
    .filter(name => fs.statSync(path.join(sessionsDir, name)).isDirectory());

  if (existingSessions.length > 0) {
    console.log('Verfügbare Sessions:');
    existingSessions.forEach((s, i) => console.log(`[${i+1}] ${s}`));
    console.log('[a] Alle Sessions starten');
    console.log('[n] Neue Session starten');

    const choice = await askQuestion('> ');

    if (choice.toLowerCase() === 'n') {
      const newSessionName = await askQuestion('Neuen Session-Namen eingeben:\n> ');
      const loginChoice = await askQuestion('Login-Modus: [j] QR-Code, [n] Pairing-Code\n> ');
      if (loginChoice.toLowerCase() === 'j') startSock(newSessionName, 'qr');
      else startSock(newSessionName, 'pair');
    } else if (choice.toLowerCase() === 'a') {
      console.log('🚀 Starte alle vorhandenen Sessions...');
      existingSessions.forEach(session => startSock(session, 'qr'));
    } else {
      const sessionIndex = parseInt(choice, 10) - 1;
      if (sessionIndex >= 0 && sessionIndex < existingSessions.length) {
        const selectedSession = existingSessions[sessionIndex];
        console.log(`Starte Session: ${selectedSession}`);
        startSock(selectedSession, 'qr');
      } else {
        console.log('❌ Ungültige Auswahl.');
      }
    }
  } else {
    const newSessionName = await askQuestion('Bitte gib einen Namen für deine erste Session ein:\n> ');
    const choice = await askQuestion('Login-Modus: [j] QR-Code, [n] Pairing-Code\n> ');
    if (choice.toLowerCase() === 'j') await startSock(newSessionName, 'qr');
    else await startSock(newSessionName, 'pair');
  }
})();
