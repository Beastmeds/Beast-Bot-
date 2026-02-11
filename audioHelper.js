const { downloadContentFromMessage, getContentType } = require('@717development/baileys');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Lade Audio-Buffer aus einer Nachricht oder quotedMessage.
 * Unterstützt:
 * 1️⃣ Verschlüsselte WhatsApp-Audio (user-sent)
 * 2️⃣ Bereits entschlüsselte Bot-Audio
 * @param {proto.IWebMessageInfo} msg
 * @returns {Promise<Buffer|null>}
 */
async function getAudioBuffer(msg) {
    try {
        // 1️⃣ Prüfe, ob Audio vorhanden ist
        let audioMsg = msg.message?.audioMessage 
                     || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;
        if (!audioMsg) return null;

        // 2️⃣ Prüfe, ob _data existiert → bereits entschlüsselt
        if (audioMsg._data) {
            return Buffer.from(audioMsg._data);
        }

        // 3️⃣ Prüfe, ob verschlüsselte URL existiert
        if (audioMsg.url) {
            const type = getContentType(audioMsg);
            const stream = await downloadContentFromMessage(audioMsg, type);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            return Buffer.concat(chunks);
        }

        // 4️⃣ Kein valides Audio
        return null;
    } catch (e) {
        console.error('Fehler in getAudioBuffer:', e);
        return null;
    }
}

/**
 * Speichert Buffer temporär als mp3
 * @param {Buffer} buffer
 * @param {string} prefix
 * @returns {string} Pfad zur Datei
 */
function saveTempAudio(buffer, prefix) {
    const filePath = path.join(os.tmpdir(), `${prefix}_${Date.now()}.mp3`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

module.exports = { getAudioBuffer, saveTempAudio };
