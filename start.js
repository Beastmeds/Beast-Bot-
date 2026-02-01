const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@onedevil405/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function printLogo() {
  const logoPath = path.join(__dirname, 'logo.txt');
  if (fs.existsSync(logoPath)) {
    console.log(colors.cyan + colors.bold + fs.readFileSync(logoPath, 'utf-8') + colors.reset);
  } else {
    console.log(colors.red + '[!] logo.txt nicht gefunden!' + colors.reset);
  }
}

// Globale Flags – damit Profilname & Bild nur einmal geloggt werden
global.profileLogShown = false;

async function startSock(sessionName) {
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
    browser: Browsers.ubuntu('Edge'),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, qr }) => {
    if (qr) {
      console.clear();
      printLogo();
      console.log(`${colors.cyan}${colors.bold}🔍 Scanne den QR-Code für Session: ${sessionName}${colors.reset}`);
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      console.log(`${colors.yellow}🔄 Session ${sessionName} getrennt, versuche erneut zu verbinden...${colors.reset}`);
      startSock(sessionName);
    }

    if (connection === 'open') {
      console.log(`${colors.green}✅ Session ${sessionName} ist jetzt online!${colors.reset}`);

      // 📅 WhatsApp-Status setzen
      const date = new Date();
      const datum = date.toLocaleDateString('de-DE');
      const uhrzeit = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const statusText = `🔄 Letzter Neustart: ${datum}, ${uhrzeit} Uhr`;

      try {
        await sock.updateProfileStatus(statusText);
        console.log(`${colors.cyan}ℹ️ WhatsApp-Info automatisch gesetzt.${colors.reset}`);
      } catch (err) {
        console.log(`${colors.red}❌ Konnte WhatsApp-Info nicht ändern: ${err.message}${colors.reset}`);
      }

      // 🖋️ Profilname auf 𝓞𝓷𝓮𝓓𝓮𝓿𝓲𝓵🩸 setzen
      const newName = '𝓞𝓷𝓮𝓓𝓮𝓿𝓲𝓵🩸';
      try {
        await sock.updateProfileName(newName);
        if (!global.profileLogShown) {
          console.log(`${colors.green}✅ Profilname geändert zu: ${colors.cyan}${newName}${colors.reset}`);
        }
      } catch (err) {
        if (!global.profileLogShown) {
          console.log(`${colors.red}❌ Fehler beim Ändern des Profilnamens: ${err.message}${colors.reset}`);
        }
      }

      // 🖼️ Profilbild aktualisieren (falls vorhanden)
      const profilePicPath = path.resolve('./bot/bot.png');
      if (fs.existsSync(profilePicPath)) {
        try {
          const imageBuffer = fs.readFileSync(profilePicPath);
          await sock.updateProfilePicture(sock.user.id, imageBuffer);
          if (!global.profileLogShown) {
            console.log(`${colors.green}🖼️ Profilbild erfolgreich aktualisiert!${colors.reset}`);
          }
        } catch (err) {
          if (!global.profileLogShown) {
            console.log(`${colors.red}❌ Fehler beim Setzen des Profilbildes: ${err.message}${colors.reset}`);
          }
        }
      } else {
        if (!global.profileLogShown) {
          console.log(`${colors.yellow}⚠️ Kein Profilbild gefunden (bot.png fehlt).${colors.reset}`);
        }
      }

      // Ab hier wird die Meldung nicht mehr wiederholt
      global.profileLogShown = true;

      // 🧩 Hauptmodul laden
      const mainPath = path.resolve('./2StormBot.js');
      if (fs.existsSync(mainPath)) {
        try {
          const mainModule = require(mainPath);
          if (typeof mainModule === 'function') {
            mainModule(sock, sessionName);
          } else {
            console.log(`${colors.red}❌ 2StormBot.js exportiert keine Funktion!${colors.reset}`);
          }
        } catch (err) {
          console.log(`${colors.red}❌ Fehler beim Laden von 2StormBot.js: ${err.message}${colors.reset}`);
        }
      } else {
        console.log(`${colors.red}❌ 2StormBot.js nicht gefunden!${colors.reset}`);
      }
    }
  });
}

(async () => {
  console.clear();
  printLogo();

  const sessionsDir = './sessions';
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);

  const existingSessions = fs.readdirSync(sessionsDir)
    .filter((name) => fs.statSync(path.join(sessionsDir, name)).isDirectory());

  if (existingSessions.length > 0) {
    console.log(`${colors.cyan}🚀 Starte automatisch alle Sessions...${colors.reset}`);
    existingSessions.forEach((session) => startSock(session));
  } else {
    const defaultSession = 'main';
    console.log(`${colors.yellow}⚠️ Keine Sessions gefunden. Starte neue Session: ${defaultSession}${colors.reset}`);
    await startSock(defaultSession);
  }
})();
