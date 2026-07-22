# Deployment Guide — RootsGoods Financial Manager

Audience: the deployment/backend team. This app is a single Node.js service that
serves both the API and the front-end, backed by a SQLite database file. There is
no separate database server and no build step for the front-end.

Two supported paths: **A) Docker Compose** (recommended) or **B) bare-metal +
systemd**. Pick one.

---

## 0. Before you start — decisions & secrets

- **Domain/hostname** for the app (e.g. `finance.example.com`) and a TLS certificate
  for it (Let's Encrypt or a corporate CA).
- **`JWT_SECRET`** — generate once, keep secret:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- **`SEED_CEO_PASSWORD`** — the first-boot CEO password; will be changed after login.
- **Where the data lives** (`DATA_DIR`) and **where backups go** — both must be on
  durable, backed-up storage. The SQLite file is the entire system of record.
- **Access model:** the app is for a handful of internal users. Consider putting it
  behind your VPN or an office-IP allow-list in addition to its own login (the nginx
  config has a commented `allow/deny` block for this).

---

## A. Docker Compose (recommended)

Prereqs: Docker + Docker Compose on the host.

```bash
# 1. Put the project on the server, then:
cp .env.production.example .env
#    edit .env — set JWT_SECRET and SEED_CEO_PASSWORD

# 2. TLS: drop your certificate and key here (names matter):
mkdir -p deploy/certs
#    deploy/certs/fullchain.pem   deploy/certs/privkey.pem

# 3. Edit deploy/nginx.conf — set server_name to your domain.

# 4. Build and start:
docker compose up -d --build

# 5. Check health:
curl -sk https://finance.example.com/healthz     # -> {"ok":true,...}
docker compose ps
docker compose logs -f app
```

The app container has no public port; only nginx (80/443) is exposed and proxies to
it. Data persists in the `rootsgoods-data` named volume.

**Updating to a new version:** replace the project files, then
`docker compose up -d --build`. The data volume is untouched.

---

## B. Bare-metal + systemd

Prereqs: Node.js 20+, and build tools for the native SQLite module:
`sudo apt-get install -y build-essential python3`.

```bash
sudo useradd --system --home /opt/rootsgoods rootsgoods
sudo mkdir -p /opt/rootsgoods && sudo chown rootsgoods:rootsgoods /opt/rootsgoods
# copy the project into /opt/rootsgoods, then as the service user:
sudo -u rootsgoods bash -c '
  cd /opt/rootsgoods
  npm install --omit=dev
  mkdir -p data
  cp .env.production.example .env      # then edit: JWT_SECRET, SEED_CEO_PASSWORD, DATA_DIR=/opt/rootsgoods/data
'
sudo cp deploy/rootsgoods.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rootsgoods
curl -s http://127.0.0.1:3000/healthz
```

Then put nginx (or your existing load balancer) in front for TLS, proxying to
`127.0.0.1:3000`. Use `deploy/nginx.conf` as a starting point (change `proxy_pass`
to `http://127.0.0.1:3000`). For certificates, `certbot --nginx` is the simplest
route with Let's Encrypt.

---

## First-login steps (either path)

1. Browse to `https://<your-domain>/`.
2. Log in as `ceo` with the `SEED_CEO_PASSWORD` you set.
3. Go to **Manage Users → change the CEO password immediately.**
4. Create the CA and Junior Accountant accounts and hand over their credentials
   over a secure channel.

---

## Backups & restore

The SQLite file at `DATA_DIR/rootsgoods.db` (plus its `-wal`/`-shm` siblings) is
everything. Back it up on a schedule with the included script:

```bash
# Bare-metal:
DATA_DIR=/opt/rootsgoods/data BACKUP_DIR=/opt/backups RETENTION_DAYS=30 ./deploy/backup.sh

# Docker (writes into the data volume under /data/backups; copy those off-host):
docker compose exec -e BACKUP_DIR=/data/backups app node server/backup.js
```

Schedule it with cron (example every 6 hours):

```
0 */6 * * *  DATA_DIR=/opt/rootsgoods/data BACKUP_DIR=/opt/backups /opt/rootsgoods/deploy/backup.sh >> /var/log/rg-backup.log 2>&1
```

Store copies off-host (object storage / another server). **Test a restore:**

```bash
# stop the app, replace the db, start again
gunzip -c /backups/rootsgoods-YYYYMMDD-HHMMSS.db.gz > "$DATA_DIR/rootsgoods.db"
rm -f "$DATA_DIR/rootsgoods.db-wal" "$DATA_DIR/rootsgoods.db-shm"
# then start the service and verify /healthz + a login
```

---

## Rollout checklist (go-live)

1. Provision host, install Docker (path A) or Node (path B).
2. Set `.env` (JWT_SECRET, SEED_CEO_PASSWORD, DATA_DIR).
3. Install TLS certificate; set the domain in nginx.
4. Start the service; confirm `/healthz` returns `{"ok":true}`.
5. Log in as CEO, change password, create CA/JA users.
6. Smoke test: import a statement (PDF + CSV), tag a transaction, log in as CA and
   JA and confirm each sees the correct menus and the **same** data.
7. Enable scheduled backups; run one manually and verify the file appears.
8. Note the rollback plan (below). Announce go-live.

---

## Rollback

- **App:** redeploy the previous version (Docker: `docker compose up -d --build`
  from the prior project; systemd: restore the prior `/opt/rootsgoods` and
  `systemctl restart rootsgoods`). The database is separate and unaffected.
- **Data:** restore the most recent good backup (see above).

---

## Operations reference

- **Health:** `GET /healthz` → `{"ok":true}` (used by the Docker healthcheck /
  load balancer).
- **Logs:** `docker compose logs -f app` or `journalctl -u rootsgoods -f`.
- **Ports:** app listens on `PORT` (default 3000), internal only; nginx serves
  80/443.
- **Runtime egress:** PDF statement import fetches PDF.js from cdnjs on first use.
  If outbound internet is blocked, self-host `pdf.min.js` + `pdf.worker.min.js`
  and set `window.__resources` in `public/index.html`.

## Security checklist

- [ ] HTTPS only; HTTP redirects to HTTPS.
- [ ] `NODE_ENV=production` (marks the session cookie `Secure`).
- [ ] Strong, unique `JWT_SECRET`; not committed to git.
- [ ] Default CEO password changed after first login.
- [ ] `.env`, `data/`, and backups excluded from version control (see `.gitignore`).
- [ ] Optional: office-IP allow-list or VPN in front of the app.
- [ ] Backups scheduled, copied off-host, and a restore has been tested.
