// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const PORT = 3000;
const APP_USER = "BeastBot_System";
const APP_PASS = "Beastmeds2512";

const app = express();
const server = http.createServer(app);




const logDir = path.join(__dirname, 'Website');
const logPath = path.join(logDir, 'serverlog.txt');

// Sicherstellen, dass der Ordner existiert
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = fs.createWriteStream(logPath, { flags: 'a' });
const logStdout = process.stdout;

function getTimestamp() {
  const now = new Date();
  const date = now.toLocaleDateString('de-DE');      // z. B. "24.10.2025"
  const time = now.toLocaleTimeString('de-DE', {      // z. B. "23:04:15"
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return `${date} ${time}`;
}

console.log = function (...args) {
  const message = `[${getTimestamp()}] ${args.join(' ')}`;
  logFile.write(message + '\n');
  logStdout.write(message + '\n');
};

console.error = function (...args) {
  const message = `[${getTimestamp()}] [ERR] ${args.join(' ')}`;
  logFile.write(message + '\n');
  logStdout.write(message + '\n');
};

// Session middleware (shared with socket.io)
const sessionMiddleware = session({
  secret: "stormbot-secret-" + crypto.randomBytes(8).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // bei HTTPS auf true setzen
});
app.use(sessionMiddleware);

app.use(express.urlencoded({ extended: true }));

// --- Login routes (public) ---
app.get("/login", (req, res) => {
  if (req.session && req.session.loggedIn) return res.redirect("/admin.html");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.post("/login", (req, res) => {
  const { user, pass } = req.body;
  if (user === APP_USER && pass === APP_PASS) {
    req.session.loggedIn = true;
    return res.redirect("/admin.html");
  }
  return res.redirect("/login?err=1");
});
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// --- Auth middleware: schützt alle weiteren Routen (inkl. statics) ---
app.use((req, res, next) => {
  // Allow login routes explicitly
  if (req.path === "/login" || req.path === "/logout" || req.path.startsWith("/public")) return next();
  if (req.session && req.session.loggedIn) return next();
  return res.redirect("/login");
});

// Statische Dateien (werden erst nach Login zugänglich)
app.use(express.static(path.join(__dirname, "public")));

// --- Base44 API Endpoints ---
const base44Config = require('./base44Config.json');

// Endpoint: Alle BotLogs abrufen
app.get("/api/base44/logs", async (req, res) => {
  try {
    const response = await fetch(
      `https://app.base44.com/api/apps/${base44Config.appId}/entities/BotLog`,
      {
        method: 'GET',
        headers: {
          'api_key': base44Config.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.ok) {
      const logs = await response.json();
      res.json({ success: true, data: logs });
    } else {
      res.status(response.status).json({ success: false, error: 'Base44 API error' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Alle BotCommands abrufen
app.get("/api/base44/commands", async (req, res) => {
  try {
    const response = await fetch(
      `https://app.base44.com/api/apps/${base44Config.appId}/entities/BotCommand`,
      {
        method: 'GET',
        headers: {
          'api_key': base44Config.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.ok) {
      const commands = await response.json();
      res.json({ success: true, data: commands });
    } else {
      res.status(response.status).json({ success: false, error: 'Base44 API error' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Alle BotSessions abrufen
app.get("/api/base44/sessions", async (req, res) => {
  try {
    const response = await fetch(
      `https://app.base44.com/api/apps/${base44Config.appId}/entities/BotSession`,
      {
        method: 'GET',
        headers: {
          'api_key': base44Config.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.ok) {
      const sessions = await response.json();
      res.json({ success: true, data: sessions });
    } else {
      res.status(response.status).json({ success: false, error: 'Base44 API error' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Base44 Config Status
app.get("/api/base44/status", async (req, res) => {
  res.json({
    enabled: base44Config.enabled,
    hasApiKey: !!base44Config.apiKey,
    hasAppId: !!base44Config.appId,
    apiUrl: `https://app.base44.com/api/apps/${base44Config.appId}/entities`
  });
});

// --- Socket.IO setup ---
const io = new Server(server, {
  // optional: pingTimeout, cors, etc.
});

// bind session middleware to socket
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, () => {
    const req = socket.request;
    if (req.session && req.session.loggedIn) return next();
    next(new Error("unauthorized"));
  });
});

// Helper: find cmd.exe path reliably
function findCmdPath() {
  const winRoot = process.env.SystemRoot || process.env.WINDIR;
  if (winRoot) {
    const p = path.join(winRoot, "System32", "cmd.exe");
    if (fs.existsSync(p)) return p;
  }

  return "cmd.exe";
}

let botProcess = null;
let botPid = null;
function emitStatus() {
  io.emit("botStatus", botProcess ? "Online" : "Offline");
}

// Bot controls (optional)
function startBot() {
  if (botProcess) return { ok: false, msg: "Bot läuft bereits." };
  const proc = spawn("node", ["start.js"], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  proc.stdout.on("data", d => io.emit("logUpdate", d.toString()));
  proc.stderr.on("data", d => io.emit("logUpdate", `[stderr] ${d.toString()}`));
  proc.on("exit", (c, s) => { io.emit("logUpdate", `\nℹ️ BeastBot beendet (code=${c}, signal=${s})`); if (botProcess && botProcess.pid === proc.pid) { botProcess = null; botPid = null; emitStatus(); } });
  proc.unref();
  botProcess = proc;
  botPid = proc.pid;
  io.emit("logUpdate", `ℹ️ BeastBot gestartet`);
  emitStatus();
  return { ok: true, pid: botPid };
}
function stopBot() {
  if (!botProcess) return { ok: false, msg: "Kein laufender Bot." };
  try { process.kill(botProcess.pid); botProcess = null; botPid = null; emitStatus(); return { ok: true }; }
  catch (e) { return { ok: false, msg: e.message }; }
}
async function restartBot() { if (botProcess) stopBot(); await new Promise(r => setTimeout(r, 400)); return startBot(); }

// --- Socket handlers ---
io.on("connection", (socket) => {
  // IPv4 sauber extrahieren
  let clientIp = socket.handshake.address;
  if(clientIp.startsWith("::ffff:")) clientIp = clientIp.replace("::ffff:", "");

  console.log(`✅ Socket verbunden (auth) — Client IP: ${clientIp}`);

  // send status
  emitStatus();
  socket.emit("logUpdate", botProcess ? `ℹ️ Verbunden — BeastBot läuft.` : "ℹ️ Verbunden — BeastBot ist offline.");

  // Bot control handlers
  socket.on("startBot", () => {
    const res = startBot();
    if (!res.ok) socket.emit("logUpdate", `⚠️ ${res.msg}`);
  });
  socket.on("stopBot", () => {
    const res = stopBot();
    if (!res.ok) socket.emit("logUpdate", `⚠️ ${res.msg}`);
  });
  socket.on("restartBot", async () => {
    socket.emit("logUpdate", "⏳ Neustart wird ausgeführt...");
    const res = await restartBot();
    if (!res.ok) socket.emit("logUpdate", `⚠️ Neustart fehlgeschlagen: ${res.msg}`);
    else socket.emit("logUpdate", `♻️ Neustart erfolgreich (pid=${res.pid || botPid})`);
  });


  socket.on("getBanned", () => {
    const filePath = path.join(__dirname, "data", "bannedu.json");
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) return socket.emit("bannedList", { ok: false, error: err.message });
      try { socket.emit("bannedList", { ok: true, data: JSON.parse(data) }); }
      catch(e){ socket.emit("bannedList", { ok: false, error: "JSON parse error: "+e.message }); }
    });
  });
const os = require('os');

socket.on('getSysInfo', () => {
  const info = `
Betriebssystem: ${os.type()} ${os.release()} (${os.platform()})
CPU: ${os.cpus()[0].model} (${os.cpus().length} Kerne)
Arbeitsspeicher: ${(os.totalmem()/1024/1024/1024).toFixed(2)} GB total, ${(os.freemem()/1024/1024/1024).toFixed(2)} GB frei
Node.js Version: ${process.version}
Uptime Server: ${Math.floor(process.uptime()/3600)}h ${Math.floor(process.uptime()%3600/60)}m ${Math.floor(process.uptime()%60)}s
  `;
  socket.emit('sysInfo', info);
});


  socket.cmdProcess = null;

  socket.on("startCmdSession", () => {
    if (socket.cmdProcess) {
      socket.emit("cmdOutput", { output: "ℹ️ CMD-Sitzung läuft bereits.", info: true });
      return;
    }

    const cmdPath = findCmdPath();
    socket.emit("cmdOutput", { output: `ℹ️ Versuche cmd.exe zu starten: ${cmdPath}` });

    try {
      const proc = spawn(cmdPath, [], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: false
      });

      proc.stdout.on("data", (d) => socket.emit("cmdOutput", { output: d.toString() }));
      proc.stderr.on("data", (d) => socket.emit("cmdOutput", { output: d.toString(), error: true }));
      proc.on("error", (err) => {
        console.error("cmd spawn error:", err);
        socket.emit("cmdOutput", { output: `⚠️ Spawn-Fehler: ${err.message}`, error: true });
        socket.cmdProcess = null;
      });
      proc.on("exit", (code, signal) => {
        socket.emit("cmdOutput", { output: `\nℹ️ cmd.exe beendet (code=${code}, signal=${signal})`, info: true });
        socket.cmdProcess = null;
      });

      socket.cmdProcess = proc;
      socket.emit("cmdOutput", { output: "ℹ️ CMD-Sitzung gestartet." });
    } catch (e) {
      console.error("startCmdSession exception:", e);
      socket.emit("cmdOutput", { output: `⚠️ Fehler beim Starten von cmd.exe: ${e.message}`, error: true });
      socket.cmdProcess = null;
    }
  });

  socket.on("runCmd", (cmd) => {
    if (!socket.cmdProcess) {
      socket.emit("cmdOutput", { output: "⚠️ Keine CMD-Sitzung aktiv. Bitte erst 'startCmdSession' senden.", error: true });
      return;
    }
    // ctrl-c char might be passed as '\x03'
    try {
      // write raw command; ensure CRLF for Windows
      socket.cmdProcess.stdin.write(cmd + "\r\n");
    } catch (e) {
      console.error("runCmd write error:", e);
      socket.emit("cmdOutput", { output: `⚠️ Fehler beim Senden des Kommandos: ${e.message}`, error: true });
    }
  });

  socket.on("stopCmdSession", () => {
    if (!socket.cmdProcess) {
      socket.emit("cmdOutput", { output: "ℹ️ Keine CMD-Sitzung aktiv." });
      return;
    }
    try {
      socket.cmdProcess.stdin.write("exit\r\n");
      // if it doesn't exit, kill after short timeout
      setTimeout(() => {
        if (socket.cmdProcess) {
          try { socket.cmdProcess.kill(); } catch (_) {}
          socket.cmdProcess = null;
        }
      }, 800);
    } catch (e) {
      socket.emit("cmdOutput", { output: `⚠️ Fehler beim Beenden: ${e.message}`, error: true });
    }
  });
// === Kill CMD via Button ===
socket.on("killCmd", () => {
  if (!socket.cmdProcess) {
    socket.emit("cmdOutput", { output: "⚠️ Keine CMD-Sitzung aktiv.", error: true });
    return;
  }
  try {
    socket.cmdProcess.kill();
    socket.cmdProcess = null;
    socket.emit("cmdOutput", { output: "❌ CMD-Prozess wurde gekillt.", error: true });
  } catch (e) {
    socket.emit("cmdOutput", { output: `⚠️ Fehler beim Killen der CMD: ${e.message}`, error: true });
  }
});

  socket.on("disconnect", () => {
    if (socket.cmdProcess) {
      try { socket.cmdProcess.kill(); } catch (_) {}
      socket.cmdProcess = null;
    }
    console.log("❌ Socket getrennt");
  });

  // socket error forwarding
  socket.on('error', (err) => {
    console.error('Socket error:', err);
    socket.emit('cmdOutput', { output: '⚠️ Socket error: ' + (err && err.message ? err.message : JSON.stringify(err)), error: true });
  });
});

// --- Start server ---
server.listen(PORT, () => {
  console.log(`🌐 Dashboard läuft auf http://193.111.249.187:${PORT}/login`);
});
server.on("error", (err) => console.error("Serverfehler:", err));
