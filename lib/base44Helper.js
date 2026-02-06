/**
 * Base44 Integration Helper
 * Einfache Funktionen zur Integration von Base44 in den Bot
 */

const { getInstance: getBase44Integration } = require('./base44Integration');

/**
 * Initialisiert Base44-Integration
 */
async function initBase44() {
  const integration = getBase44Integration();
  if (!integration.adapter) {
    await integration.initializeAdapter();
  }
  return integration;
}

/**
 * Erstellt einen Log-Eintrag in Base44
 * @param {string} type - Typ (command, join, leave, error, etc.)
 * @param {string} message - Log-Nachricht
 * @param {string} groupName - Name der Gruppe
 * @param {string} userName - Name des Benutzers
 * @param {string} severity - Severity (info, warning, error)
 */
async function createLog(type, message, groupName, userName, severity = 'info') {
  const integration = getBase44Integration();
  if (!integration.adapter) return false;

  return await integration.createLog(type, message, groupName, userName, severity);
}

/**
 * Zählt die Command-Nutzung hoch
 * @param {string} commandName - Name des Commands
 */
async function incrementCommandUsage(commandName) {
  const integration = getBase44Integration();
  if (!integration.adapter) return false;

  return await integration.incrementCommandUsage(commandName);
}

/**
 * Aktualisiert oder erstellt eine Session
 * @param {string} groupName - Name der Gruppe
 * @param {number} messagesCount - Anzahl Nachrichten heute
 * @param {number} commandsCount - Anzahl Commands heute
 * @param {string} status - Status (online, offline, away)
 */
async function updateSession(groupName, messagesCount = 0, commandsCount = 0, status = 'online') {
  const integration = getBase44Integration();
  if (!integration.adapter) return false;

  return await integration.updateSession(groupName, messagesCount, commandsCount, status);
}

/**
 * Hilfsfunktion: Loggt Command-Ausführung
 * @param {string} commandName - Command-Name
 * @param {string} groupName - Gruppen-Name
 * @param {string} userName - Benutzer-Name
 * @param {string} message - Befehl der ausgeführt wurde
 */
async function logCommandExecution(commandName, groupName, userName, message = '') {
  await createLog('command', `!${commandName} ausgeführt`, groupName, userName, 'info');
  await incrementCommandUsage(commandName);
}

/**
 * Gibt Base44-Status aus
 */
function getBase44Status() {
  const integration = getBase44Integration();
  return integration.getStatus();
}

/**
 * Middleware für Command-Logging in Baileys-Bots
 * Beispiel-Verwendung:
 * if (isCommand(message)) {
 *   await base44CommandMiddleware('ping', 'Meine Gruppe', 'UserName');
 * }
 */
async function base44CommandMiddleware(commandName, groupName, userName) {
  await logCommandExecution(commandName, groupName, userName);
}

// Exportieren
module.exports = {
  initBase44,
  createLog,
  incrementCommandUsage,
  updateSession,
  logCommandExecution,
  logCommandMiddleware: base44CommandMiddleware,
  getBase44Status
};
