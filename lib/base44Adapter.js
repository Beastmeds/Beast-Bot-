/**
 * Base44 API Adapter für Beast Bot
 * Verwaltet die Kommunikation mit Base44 für Commands, Logs und Sessions
 * 
 * Benötigte Konfiguration:
 * - API_KEY: API-Schlüssel vom Base44 Account
 * - APP_ID: Application ID von Base44
 * 
 * Entities:
 * - BotLog: Logging von Commands und Events
 * - BotCommand: Command Tracking und Usage-Counting
 * - BotSession: Session Management
 */

const fs = require('fs');
const path = require('path');

class Base44Adapter {
  constructor(apiKey, appId) {
    this.apiKey = apiKey || process.env.BASE44_API_KEY;
    this.appId = appId || process.env.BASE44_APP_ID;
    this.baseUrl = `https://app.base44.com/api/apps/${this.appId}/entities`;

    if (!this.apiKey || !this.appId) {
      console.warn('⚠️ BASE44_API_KEY oder BASE44_APP_ID nicht gesetzt! Base44 Integration deaktiviert.');
    }
  }

  /**
   * Überprüft die API-Verbindung
   */
  async checkConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/BotLog`, {
        method: 'GET',
        headers: {
          'api_key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log('✅ Base44 API verbunden');
        return true;
      } else {
        console.error('❌ Base44 API Verbindung fehlgeschlagen: HTTP', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ Base44 API Verbindung fehlgeschlagen:', error.message);
      return false;
    }
  }

  /**
   * Erstellt einen Log-Eintrag in Base44
   * Entity: BotLog
   * @param {string} type - Typ des Logs (command, join, leave, etc.)
   * @param {string} message - Log-Nachricht
   * @param {string} groupName - Name der Gruppe
   * @param {string} userName - Name des Benutzers
   * @param {string} severity - Severity Level (info, warning, error)
   */
  async createLog(type, message, groupName, userName, severity = 'info') {
    if (!this.apiKey || !this.appId) return null;

    try {
      const response = await fetch(`${this.baseUrl}/BotLog`, {
        method: 'POST',
        headers: {
          'api_key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: type,
          message: message,
          group_name: groupName,
          user_name: userName,
          severity: severity,
          timestamp: new Date().toISOString()
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`📝 Log '${type}' zu Base44 gesendet`);
        return data;
      } else {
        console.error(`❌ Fehler beim Erstellen des Logs: HTTP ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Fehler beim Erstellen des Logs:`, error.message);
      return null;
    }
  }

  /**
   * Zählt die Command-Nutzung hoch
   * Entity: BotCommand
   * @param {string} commandName - Name des Commands
   */
  async incrementCommandUsage(commandName) {
    if (!this.apiKey || !this.appId) return false;

    try {
      // 1. Command finden
      const getResponse = await fetch(`${this.baseUrl}/BotCommand`, {
        method: 'GET',
        headers: {
          'api_key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!getResponse.ok) {
        console.error(`❌ Fehler beim Abrufen von Commands: HTTP ${getResponse.status}`);
        return false;
      }

      const commands = await getResponse.json();
      const cmd = commands.find(c => c.name === commandName);

      if (cmd) {
        // 2. Usage Count erhöhen
        const updateResponse = await fetch(`${this.baseUrl}/BotCommand/${cmd.id}`, {
          method: 'PUT',
          headers: {
            'api_key': this.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            usage_count: (cmd.usage_count || 0) + 1,
            last_used: new Date().toISOString()
          })
        });

        if (updateResponse.ok) {
          console.log(`📊 Command '${commandName}' Usage erhöht`);
          return true;
        } else {
          console.error(`❌ Fehler beim Update: HTTP ${updateResponse.status}`);
          return false;
        }
      } else {
        console.warn(`⚠️ Command '${commandName}' nicht in Base44 gefunden`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Fehler beim Erhöhen der Command-Usage:`, error.message);
      return false;
    }
  }

  /**
   * Erstellt oder aktualisiert eine Session
   * Entity: BotSession
   * @param {string} groupName - Name der Gruppe
   * @param {number} messagesCount - Anzahl der Nachrichten heute
   * @param {number} commandsCount - Anzahl der Commands heute
   * @param {string} status - Status (online, offline, away)
   */
  async updateSession(groupName, messagesCount = 0, commandsCount = 0, status = 'online') {
    if (!this.apiKey || !this.appId) return false;

    try {
      // 1. Session finden
      const getResponse = await fetch(`${this.baseUrl}/BotSession`, {
        method: 'GET',
        headers: {
          'api_key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!getResponse.ok) {
        console.error(`❌ Fehler beim Abrufen von Sessions: HTTP ${getResponse.status}`);
        return false;
      }

      const sessions = await getResponse.json();
      const session = sessions.find(s => s.group_name === groupName);

      if (session) {
        // 2. Session updaten
        const updateResponse = await fetch(`${this.baseUrl}/BotSession/${session.id}`, {
          method: 'PUT',
          headers: {
            'api_key': this.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages_today: messagesCount,
            commands_today: commandsCount,
            status: status,
            last_activity: new Date().toISOString()
          })
        });

        if (updateResponse.ok) {
          console.log(`🔄 Session '${groupName}' aktualisiert`);
          return true;
        } else {
          console.error(`❌ Fehler beim Update: HTTP ${updateResponse.status}`);
          return false;
        }
      } else {
        // 3. Neue Session erstellen wenn nicht vorhanden
        const createResponse = await fetch(`${this.baseUrl}/BotSession`, {
          method: 'POST',
          headers: {
            'api_key': this.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            group_name: groupName,
            messages_today: messagesCount,
            commands_today: commandsCount,
            status: status,
            created_at: new Date().toISOString(),
            last_activity: new Date().toISOString()
          })
        });

        if (createResponse.ok) {
          console.log(`✨ Neue Session '${groupName}' erstellt`);
          return true;
        } else {
          console.error(`❌ Fehler beim Erstellen: HTTP ${createResponse.status}`);
          return false;
        }
      }
    } catch (error) {
      console.error(`❌ Fehler beim Session-Update:`, error.message);
      return false;
    }
  }
}

// Export
module.exports = Base44Adapter;
