// downloaders.js
const { ytdl, igdl, fbdl, twdl } = require("@neelegirl/downloader");

async function handleYT(sock, m, args) {
    const from = m.key.remoteJid;
    if (!args[0] || !args[0].includes("youtube.com")) {
        return await sock.sendMessage(from, { text: "❌ Bitte sende einen gültigen YouTube-Link!" });
    }

    try {
        const res = await ytdl(args[0]);
        await sock.sendMessage(from, { video: { url: res.videoUrl }, caption: `✅ YouTube Video\n> ${res.title}` });
    } catch (e) {
        console.error(e);
        await sock.sendMessage(from, { text: "❌ Fehler beim YouTube Download" });
    }
}

async function handleIG(sock, m, args) {
    const from = m.key.remoteJid;
    if (!args[0] || !args[0].includes("instagram.com")) {
        return await sock.sendMessage(from, { text: "❌ Bitte sende einen gültigen Instagram-Link!" });
    }

    try {
        const res = await igdl(args[0]);
        for (let i of res) {
            await sock.sendMessage(from, { video: { url: i.url }, caption: `📸 Instagram Video/Reel\n> ${args[0]}` });
        }
    } catch (e) {
        console.error(e);
        await sock.sendMessage(from, { text: "❌ Fehler beim Instagram Download" });
    }
}

async function handleFB(sock, m, args) {
    const from = m.key.remoteJid;
    if (!args[0] || !args[0].includes("facebook.com")) {
        return await sock.sendMessage(from, { text: "❌ Bitte sende einen gültigen Facebook-Link!" });
    }

    try {
        const res = await fbdl(args[0]);
        await sock.sendMessage(from, { video: { url: res.hd }, caption: `📘 Facebook Video\n> ${args[0]}` });
    } catch (e) {
        console.error(e);
        await sock.sendMessage(from, { text: "❌ Fehler beim Facebook Download" });
    }
}

async function handleTW(sock, m, args) {
    const from = m.key.remoteJid;
    if (!args[0] || (!args[0].includes("twitter.com") && !args[0].includes("x.com"))) {
        return await sock.sendMessage(from, { text: "❌ Bitte sende einen gültigen Twitter/X-Link!" });
    }

    try {
        const res = await twdl(args[0]);
        await sock.sendMessage(from, { video: { url: res.HD }, caption: `🐦 Twitter/X Video\n> ${args[0]}` });
    } catch (e) {
        console.error(e);
        await sock.sendMessage(from, { text: "❌ Fehler beim Twitter Download" });
    }
}

// exportieren
module.exports = { handleYT, handleIG, handleFB, handleTW };
