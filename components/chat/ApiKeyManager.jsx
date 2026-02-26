import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Trash2, PlusCircle, X, Check } from 'lucide-react';
import { useClipboard } from 'use-clipboard-copy';
import { base44 } from '@base44/sdk';

// Modal component to manage API keys
export default function ApiKeyManager({ open, setOpen }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const clipboard = useClipboard();

  useEffect(() => {
    if (open) {
      fetchKeys();
    }
  }, [open]);

  async function fetchKeys() {
    try {
      setLoading(true);
      const me = await base44.auth.getMe();
      setKeys(me.api_keys || []);
    } catch (e) {
      console.error('Fetch keys error', e);
    } finally {
      setLoading(false);
    }
  }

  function randKey() {
    return (
      'sk_' +
      Math.random().toString(36).substring(2) +
      Math.random().toString(36).substring(2)
    );
  }

  async function addKey() {
    const newKey = {
      // crypto.randomUUID is not available in all environments (e.g. older
      // browsers). Fallback auf eine einfache generierte ID.
      id: typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now(),
      key: randKey(),
      name: `Key ${keys.length + 1}`,
      created: new Date().toISOString()
    };

    const updated = [...keys, newKey];
    await base44.auth.updateMe({ api_keys: updated });
    setKeys(updated);
  }

  async function removeKey(id) {
    if (!confirm('API-Key wirklich löschen?')) return;
    const updated = keys.filter(k => k.id !== id);
    await base44.auth.updateMe({ api_keys: updated });
    setKeys(updated);
  }

  function copyKey(key) {
    clipboard.copy(key);
    alert('In die Zwischenablage kopiert');
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-gray-900 rounded-lg w-full max-w-xl p-6 relative text-white"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.8 }}
          >
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
            <h2 className="text-2xl font-semibold mb-4">API‑Keys verwalten</h2>
            <div className="space-y-4 max-h-80 overflow-auto">
              {loading && <p>Lädt...</p>}
              {keys.map(k => (
                <div
                  key={k.id}
                  className="flex items-center justify-between bg-gray-800 p-3 rounded"
                >
                  <div>
                    <p className="font-mono break-all">{k.key}</p>
                    <p className="text-xs text-gray-400">{k.name}</p>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => copyKey(k.key)}>
                      <Copy size={16} />
                    </button>
                    <button onClick={() => removeKey(k.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="mt-4 flex items-center space-x-2 text-green-400 hover:text-green-200"
              onClick={addKey}
            >
              <PlusCircle size={18} />
              <span>Neuen Schlüssel erstellen</span>
            </button>

            {/* Beispielcode für Bots */}
            <div className="mt-6 border-t border-gray-700 pt-4 text-sm space-y-3">
              <p className="font-semibold">Beispiele</p>
              <pre className="bg-gray-800 p-2 rounded">
                <code className="block">
{`// WhatsApp (Node.js)
const { Client } = require('whatsapp-web.js');
const axios = require('axios');
client.on('message', async (msg) => {
  const res = await axios.post(API_URL, {message: msg.body}, {
    headers: {'Authorization': \\`Bearer \\${API_KEY}\\`}
  });
  await msg.reply(res.data.response);
});`}
                </code>
              </pre>
              <pre className="bg-gray-800 p-2 rounded">
                <code className="block">
{`# Telegram (Python)
import requests
res = requests.post(API_URL, json={'message': text},
    headers={'Authorization': f'Bearer {API_KEY}'})
await update.message.reply_text(res.json()['response'])`}
                </code>
              </pre>
              <pre className="bg-gray-800 p-2 rounded">
                <code className="block">
{`// Discord (JS)
const res = await axios.post(API_URL, {message: content}, {
  headers: {'Authorization': \\`Bearer \\${API_KEY}\\`}
});
await message.reply(res.data.response);`}
                </code>
              </pre>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
