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

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m'
};

const box = (lines) => {
  const width = 60;
  const border = "━".repeat(width - 2);
  return [
    `${colors.magenta}┏${border}┓${colors.reset}`,
    ...lines.map(l => `┃ ${l.padEnd(width - 4, " ")} ┃`),
    `${colors.magenta}┗${border}┛${colors.reset}`
  ].join("\n");
};

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function startSock(sessionName, mode, phoneNumber) {
  const sessionDir = path.join(__dirname, "sessions2", sessionName);
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Edge")
  });

  sock.ev.on("creds.update", saveCreds);

  let _resolveReady;
  const ready = new Promise(r => _resolveReady = r);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && mode === "qr") {
      console.log(box([
        `${colors.cyan}${colors.bold}📸 QR für Session ${sessionName}:${colors.reset}`,
      ]));
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log(box([`${colors.red}🔴 Session ${sessionName} abgemeldet – bitte neu starten.${colors.reset}`]));
      } else {
        console.log(box([`${colors.yellow}⚠️ Session ${sessionName} getrennt, versuche Reconnect...${colors.reset}`]));
        startSock(sessionName, mode, phoneNumber);
      }
    }

    if (connection === "open") {
      console.log(box([
        `${colors.green}✅ Session ${sessionName} ist online!${colors.reset}`
      ]));
      try { _resolveReady(); } catch (e) {}
    }
  });

  // Pairing-Mode
  if (!state.creds.registered && mode === "pair" && phoneNumber) {
    try {
      const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ""));
      const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
      console.log(box([
        `${colors.cyan}🔑 Pairing-Code für Session ${sessionName}:${colors.reset}`,
        `${colors.yellow}${formatted}${colors.reset}`,
        `${colors.green}👉 In WhatsApp unter „Gerät koppeln“ eingeben.${colors.reset}`
      ]));
    } catch (e) {
      console.log(box([`${colors.red}❌ Fehler beim Pairing: ${e.message}${colors.reset}`]));
    }
  }
  return ready;
}

(async () => {
  const sessionsDir = path.join(__dirname, "sessions2");
  fs.mkdirSync(sessionsDir, { recursive: true });

  const sessions = fs.readdirSync(sessionsDir)
    .filter(n => fs.statSync(path.join(sessionsDir, n)).isDirectory());

  if (sessions.length) {
    console.log(box([
      `${colors.cyan}${colors.bold}StormBot Sessions${colors.reset}`,
      "",
      ...sessions.map((s, i) => `${colors.green}[${i+1}]${colors.reset} ${s}`),
      `${colors.yellow}[n]${colors.reset} Neue Session`
    ]));
    const choice = await ask("> ");

    if (choice.toLowerCase() === "n") {
      const name = await ask("➤ Session-Name: ");
      const mode = (await ask("➤ Login [qr/pair]: ")).toLowerCase();
      let phone = null;
      if (mode === "pair") phone = await ask("➤ Telefonnummer (mit Ländervorwahl): ");
      startSock(name, mode, phone);
    } else {
      const index = parseInt(choice) - 1;
      if (sessions[index]) startSock(sessions[index], "qr");
    }
  } else {
    const name = await ask("➤ Name für erste Session: ");
    const mode = (await ask("➤ Login [qr/pair]: ")).toLowerCase();
    let phone = null;
    if (mode === "pair") phone = await ask("➤ Telefonnummer: ");
    await startSock(name, mode, phone);

    // After first session is ready, offer to start other sessions
    const available = fs.readdirSync(sessionsDir)
      .filter(n => fs.statSync(path.join(sessionsDir, n)).isDirectory());

    console.log(box([
      `${colors.cyan}${colors.bold}Start-Optionen${colors.reset}`,
      `${colors.green}[1]${colors.reset} Alle Sessions starten`,
      `${colors.green}[2]${colors.reset} Eine bestimmte Session starten`,
      `${colors.green}[3]${colors.reset} Beenden`
    ]));
    const opt = await ask("> ");

    if (opt === "1") {
      for (const s of available) {
        if (s === name) continue;
        startSock(s, "qr");
      }
    } else if (opt === "2") {
      if (!available.length) {
        console.log(box([`${colors.yellow}Keine weiteren Sessions vorhanden.${colors.reset}`]));
      } else {
        console.log(box([
          ...available.map((s, i) => `${colors.green}[${i+1}]${colors.reset} ${s}`)
        ]));
        const choice = await ask("Wähle Session: ");
        const idx = parseInt(choice) - 1;
        if (available[idx]) startSock(available[idx], "qr");
      }
    }
  }
})();
