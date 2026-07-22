// Self-contained WAL-safe backup, usable inside the Docker container
// (uses the app's own better-sqlite3 — no sqlite3 CLI needed):
//   docker compose exec app node server/backup.js
// Bare-metal:
//   DATA_DIR=./data BACKUP_DIR=./backups node server/backup.js
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '30', 10);
const SRC = path.join(DATA_DIR, 'rootsgoods.db');

(async () => {
  if (!fs.existsSync(SRC)) { console.error('ERROR: database not found at ' + SRC); process.exit(1); }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(BACKUP_DIR, `rootsgoods-${stamp}.db`);

  const db = new Database(SRC, { readonly: true });
  await db.backup(out);            // consistent, WAL-safe copy
  db.close();

  // gzip and remove the plain copy
  const gz = out + '.gz';
  fs.createReadStream(out).pipe(zlib.createGzip()).pipe(fs.createWriteStream(gz)).on('finish', () => {
    fs.unlinkSync(out);
    console.log('backup written: ' + gz);

    // Retention
    const cutoff = Date.now() - RETENTION_DAYS * 86400000;
    for (const f of fs.readdirSync(BACKUP_DIR)) {
      if (/^rootsgoods-.*\.db\.gz$/.test(f)) {
        const p = path.join(BACKUP_DIR, f);
        if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); console.log('pruned ' + f); }
      }
    }
  });
})().catch(e => { console.error(e); process.exit(1); });
