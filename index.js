//Bei targetJid bitte deine Telefonnummer Mit @s.whatsapp.net oder deine Gruppen id mit @g.us

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} = require('@whiskeysockets/baileys');

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
  
  // Fetch version with timeout to avoid hanging
  let version;
  try {
    const versionPromise = fetchLatestBaileysVersion();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Version fetch timeout')), 5000)
    );
    ({ version } = await Promise.race([versionPromise, timeoutPromise]));
  } catch (err) {
    console.log('⚠️  Using fallback version (timeout or error)');
    version = { version: [2, 2412, 1], isLatest: false };
  }

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
        await sock.sendMessage(targetJid, { text: 'Beast Bot ist jetzt online' });
        console.log(`✉️ Online-Nachricht an ${targetJid} gesendet!`);
      } catch (error) {
        console.log(`❌ Fehler beim Senden der Online-Nachricht für Session ${sessionName}: ${error.message}`);
      }

      // Wrap groupMetadata with a small cache and exponential backoff retry to avoid rate-overlimit crashes
      try {
        const originalGroupMetadata = sock.groupMetadata.bind(sock);
        const groupMetadataCache = new Map();
        const REQUEST_CACHE_TTL = 60 * 1000; // 60 seconds
        const REQUEST_DELAY = 2500; // 2.5 second minimum delay between requests
        let lastRequestTime = 0;
        
        sock.groupMetadata = async (jid) => {
          const now = Date.now();
          const cached = groupMetadataCache.get(jid);
          if (cached && (now - cached.ts) < REQUEST_CACHE_TTL) return cached.md;
          
          // Implement minimum delay between requests
          const timeSinceLastRequest = now - lastRequestTime;
          if (timeSinceLastRequest < REQUEST_DELAY) {
            await new Promise(r => setTimeout(r, REQUEST_DELAY - timeSinceLastRequest));
          }
          
          try {
            lastRequestTime = Date.now();
            const md = await originalGroupMetadata(jid);
            groupMetadataCache.set(jid, { md, ts: Date.now() });
            return md;
          } catch (e) {
            const msg = e && e.message ? e.message : '';
            const isRateLimit = msg.includes('rate-overlimit') || (e && e.data === 429);
            
            if (isRateLimit) {
              console.log(`⚠️ Rate limited on groupMetadata(${jid}). Retrying with exponential backoff...`);
              let retryCount = 0;
              const maxRetries = 3;
              let lastErr = e;
              
              while (retryCount < maxRetries) {
                const backoffMs = (3000 * Math.pow(2, retryCount)) + Math.random() * 1000;
                console.log(`⏱️ Waiting ${Math.round(backoffMs)}ms before retry ${retryCount + 1}/${maxRetries}...`);
                await new Promise(r => setTimeout(r, backoffMs));
                
                try {
                  lastRequestTime = Date.now();
                  const md2 = await originalGroupMetadata(jid);
                  groupMetadataCache.set(jid, { md: md2, ts: Date.now() });
                  return md2;
                } catch (retryErr) {
                  lastErr = retryErr;
                  retryCount++;
                  if (retryCount >= maxRetries) {
                    throw lastErr;
                  }
                }
              }
            }
            throw e;
          }
        };
      } catch (e) {
        console.error('Warn: could not wrap groupMetadata:', e.message || e);
      }

      // Wrap sendMessage to add delay between sends to avoid rate limiting
      try {
        const originalSendMessage = sock.sendMessage.bind(sock);
        const sendMessageDelays = new Map(); // Track last send time per recipient
        const SEND_MESSAGE_DELAY = 500; // 500ms minimum between sends to same recipient
        
        sock.sendMessage = async (jid, message, options = {}) => {
          const now = Date.now();
          const lastSendTime = sendMessageDelays.get(jid) || 0;
          const timeSinceLastSend = now - lastSendTime;
          
          if (timeSinceLastSend < SEND_MESSAGE_DELAY) {
            const waitTime = SEND_MESSAGE_DELAY - timeSinceLastSend;
            await new Promise(r => setTimeout(r, waitTime));
          }
          
          try {
            sendMessageDelays.set(jid, Date.now());
            const result = await originalSendMessage(jid, message, options);
            return result;
          } catch (e) {
            const isRateLimit = e?.message?.includes('rate-overlimit') || e?.data === 429;
            if (isRateLimit) {
              console.log(`⚠️ Rate limited on sendMessage to ${jid}. Waiting and retrying...`);
              await new Promise(r => setTimeout(r, 5000 + Math.random() * 2000));
              sendMessageDelays.set(jid, Date.now());
              return await originalSendMessage(jid, message, options);
            }
            throw e;
          }
        };
      } catch (e) {
        console.error('Warn: could not wrap sendMessage:', e.message || e);
      }
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
  console.clear();
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
