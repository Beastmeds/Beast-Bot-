const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const NYXION_API = process.env.NYXION_API_URL || 'https://nyxionai.onrender.com/api/chat';
const NYX_API_KEY = process.env.NYX_API_KEY || 'nyx_4OefNuxWk4XdrsBP0Abqm1Jv6JQYz77wPwU1JGj2MNM';

// Store session context for ongoing conversations
const sessionContexts = new Map();
const CONTEXT_TIMEOUT = 15 * 60 * 1000; // 15 minutes

/**
 * Initialize Nyxion AI module
 * @param {object} sock WhatsApp socket connection
 * @returns {object} Nyxion handler functions
 */
function initNyxion(sock) {
    // Clean up old sessions periodically
    setInterval(() => {
        const now = Date.now();
        for (const [sessionId, context] of sessionContexts.entries()) {
            if (now - context.lastActivity > CONTEXT_TIMEOUT) {
                sessionContexts.delete(sessionId);
                console.log(`🧹 Nyxion Session ${sessionId} timeout cleared`);
            }
        }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return {
        handleNyxionMessage,
        getSessionContext,
        clearSession,
        isNyxionCommand
    };
}

/**
 * Check if message is a Nyxion command
 * @param {string} text Message text
 * @returns {boolean}
 */
function isNyxionCommand(text) {
    if (!text) return false;
    return text.toLowerCase().startsWith('!nyx ') || text.toLowerCase() === '!nyx';
}

/**
 * Get or create session context
 * @param {string} sessionId User JID or Group JID
 * @returns {object} Session context
 */
function getSessionContext(sessionId) {
    if (!sessionContexts.has(sessionId)) {
        sessionContexts.set(sessionId, {
            messages: [],
            lastActivity: Date.now(),
            createdAt: Date.now()
        });
    }
    const context = sessionContexts.get(sessionId);
    context.lastActivity = Date.now();
    return context;
}

/**
 * Clear session context
 * @param {string} sessionId User JID or Group JID
 */
function clearSession(sessionId) {
    if (sessionContexts.has(sessionId)) {
        sessionContexts.delete(sessionId);
        console.log(`🗑️ Nyxion Session ${sessionId} cleared`);
    }
}

/**
 * Handle Nyxion AI message
 * @param {string} userMessage User input
 * @param {string} sessionId Session/Chat ID
 * @param {object} sock WhatsApp socket
 * @param {string} from Sender JID
 * @returns {Promise<string>} AI response
 */
async function handleNyxionMessage(userMessage, sessionId, sock, from) {
    try {
        const context = getSessionContext(sessionId);

        // Add user message to context
        context.messages.push({
            role: 'user',
            content: userMessage
        });

        // Keep only last 10 messages to avoid token overflow
        if (context.messages.length > 10) {
            context.messages = context.messages.slice(-10);
        }

        console.log(`🤖 Nyxion: Verarbeite Anfrage von ${from}...`);
        console.log(`📨 Sende Anfrage: message="${userMessage}", session_id="${sessionId}"`);

        // Call Nyxion API
        const response = await axios.post(
            NYXION_API,
            {
                message: userMessage,
                session_id: sessionId,
                messages: context.messages.slice(0, -1), // Previous messages for context
                api_key: NYX_API_KEY
            },
            {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${NYX_API_KEY}`
                }
            }
        );

        console.log('🔍 API Response Status:', response.status);
        console.log('🔍 API Response Data:', JSON.stringify(response.data, null, 2));

        const nyxionReply = response.data.response || response.data.message || response.data.reply || response.data.answer || 'Keine Antwort erhalten.';

        console.log(`📝 Extrahierte Antwort: "${nyxionReply}"`);

        // Add AI response to context
        context.messages.push({
            role: 'assistant',
            content: nyxionReply
        });

        console.log(`✅ Nyxion Antwort erhalten (${nyxionReply.length} Zeichen)`);

        return nyxionReply;

    } catch (error) {
        console.error('❌ Nyxion API Error:', error.message);

        let errorMessage = 'Sorry, Nyxion ist gerade offline oder es gab einen Fehler.';

        if (error.response?.status === 429) {
            errorMessage = '⚠️ Rate limit erreicht. Bitte später versuchen.';
        } else if (error.response?.status === 401) {
            errorMessage = '🔐 API-Authentifizierung fehlgeschlagen.';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = '🌐 Nyxion-Service ist nicht erreichbar.';
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = '🌍 Nyxion-Host konnte nicht aufgelöst werden.';
        }

        return errorMessage;
    }
}

/**
 * Send formatted Nyxion response
 * @param {object} sock WhatsApp socket
 * @param {string} from Recipient JID
 * @param {string} response AI response
 * @param {string} prefix Optional prefix
 */
async function sendNyxionResponse(sock, from, response, prefix = '🤖 Nyxion:') {
    try {
        console.log(`📤 Sende Nyxion Antwort an ${from}: "${response.substring(0, 50)}..."`);
        
        // Split long messages if needed
        const maxLength = 4096;
        if (response.length > maxLength) {
            const messages = [];
            for (let i = 0; i < response.length; i += maxLength) {
                messages.push(response.substring(i, i + maxLength));
            }
            
            for (const msg of messages) {
                console.log(`📤 Sende Teilnachricht (${msg.length} Zeichen)`);
                await sock.sendMessage(from, { text: msg });
                await new Promise(r => setTimeout(r, 500)); // Delay between messages
            }
        } else {
            const fullMessage = prefix ? `${prefix}\n\n${response}` : response;
            console.log(`📤 Sende vollständige Nachricht (${fullMessage.length} Zeichen)`);
            await sock.sendMessage(from, { text: fullMessage });
        }
        
        console.log(`✅ Nyxion Antwort erfolgreich gesendet`);
    } catch (error) {
        console.error('❌ Fehler beim Senden der Nyxion-Antwort:', error.message);
        console.error('Stack:', error.stack);
        try {
            await sock.sendMessage(from, { text: '❌ Fehler beim Senden der Antwort.' });
        } catch (e) {
            console.error('Fallback message send failed:', e.message);
        }
    }
}

module.exports = {
    initNyxion,
    handleNyxionMessage,
    sendNyxionResponse,
    isNyxionCommand,
    getSessionContext,
    clearSession
};
