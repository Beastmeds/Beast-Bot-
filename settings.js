const crypto = require('crypto');
const process = require('process');

module.exports = {
  owner: {
    name: 'Beastmeds',
    number: '4367764694963',
    telegram: '@deadsclient1',
    insta: '@deadsclient'
  },

  bot: {
    name: 'BeastBot',
    version: '2.0.1',
    prefix: '/',
    releaseDate: '1.1.2026',
    description: 'Beast Bot ist ein vielseitiger WhatsApp-Bot mit zahlreichen Funktionen für Gruppen- und Privat-Chats.',
    language: 'de'
  },

  forwardedNewsletter: {
    jid: '',
    name: 'undefined       <---𝐂𝐥𝐢𝐜𝐤 𝐇𝐞𝐫𝐞🩸'
  },

  admins: [
    '⭐️4367764694963⭐️',
    '⭐️SetYourfriendsNumberHere⭐️'
  ],

  links: {
    supportChannel: ''
  },

  system: {
    os: process.platform,
    env: process.env.NODE_ENV || 'production',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    nodeVersion: process.version,
    uptime: () => {
      const seconds = process.uptime();
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return `${h}h ${m}m ${s}s`;
    }
  },

  branding: {
    copyright: '2026 BeastBot. Alle Rechte vorbehalten.',
    license: 'MIT',
    trademark: 'BeastBot'
  },

  debug: {
    enabled: false,
    logToFile: true,
    verbose: false
  },

  logs: {
    saveToFile: true,
    crashLogPath: './logs/crash.log',
    eventLogPath: './logs/events.log',
    rotateLogs: true,
    maxSizeMB: 10
  },

  statusQuoted: {
    key: {
      fromMe: true,
      participant: '0@s.whatsapp.net',
      remoteJid: 'status@broadcast',
      id: crypto.randomUUID()
    },
    message: {
      extendedTextMessage: {
        text: '✠︻デ═一▸𝐃𝐄𝐀𝐃𝐒𝐂𝐋𝐈𝐄𝐍𝐓'
      }
    }
  },

  templates: {
    menuTitle: '📜 *BeastBot Hauptmenü*',
    helpText: 'ℹ️ *Hilfe & Übersicht aller Befehle*',
    footer: '© 2026 BeastBot – Alle Rechte vorbehalten.',
    supportNote: '❓ Bei Fragen: /support verwenden oder Channel abonnieren. /community zeigt den Link zur Community.'
  },

  limits: {
    globalDelay: 1000, 
    maxPerUserPerMinute: 20,
    warnLimit: 3,
    cooldownByUser: true
  },

  premiumUsers: [
    '> 49hierdeinenummer🩸',
    '> 49hierdeinenummer🩸'
  ],

  privateUsers: [
    '> 49hierdeinenummer🩸'
  ],

  exploitCases: [
    {
      name: 'BugMenu',
      description: ' crash Menü',
      file: 'main.js',
      trigger: '$bugmenu'
    },
    {
      name: 'xdelay',
      description: 'JID-Massencache + Delay-Flooder',
      file: 'main.js',
      trigger: '$xdelay'
    },
    {
      name: 'blackdelay',
      description: 'StatusMentDelay',
      file: 'main.js',
      trigger: '$blackdelay'
    },
    {
      name: 'callmenu',
      description: 'Callmenu',
      file: 'main.js',
      trigger: '$callmenu'
    }
  ],

  features: {
    modules: [
      {
        name: 'Gruppenfunktionen',
        description: 'AdminOnly, Welcome, AutoGifReact uvm.',
        command: '$grpmenu',
        scope: 'group',
        access: 'free',
        file: 'main.js'
      },
      {
        name: 'Anti-Link',
        description: 'Löscht automatisch WhatsApp-Gruppenlinks',
        command: '$antilink',
        scope: 'group',
        access: 'free',
        file: 'antilink.json'
      },
      {
        name: 'Anti-Delete',
        description: 'Zeigt gelöschte Nachrichten wieder an (PN & Gruppe getrennt steuerbar)',
        command: '$antidelete and $antideletepn',
        scope: 'all',
        access: 'free',
        file: 'deleted_messages.json'
      },
      {
        name: 'Mute User',
        description: 'Individuelle User stummschalten (temporär/dauerhaft)',
        command: '$mute',
        scope: 'group',
        access: 'free',
        file: 'muteUsers.json'
      },
      {
        name: 'Warnsystem',
        description: 'Benutzer verwarnen – Kick bei 3 Verwarnungen',
        command: '$warn',
        scope: 'group',
        access: 'free',
        file: 'warnedUsers.json'
      },
      {
        name: 'Bug-Menü',
        description: 'Zugang zu allen Exploit-Features und Force-Close-Cases',
        command: '$xforce2',
        scope: 'all',
        access: 'free',
        file: 'main.js'
      },
      {
        name: 'Tik-Tok-Download-Menü',
        description: 'TikTok-Link in Video/Audios umwandeln',
        command: '$tmenu',
        scope: 'all',
        access: 'free',
        file: 'main.js'
      },
      {
        name: 'BlockBypass',
        description: 'Nachrichten trotz Blockierung senden (nur privat)',
        command: '$antiblock',
        scope: 'private',
        access: 'private',
        file: 'main.js'
      }
    ]
  }
};