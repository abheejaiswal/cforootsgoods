const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { issue, clear, requireAuth, requireRole } = require('./auth');

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TXN_FIELDS = ['cat', 'rd', 'creditCat', 'acct', 'voucher', 'invoice', 'notes'];

const rowToTxn = r => ({
  id: r.id, date: r.date, desc: r.descr, debit: r.debit, credit: r.credit,
  cat: r.cat, rd: r.rd, creditCat: r.creditCat, acct: r.acct,
  voucher: r.voucher, invoice: r.invoice, notes: r.notes,
});
const publicUser = u => ({ username: u.username, name: u.name, role: u.role, createdAt: u.created_at });

// ── HEALTH CHECK (public; for load balancers / container orchestration) ──────
app.get('/healthz', (req, res) => {
  try { db.prepare('SELECT 1').get(); res.json({ ok: true, ts: new Date().toISOString() }); }
  catch (e) { res.status(503).json({ ok: false }); }
});

// ── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u || !bcrypt.compareSync(password, u.pass_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  issue(res, u);
  res.json({ username: u.username, role: u.role, name: u.name });
});

app.post('/api/logout', (req, res) => { clear(res); res.json({ ok: true }); });

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, name: req.user.name });
});

// ── TRANSACTIONS ─────────────────────────────────────────────────────────────
app.get('/api/txns', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM txns ORDER BY date ASC, id ASC').all();
  res.json(rows.map(rowToTxn));
});

// Bulk import. Server assigns ids and skips duplicates (same date|debit|credit).
app.post('/api/txns', requireAuth, requireRole('ceo', 'ja'), (req, res) => {
  const incoming = Array.isArray(req.body.txns) ? req.body.txns : [];
  const existing = new Set(db.prepare('SELECT date,debit,credit FROM txns').all()
    .map(r => `${r.date}|${r.debit}|${r.credit}`));
  const ins = db.prepare(`INSERT INTO txns (id,date,descr,debit,credit,cat,rd,creditCat,acct,voucher,invoice,notes)
                          VALUES (@id,@date,@descr,@debit,@credit,@cat,@rd,@creditCat,@acct,@voucher,@invoice,@notes)`);
  const saved = [];
  const tx = db.transaction(rows => {
    for (const r of rows) {
      const key = `${r.date}|${r.debit || 0}|${r.credit || 0}`;
      if (existing.has(key)) continue;
      existing.add(key);
      const rec = {
        id: 'x' + crypto.randomBytes(8).toString('hex'),
        date: String(r.date), descr: String(r.desc || ''),
        debit: Number(r.debit) || 0, credit: Number(r.credit) || 0,
        cat: r.cat || '', rd: r.rd || '', creditCat: r.creditCat || '',
        acct: r.acct || 'Imported', voucher: r.voucher || '', invoice: r.invoice || '', notes: r.notes || '',
      };
      ins.run(rec); saved.push(rec);
    }
  });
  tx(incoming);
  res.json(saved.map(rowToTxn));
});

