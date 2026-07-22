# RootsGoods Financial Manager — Full-Stack (backend + shared DB)

This turns the single-file client-side dashboard into a real multi-user app: one
server, one shared database, server-side login, and role-based access. The
front-end UI is unchanged — only its data layer was re-pointed from browser
storage to a REST API.

## What changed vs. the standalone HTML

- **Accounts live on the server.** The CEO creates CA/JA logins in *Manage Users*;
  they now work on any device. Passwords are hashed (bcrypt); the server never
  returns them.
- **One shared dataset.** Everyone reads/writes the same transactions, ledgers,
  and CA reports. Edits by one user are visible to all.
- **Sessions** use an httpOnly, signed cookie (JWT). Roles are enforced on every
  API route, not just hidden in the UI.
- The front-end’s browser-storage calls were replaced by `fetch` calls to `/api/*`
  (see `public/index.html`, top of the app script — `window.API`).

## Requirements

- Node.js 18+ (20/22 fine).
- A build toolchain for `better-sqlite3` (native module). On Debian/Ubuntu:
  `sudo apt-get install -y build-essential python3`. Prebuilt binaries are used
  automatically on most platforms; the toolchain is only a fallback.
  *(Zero-native-deps alternative: swap `better-sqlite3` for Node’s built-in
  `node:sqlite` — the code uses only `prepare/get/all/run/exec/transaction`.)*

## Run locally

```bash
cp .env.example .env      # then edit JWT_SECRET at minimum
npm install
npm start                 # -> http://localhost:3000
```

First boot seeds a CEO account (`ceo` / value of `SEED_CEO_PASSWORD`, default
`Admin@1234`) and the historical transactions. **Change the CEO password
immediately** via *Manage Users*.

## Configuration (`.env`)

| Var | Purpose |
|-----|---------|
| `PORT` | Listen port (default 3000) |
| `NODE_ENV` | Set `production` so the auth cookie is `Secure` (needs HTTPS) |
| `JWT_SECRET` | **Required in prod.** Signs session tokens. Long random string. |
| `SEED_CEO_PASSWORD` | Initial CEO password (first boot only) |
| `DATA_DIR` | Folder for the SQLite file — must be writable **and backed up** |

## Data model (SQLite)

`users`, `txns`, `ledgers`, `ca_reports`. The DB file is `DATA_DIR/rootsgoods.db`
(WAL mode). Back this file up; it is the system of record.

## API reference

All routes are same-origin and cookie-authenticated. Roles in brackets.

| Method | Path | Role | Notes |
|--------|------|------|-------|
| POST | `/api/login` | any | `{username,password}` → sets cookie |
| POST | `/api/logout` | any | clears cookie |
| GET | `/api/me` | auth | current user, else 401 |
| GET | `/api/txns` | auth | all transactions |
| POST | `/api/txns` | ceo, ja | `{txns:[...]}` bulk import; dedups by date+debit+credit; returns saved rows |
| PATCH | `/api/txns/:id` | ceo, ja | update `cat,rd,creditCat,acct,voucher,invoice,notes` |
| GET | `/api/ledgers` | auth | custom accounting heads `{exp,cr}` |
| PUT | `/api/ledgers` | ceo, ja | replace custom ledger set |
| GET | `/api/ca-reports` | ceo, ca | all saved CA summaries |
| PUT | `/api/ca-reports/:key` | ceo, ca | upsert one report |
| GET | `/api/users` | ceo | list (no passwords) |
| POST | `/api/users` | ceo | create |
| PUT | `/api/users/:username` | ceo | update name/role/password |
| DELETE | `/api/users/:username` | ceo | delete (not self, not primary CEO) |

## Deployment notes (for the next step)

- Serve strictly over **HTTPS** and set `NODE_ENV=production` (Secure cookies).
- Put the app behind your normal process manager / container; it’s a standard
  Node HTTP server that also serves the front-end from `public/`.
- **Back up `DATA_DIR`** on a schedule — that SQLite file is all the data.
- PDF statement import still loads PDF.js from cdnjs at runtime; if the host
  blocks CDNs, self-host `pdf.min.js` + `pdf.worker.min.js` and set
  `window.__resources` (see the two PDFJS URLs in `public/index.html`).
- The full production checklist (hosting, TLS, backups, rollout) is the separate
  deployment-docs task.

## Rebuilding the front-end from a new UI export

If the design team ships a new standalone HTML, re-run the transform:

```bash
node scripts/extract-template.js <new-standalone>.html public/index.html
node scripts/patch-frontend.js
node scripts/... # (re-extract seed if RAW_DATA changed)
```

`scripts/patch-frontend.js` re-applies the storage→API swap and asserts on every
anchor, so it fails loudly if the source changed shape.
