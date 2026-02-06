/**
 * Base44 Integration für Beast Bot
 * Zentrale Verwaltung für alle Base44-Operationen
 * 
 * Entities:
 * - BotLog: Command und Event Logging
 * - BotCommand: Command Tracking und Usage-Counting
 * - BotSession: Session Management
 */

const fs = require('fs');
const path = require('path');
const Base44Adapter = require('./base44Adapter');

class Base44Integration {
  constructor() {
    this.configPath = path.join(__dirname, '../base44Config.json');
    this.config = this.loadConfig();
    this.adapter = null;
    this.isEnabled = this.config.enabled || false;

    if (this.isEnabled && this.config.apiKey && this.config.appId) {
      this.initializeAdapter();
    } else {
      console.warn('⚠️ Base44 Integration nicht aktiviert. Konfiguriere base44Config.json mit API-Key und App-ID.');
    }
  }

  /**
   * Laden der Konfiguration
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      }
      console.warn('⚠️ base44Config.json nicht gefunden!');
      return { enabled: false };
    } catch (error) {
      console.error('❌ Fehler beim Laden der Base44-Konfiguration:', error.message);
      return { enabled: false };
    }
  }

  /**
   * Initialisiert den Base44-Adapter
   */
  async initializeAdapter() {
    try {
      this.adapter = new Base44Adapter(this.config.apiKey, this.config.appId);
      const connected = await this.adapter.checkConnection();

      if (connected) {
        console.log('✅ Base44 Integration initialisiert');
      } else {
        console.warn('⚠️ Könnte keine Verbindung zu Base44 herstellen');
      }
    } catch (error) {
      console.error('❌ Fehler bei der Initialisierung von Base44:', error.message);
    }
  }

  /**
   * Erstellt einen Log-Eintrag
   */
  async createLog(type, message, groupName, userName, severity = 'info') {
    if (!this.adapter || !this.config.entities.BotLog?.enabled) return false;

    try {
      const result = await this.adapter.createLog(type, message, groupName, userName, severity);
      return result ? true : false;
    } catch (error) {
      if (this.config.debugMode) {
        console.error('❌ Fehler beim Erstellen des Logs:', error.message);
      }
      return false;
    }
  }

  /**
   * Zählt die Command-Nutzung hoch
   */
  async incrementCommandUsage(commandName) {
    if (!this.adapter || !this.config.entities.BotCommand?.enabled) return false;

    try {
      return await this.adapter.incrementCommandUsage(commandName);
    } catch (error) {
      if (this.config.debugMode) {
        console.error('❌ Fehler beim Erhöhen der Command-Usage:', error.message);
      }
      return false;
    }
  }

  /**
   * Aktualisiert eine Session
   */
  async updateSession(groupName, messagesCount = 0, commandsCount = 0, status = 'online') {
    if (!this.adapter || !this.config.entities.BotSession?.enabled) return false;

    try {
      return await this.adapter.updateSession(groupName, messagesCount, commandsCount, status);
    } catch (error) {
      if (this.config.debugMode) {
        console.error('❌ Fehler beim Session-Update:', error.message);
      }
      return false;
    }
  }

  /**
   * Status-Informationen
   */
  getStatus() {
    return {
      enabled: this.isEnabled && !!this.adapter,
      adapterConnected: !!this.adapter,
      configLoaded: !!this.config,
      entities: this.config.entities
    };
  }

  /**
   * Beendet alle aktiven Prozesse
   */
  shutdown() {
    console.log('🛑 Base44 Integration beendet');
  }
}

// Exportieren Sie die Klasse als Singleton
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new Base44Integration();
    }
    return instance;
  },
  Base44Integration
};
