#!/usr/bin/env bash
# WAL-safe SQLite backup with gzip + rotation. Delegates to server/backup.js,
# which uses the app's own better-sqlite3 (no sqlite3 CLI required), so the same
# script works on bare-metal and inside the Docker container.
#
# Bare-metal (cron every 6h):
#   0 */6 * * *  DATA_DIR=/opt/rootsgoods/data BACKUP_DIR=/opt/backups RETENTION_DAYS=30 \
#                /opt/rootsgoods/deploy/backup.sh >> /var/log/rg-backup.log 2>&1
# Docker:
#   docker compose exec -e BACKUP_DIR=/data/backups app node server/backup.js
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$HERE/server/backup.js"