// Update editable fields on one transaction.
app.patch('/api/txns/:id', requireAuth, requireRole('ceo', 'ja'), (req, res) => {
  const t = db.prepare('SELECT id FROM txns WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const sets = [], vals = [];
  for (const f of TXN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(req.body, f)) { sets.push(`${f} = ?`); vals.push(String(req.body[f] ?? '')); }
  }
  if (!sets.length) return res.status(400).json({ error: 'No editable fields supplied' });
  vals.push(req.params.id);
  db.prepare(`UPDATE txns SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json(rowToTxn(db.prepare('SELECT * FROM txns WHERE id = ?').get(req.params.id)));
});

// ── LEDGERS (custom accounting heads) ────────────────────────────────────────
app.get('/api/ledgers', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT type,v,l,c FROM ledgers').all();
  res.json({
    exp: rows.filter(r => r.type === 'exp').map(r => ({ v: r.v, l: r.l, c: r.c, custom: true })),
    cr:  rows.filter(r => r.type === 'cr').map(r => ({ v: r.v, l: r.l, c: r.c, custom: true })),
  });
});

app.put('/api/ledgers', requireAuth, requireRole('ceo', 'ja'), (req, res) => {
  const exp = Array.isArray(req.body.exp) ? req.body.exp : [];
  const cr  = Array.isArray(req.body.cr)  ? req.body.cr  : [];
  const del = db.prepare('DELETE FROM ledgers');
  const ins = db.prepare('INSERT INTO ledgers (type,v,l,c) VALUES (?,?,?,?)');
  db.transaction(() => {
    del.run();
    for (const x of exp) if (x && x.v) ins.run('exp', String(x.v), String(x.l || x.v), String(x.c || '#0e7490'));
    for (const x of cr)  if (x && x.v) ins.run('cr',  String(x.v), String(x.l || x.v), String(x.c || '#0e7490'));
  })();
  res.json({ ok: true });
});

// ── CA REPORTS ───────────────────────────────────────────────────────────────
app.get('/api/ca-reports', requireAuth, requireRole('ceo', 'ca'), (req, res) => {
  const rows = db.prepare('SELECT key,data FROM ca_reports').all();
  const out = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.data); } catch (e) {} }
  res.json(out);
});

app.put('/api/ca-reports/:key', requireAuth, requireRole('ceo', 'ca'), (req, res) => {
  db.prepare('INSERT INTO ca_reports (key,data) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data = excluded.data')
    .run(req.params.key, JSON.stringify(req.body || {}));
  res.json({ ok: true });
});

// ── USERS (CEO only) ─────────────────────────────────────────────────────────
app.get('/api/users', requireAuth, requireRole('ceo'), (req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY created_at ASC').all().map(publicUser));
});

app.post('/api/users', requireAuth, requireRole('ceo'), (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase().replace(/\s+/g, '_');
  const { name, password, role } = req.body;
  if (!username || !name || !password) return res.status(400).json({ error: 'Missing fields' });
  if (!['ca', 'ja', 'ceo'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password too short' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  db.prepare('INSERT INTO users (username,name,role,pass_hash,created_at) VALUES (?,?,?,?,?)')
    .run(username, String(name), role, bcrypt.hashSync(String(password), 10), new Date().toISOString());
  res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE username = ?').get(username)));
});

app.put('/api/users/:username', requireAuth, requireRole('ceo'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const name = req.body.name != null ? String(req.body.name) : u.name;
  const role = ['ca', 'ja', 'ceo'].includes(req.body.role) ? req.body.role : u.role;
  if (u.username === 'ceo' && role !== 'ceo') return res.status(400).json({ error: 'The primary CEO account must remain CEO' });
  let hash = u.pass_hash;
  if (req.body.password) {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Password too short' });
    hash = bcrypt.hashSync(String(req.body.password), 10);
  }
  db.prepare('UPDATE users SET name = ?, role = ?, pass_hash = ? WHERE username = ?')
    .run(name, role, hash, u.username);
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE username = ?').get(u.username)));
});

app.delete('/api/users/:username', requireAuth, requireRole('ceo'), (req, res) => {
  if (req.params.username === 'ceo') return res.status(400).json({ error: 'Cannot delete the primary CEO account' });
  if (req.params.username === req.user.username) return res.status(400).json({ error: 'Cannot delete your own account' });
  db.prepare('DELETE FROM users WHERE username = ?').run(req.params.username);
  res.json({ ok: true });
});

// ── STATIC FRONT-END ─────────────────────────────────────────────────────────
// Unknown API routes must not fall through to the HTML page.
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));
app.use(express.static(PUBLIC_DIR));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

const PORT = process.env.PORT || 3000;
const HOST = "127.0.0.1";
app.listen(PORT, HOST, () => console.log(`RootsGoods Finance server on http://localhost:${PORT}`));
