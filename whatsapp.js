// LeadSap WhatsApp Cloud API integration (Meta official)
// Single tenant: credentials are read from process.env.

const Anthropic = require('@anthropic-ai/sdk');

module.exports = function attachWhatsApp({ app, db }) {
  // --- schema ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      body TEXT,
      ts TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_wa_messages_chat ON wa_messages(chat_id, ts);
    CREATE TABLE IF NOT EXISTS wa_runtime (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  function getSetting(key, fallback) {
    const r = db.prepare('SELECT value FROM wa_runtime WHERE key=?').get(key);
    return r ? r.value : fallback;
  }
  function setSetting(key, value) {
    db.prepare(`INSERT INTO wa_runtime(key,value) VALUES(?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, String(value));
  }

  const DEFAULT_PROMPT = 'Ты — менеджер компании LeadSap. Отвечай клиентам в WhatsApp коротко, дружелюбно, по делу. Помогай определиться с тарифом, отвечай на вопросы. Если не знаешь ответа — честно скажи и предложи связаться с человеком.';

  function getConfig() {
    return {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
      anthropicKey: process.env.ANTHROPIC_API_KEY || '',
      systemPrompt: getSetting('system_prompt', DEFAULT_PROMPT),
      enabled: getSetting('enabled', '1') === '1'
    };
  }

  // --- send a text message via Graph API ---
  async function sendWhatsAppText(to, text) {
    const cfg = getConfig();
    if (!cfg.accessToken || !cfg.phoneNumberId) {
      console.error('WhatsApp creds missing');
      return null;
    }
    const url = `https://graph.facebook.com/v20.0/${cfg.phoneNumberId}/messages`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + cfg.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text }
        })
      });
      const data = await r.json();
      if (!r.ok) console.error('WA send error', r.status, data);
      return data;
    } catch (e) {
      console.error('WA send exception', e.message);
      return null;
    }
  }

  // --- generate Claude reply based on chat history ---
  async function generateClaudeReply(chatId) {
    const cfg = getConfig();
    if (!cfg.anthropicKey) { console.error('ANTHROPIC_API_KEY missing'); return null; }
    const history = db.prepare(
      'SELECT direction, body FROM wa_messages WHERE chat_id=? ORDER BY id DESC LIMIT 20'
    ).all(chatId).reverse();
    const messages = history.map(h => ({
      role: h.direction === 'in' ? 'user' : 'assistant',
      content: h.body
    }));
    if (messages.length === 0 || messages[messages.length-1].role !== 'user') return null;
    try {
      const client = new Anthropic({ apiKey: cfg.anthropicKey });
      const r = await client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        system: cfg.systemPrompt,
        messages
      });
      return r.content && r.content[0] && r.content[0].text || null;
    } catch (e) {
      console.error('Claude error', e.message);
      return null;
    }
  }

  // --- webhook verification (Meta requires GET to confirm endpoint) ---
  app.get('/api/wa/webhook', (req, res) => {
    const cfg = getConfig();
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === cfg.verifyToken && cfg.verifyToken) {
      console.log('WA webhook verified');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  // --- webhook receiver ---
  app.post('/api/wa/webhook', async (req, res) => {
    res.sendStatus(200); // ack immediately
    try {
      const body = req.body;
      if (!body || body.object !== 'whatsapp_business_account') return;
      for (const entry of (body.entry || [])) {
        for (const change of (entry.changes || [])) {
          const value = change.value || {};
          const messages = value.messages || [];
          for (const msg of messages) {
            if (msg.type !== 'text') continue;
            const from = msg.from;
            const text = msg.text && msg.text.body;
            if (!text) continue;
            db.prepare('INSERT INTO wa_messages(chat_id, direction, body) VALUES(?,?,?)')
              .run(from, 'in', text);
            const cfg = getConfig();
            if (!cfg.enabled) continue;
            const reply = await generateClaudeReply(from);
            if (reply) {
              await sendWhatsAppText(from, reply);
              db.prepare('INSERT INTO wa_messages(chat_id, direction, body) VALUES(?,?,?)')
                .run(from, 'out', reply);
            }
          }
        }
      }
    } catch (e) {
      console.error('webhook handler error', e);
    }
  });

  // --- API for dashboard ---
  app.get('/api/wa/status', (req, res) => {
    const cfg = getConfig();
    res.json({
      configured: !!(cfg.accessToken && cfg.phoneNumberId && cfg.verifyToken),
      hasAnthropic: !!cfg.anthropicKey,
      enabled: cfg.enabled,
      systemPrompt: cfg.systemPrompt,
      webhookUrl: '/api/wa/webhook'
    });
  });

  app.post('/api/wa/settings', (req, res) => {
    const { systemPrompt, enabled } = req.body || {};
    if (typeof systemPrompt === 'string') setSetting('system_prompt', systemPrompt.slice(0, 4000));
    if (typeof enabled === 'boolean') setSetting('enabled', enabled ? '1' : '0');
    res.json({ ok: true });
  });

  app.get('/api/wa/conversations', (req, res) => {
    const rows = db.prepare(`
      SELECT chat_id, MAX(ts) as last_ts, COUNT(*) as cnt,
        (SELECT body FROM wa_messages m2 WHERE m2.chat_id=m.chat_id ORDER BY id DESC LIMIT 1) as last_body,
        (SELECT direction FROM wa_messages m2 WHERE m2.chat_id=m.chat_id ORDER BY id DESC LIMIT 1) as last_dir
      FROM wa_messages m GROUP BY chat_id ORDER BY last_ts DESC LIMIT 50
    `).all();
    res.json(rows);
  });

  app.get('/api/wa/messages', (req, res) => {
    const chatId = String(req.query.chat || '');
    if (!chatId) return res.json([]);
    const rows = db.prepare('SELECT direction, body, ts FROM wa_messages WHERE chat_id=? ORDER BY id ASC LIMIT 200').all(chatId);
    res.json(rows);
  });

  console.log('WhatsApp module attached');
};
