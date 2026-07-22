const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { RAW_DATA, autoCat, autoRd, autoCreditCat } = require('./seed-data');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'rootsgoods.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username    TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('ceo','ca','ja')),
    pass_hash   TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS txns (
    id        TEXT PRIMARY KEY,
    date      TEXT NOT NULL,
    descr     TEXT NOT NULL,
    debit     REAL NOT NULL DEFAULT 0,
    credit    REAL NOT NULL DEFAULT 0,
    cat       TEXT DEFAULT '',
    rd        TEXT DEFAULT '',
    creditCat TEXT DEFAULT '',
    acct      TEXT DEFAULT 'SBI CC',
    voucher   TEXT DEFAULT '',
    invoice   TEXT DEFAULT '',
    notes     TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS ledgers (
    type TEXT NOT NULL CHECK (type IN ('exp','cr')),
    v    TEXT NOT NULL,
    l    TEXT NOT NULL,
    c    TEXT NOT NULL,
    PRIMARY KEY (type, v)
  );
  CREATE TABLE IF NOT EXISTS ca_reports (
    key  TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`);

// ── First-run seed ───────────────────────────────────────────────────────────
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  if (userCount === 0) {
    const pass = process.env.SEED_CEO_PASSWORD || 'Admin@1234';
    db.prepare('INSERT INTO users (username,name,role,pass_hash,created_at) VALUES (?,?,?,?,?)')
      .run('ceo', 'CEO Admin', 'ceo', bcrypt.hashSync(pass, 10), new Date().toISOString());
    console.log('[seed] created default CEO account (username: ceo)');
  }

  const txnCount = db.prepare('SELECT COUNT(*) n FROM txns').get().n;
  if (txnCount === 0) {
    const ins = db.prepare(`INSERT INTO txns (id,date,descr,debit,credit,cat,rd,creditCat,acct,voucher,invoice,notes)
                            VALUES (@id,@date,@descr,@debit,@credit,@cat,@rd,@creditCat,@acct,@voucher,@invoice,@notes)`);
    const tx = db.transaction(rows => { for (const r of rows) ins.run(r); });
    tx(RAW_DATA.map(r => {
      const cat = r[3] > 0 ? autoCat(r[2]) : '';
      const creditCat = r[4] > 0 ? autoCreditCat(r[2]) : '';
      return { id: r[0], date: r[1], descr: r[2], debit: r[3], credit: r[4],
               cat, rd: autoRd(cat), creditCat, acct: 'SBI CC', voucher: '', invoice: '', notes: '' };
    }));
    console.log('[seed] inserted ' + RAW_DATA.length + ' transactions');
  }
}
seed();

module.exports = { db };
