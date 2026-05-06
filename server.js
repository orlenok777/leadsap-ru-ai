// LeadSap Backend — Express + SQLite + Claude API
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

// ============ INIT ============
const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
                          'https://orlenok777.github.io,http://localhost:3000,http://127.0.0.1:3000'
                        ).split(',').map(s => s.trim());

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

const db = new Database(process.env.DB_PATH || './leadsap.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
              email TEXT UNIQUE NOT NULL,
                  password TEXT NOT NULL,
                      business_name TEXT DEFAULT '',
                          business_desc TEXT DEFAULT '',
                              business_hours TEXT DEFAULT '',
                                  system_prompt TEXT DEFAULT '',
                                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                        );
                                          CREATE TABLE IF NOT EXISTS leads (
                                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                  user_id INTEGER NOT NULL,
                                                      name TEXT, phone TEXT,
                                                          source TEXT DEFAULT 'manual',
                                                              status TEXT DEFAULT 'new',
                                                                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                      FOREIGN KEY(user_id) REFERENCES users(id)
                                                                        );
                                                                          CREATE TABLE IF NOT EXISTS messages (
                                                                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                                                  lead_id INTEGER NOT NULL,
                                                                                      role TEXT NOT NULL,
                                                                                          content TEXT NOT NULL,
                                                                                              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                                                  FOREIGN KEY(lead_id) REFERENCES leads(id)
                                                                                                    );
                                                                                                      CREATE TABLE IF NOT EXISTS appointments (
                                                                                                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                                                                              user_id INTEGER NOT NULL,
                                                                                                                  lead_id INTEGER,
                                                                                                                      title TEXT,
                                                                                                                          scheduled_at DATETIME,
                                                                                                                              status TEXT DEFAULT 'scheduled',
                                                                                                                                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                                                                                                                    );
                                                                                                                                    `);
function ensureColumn(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(column)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
          console.log(`Migration: added column ${table}.${column}`);
    }
}
ensureColumn('users', 'business_name', "TEXT DEFAULT ''");
ensureColumn('users', 'business_desc', "TEXT DEFAULT ''");
ensureColumn('users', 'business_hours', "TEXT DEFAULT ''");
ensureColumn('users', 'system_prompt', "TEXT DEFAULT ''");

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

function authMiddleware(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Нет токена' });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch { res.status(401).json({ error: 'Неверный токен' }); }
}

// ============ AUTH ============
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    const name = req.body.name || req.body.businessName;
    if (!name || !email || !password) return res.status(400).json({ error: 'Заполните все поля' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email уже занят' });
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password, business_name) VALUES (?, ?, ?, ?)')
      .run(name, email, hash, name);
    const token = jwt.sign({ id: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.lastInsertRowid, name, email } });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Неверные данные' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Неверные данные' });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT id, name, email, business_name, business_desc, business_hours, system_prompt FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
});

app.patch('/api/auth/profile', authMiddleware, (req, res) => {
    const { businessName, businessDesc, hours, systemPrompt } = req.body;
    db.prepare('UPDATE users SET business_name=?, business_desc=?, business_hours=?, system_prompt=? WHERE id=?')
      .run(businessName || '', businessDesc || '', hours || '', systemPrompt || '', req.user.id);
    res.json({ ok: true });
});

// ============ LEADS ============
app.get('/api/leads', authMiddleware, (req, res) => {
    res.json(db.prepare('SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id));
});
app.post('/api/leads', authMiddleware, (req, res) => {
    const { name, phone, source } = req.body;
    const result = db.prepare('INSERT INTO leads (user_id, name, phone, source) VALUES (?, ?, ?, ?)')
      .run(req.user.id, name || '', phone || '', source || 'manual');
    res.json({ id: result.lastInsertRowid });
});
app.patch('/api/leads/:id', authMiddleware, (req, res) => {
    db.prepare('UPDATE leads SET status = ? WHERE id = ? AND user_id = ?')
      .run(req.body.status, req.params.id, req.user.id);
    res.json({ ok: true });
});
app.delete('/api/leads/:id', authMiddleware, (req, res) => {
    db.prepare('DELETE FROM leads WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
});

// ============ CHAT ============
app.post('/api/chat/message', authMiddleware, async (req, res) => {
    if (!anthropic) return res.status(500).json({ error: 'ANTHROPIC_API_KEY не задан' });
    const { message, leadId } = req.body;
    if (!message) return res.status(400).json({ error: 'Нет сообщения' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const sysPrompt = user.system_prompt || `Ты — дружелюбный профессиональный ИИ-ассистент бизнеса.
    Бизнес: ${user.business_name || 'не указан'}
    Описание: ${user.business_desc || 'не указано'}
    Часы работы: ${user.business_hours || 'не указаны'}
    Отвечай кратко, тепло и по-русски, узнавай потребность и предлагай записаться на встречу.`;
    let history = [];
    if (leadId) {
          const msgs = db.prepare('SELECT role, content FROM messages WHERE lead_id = ? ORDER BY created_at ASC LIMIT 20').all(leadId);
          history = msgs.map(m => ({ role: m.role, content: m.content }));
    }
    try {
          const response = await anthropic.messages.create({
                  model: CLAUDE_MODEL, max_tokens: 1024, system: sysPrompt,
                  messages: [...history, { role: 'user', content: message }]
          });
          const reply = response.content[0].text;
          if (leadId) {
                  db.prepare('INSERT INTO messages (lead_id, role, content) VALUES (?, ?, ?)').run(leadId, 'user', message);
                  db.prepare('INSERT INTO messages (lead_id, role, content) VALUES (?, ?, ?)').run(leadId, 'assistant', reply);
          }
          res.json({ reply, usage: response.usage });
    } catch (err) {
          console.error('Claude API error:', err.message);
          res.status(500).json({ error: 'Ошибка Claude API: ' + err.message });
    }
});

app.get('/api/chat/history/:leadId', authMiddleware, (req, res) => {
    res.json(db.prepare('SELECT role, content, created_at FROM messages WHERE lead_id = ? ORDER BY created_at ASC').all(req.params.leadId));
});

// ============ APPOINTMENTS ============
app.get('/api/appointments', authMiddleware, (req, res) => {
    res.json(db.prepare('SELECT * FROM appointments WHERE user_id = ? ORDER BY scheduled_at ASC').all(req.user.id));
});
app.post('/api/appointments', authMiddleware, (req, res) => {
    const { title, scheduledAt, leadId } = req.body;
    const result = db.prepare('INSERT INTO appointments (user_id, lead_id, title, scheduled_at) VALUES (?, ?, ?, ?)')
      .run(req.user.id, leadId || null, title || '', scheduledAt || null);
    res.json({ id: result.lastInsertRowid });
});

// ============ HEALTH ============
app.get('/api/health', (req, res) => {
    res.json({ ok: true, claude: !!anthropic, time: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🌱 LeadSap server running on http://localhost:${PORT}`);
    console.log(`   Claude API: ${anthropic ? 'ready' : 'no API key'}`);
});
