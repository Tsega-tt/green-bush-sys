# Kidist Cafe — Production Deployment Guide

Centralized LAN deployment: one server holds PostgreSQL + the Node API + the
built React app; cashier/manager tablets and PCs connect over the local
network. This guide covers a single-store-server topology that several
terminals share.

---

## 0. Deployment checklist (run top to bottom)

- [ ] Server provisioned (see topology below), static LAN IP assigned.
- [ ] PostgreSQL 16 installed, `cafe_bakery_db` created, dedicated DB roles created.
- [ ] Node.js 20 LTS + `pm2` (or systemd unit) installed.
- [ ] Repo cloned to `/opt/kidist` (Linux) or `C:\kidist` (Windows).
- [ ] `.env` created from `env.example`, **all** values reviewed (§6).
- [ ] `INVENTORY_BACKEND=pg` set.
- [ ] `npm ci --omit=dev` at repo root.
- [ ] `npm run build` (builds `frontend/build`).
- [ ] `npm run inv:migrate` → schema created.
- [ ] (If migrating legacy data) `npm run inv:migrate-json` then `npm run inv:verify`.
- [ ] `INVENTORY_TEST_DB=1 npm run inv:test` passes against a scratch DB.
- [ ] `npm run inv:concurrency-test` passes (proves no oversell under load).
- [ ] Process manager configured to run **one** API instance (fork mode — see §3 note).
- [ ] nginx reverse proxy + TLS configured (§4–5).
- [ ] Nightly backup scheduled (§7) and a **test restore** performed (§8).
- [ ] WAL archiving / PITR enabled (§9).
- [ ] Snapshot + fraud-scan cron jobs scheduled (§10).
- [ ] Monitoring/log rotation in place (§11).
- [ ] Staged rollout plan agreed (§12).
- [ ] Admin user created; one user per real person with the correct role.

---

## 1. Server sizing (single store)

| Load | vCPU | RAM | Disk |
|------|------|-----|------|
| ≤ 10 concurrent terminals | 2 | 4 GB | 50 GB SSD |
| 10–30 terminals / busy bar | 4 | 8 GB | 100 GB SSD |

Disk must hold: DB + WAL archive + nightly backups + permanent attachments
(`INVENTORY_STORAGE_ROOT`). Attachments grow over time — size for 2–3 years of
invoices/GRNs (scans are typically 100 KB–2 MB each).

---

## 2. PostgreSQL production configuration

`postgresql.conf` starting points for an 8 GB server (scale to your RAM):

```conf
# Memory
shared_buffers = 2GB                  # ~25% RAM
effective_cache_size = 6GB            # ~75% RAM
work_mem = 32MB
maintenance_work_mem = 512MB

# Checkpoints / WAL (also required for PITR, §9)
wal_level = replica
max_wal_size = 4GB
min_wal_size = 1GB
checkpoint_completion_target = 0.9
archive_mode = on
archive_command = 'test ! -f /var/lib/pg-wal-archive/%f && cp %p /var/lib/pg-wal-archive/%f'

# Concurrency — must exceed INVENTORY_PG_POOL_MAX + legacy pool + admin headroom
max_connections = 100

# Safety nets (the app also sets per-session timeouts; these are backstops)
statement_timeout = 30000             # 30s hard cap
idle_in_transaction_session_timeout = 30000
lock_timeout = 10000

# Observability
log_min_duration_statement = 1000     # log queries >1s
log_lock_waits = on
log_checkpoints = on
log_line_prefix = '%m [%p] %u@%d '
```

`pg_hba.conf` — restrict to the LAN subnet only, never `0.0.0.0/0`:

```conf
# TYPE  DATABASE        USER            ADDRESS              METHOD
local   all             all                                  scram-sha-256
host    cafe_bakery_db  kidist_app      192.168.10.0/24      scram-sha-256
host    cafe_bakery_db  kidist_backup   127.0.0.1/32         scram-sha-256
```

Roles (least privilege):

```sql
CREATE ROLE kidist_app   LOGIN PASSWORD '...'  CONNECTION LIMIT 60;
CREATE ROLE kidist_backup LOGIN PASSWORD '...' CONNECTION LIMIT 4;
GRANT CONNECT ON DATABASE cafe_bakery_db TO kidist_app, kidist_backup;
-- app gets DML on the inventory schema; backup gets read-only.
```

The app's pool is bounded by `INVENTORY_PG_POOL_MAX` (default 25). Keep
`max_connections` comfortably above the sum of all pools.

---

## 3. Process manager

### PM2 (recommended for Windows or Linux)

`ecosystem.config.js` at repo root:

```js
module.exports = {
  apps: [{
    name: 'kidist-api',
    script: 'server.js',
    instances: 1,            // ⚠️ MUST be 1 — see note below
    exec_mode: 'fork',       // NOT cluster
    max_memory_restart: '600M',
    env: { NODE_ENV: 'production' },
    out_file: 'logs/api-out.log',
    error_file: 'logs/api-err.log',
    time: true,
  }],
};
```

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup        # generate boot script (Linux); on Windows use pm2-startup or a service wrapper
```

> **⚠️ Single-instance requirement.** The realtime layer
> (`inventory/realtime/sse.js`) keeps connected clients in an **in-process
> `Set`**. In cluster mode each worker has its own set, so a change handled by
> worker A would not push to tablets connected to worker B → stale screens.
> Run **one** fork-mode instance. If you outgrow one process, introduce a shared
> pub/sub (Redis) for SSE fan-out before scaling out — do not just bump
> `instances`.

### systemd (Linux alternative)

```ini
# /etc/systemd/system/kidist-api.service
[Unit]
Description=Kidist Cafe API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=kidist
WorkingDirectory=/opt/kidist
EnvironmentFile=/opt/kidist/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
MemoryMax=700M

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now kidist-api
```

---

## 4. nginx reverse proxy

SSE needs buffering disabled and long read timeouts, or live updates stall.

```nginx
upstream kidist_api { server 127.0.0.1:5000; keepalive 16; }

server {
  listen 443 ssl http2;
  server_name kidist.local;            # or the server's LAN hostname

  ssl_certificate     /etc/ssl/kidist/fullchain.pem;
  ssl_certificate_key /etc/ssl/kidist/privkey.pem;

  client_max_body_size 15m;            # invoice/GRN scan uploads

  # Built React app
  root /opt/kidist/frontend/build;
  index index.html;

  location / { try_files $uri /index.html; }

  # API
  location /api/ {
    proxy_pass http://kidist_api;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 3600s;          # keep SSE alive
  }

  # Realtime stream — never buffer
  location = /api/inv/events {
    proxy_pass http://kidist_api;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
  }

  location = /api/orders/stream {       # legacy order SSE, same treatment
    proxy_pass http://kidist_api;
    proxy_buffering off;
    proxy_read_timeout 3600s;
  }
}

server { listen 80; server_name kidist.local; return 301 https://$host$request_uri; }
```

---

## 5. SSL / TLS for a LAN

There is no public DNS, so use one of:

1. **Internal CA (recommended).** Create a small CA, issue a cert for the
   server hostname/IP, install the CA root on every tablet/PC once. No browser
   warnings, fully offline.
2. **mkcert** for a quick trusted local cert during pilot.
3. **Self-signed** only for the earliest testing — browsers warn and some SSE
   reconnect behaviour degrades; don't ship it.

Always serve over HTTPS so the `x-user-id` header and uploads aren't sent in
clear text on the LAN. Renew internal certs on a calendar reminder (e.g. 1-year
validity).

---

## 6. Environment variable checklist

From `env.example` — review every line before go-live:

| Var | Production value / note |
|-----|------|
| `INVENTORY_BACKEND` | **`pg`** (the whole module is gated on this) |
| `DB_HOST/PORT/NAME/USER/PASSWORD` | point at prod PG; use the `kidist_app` role, strong password |
| `NODE_ENV` | `production` |
| `PORT` | `5000` (proxied by nginx) |
| `INVENTORY_TZ` | `Africa/Addis_Ababa` — drives daily-closing & snapshot boundaries |
| `INVENTORY_PG_POOL_MAX` | 25 (≤ `max_connections` budget) |
| `INVENTORY_PG_STATEMENT_TIMEOUT_MS` | 15000 |
| `INVENTORY_PG_IDLE_TXN_TIMEOUT_MS` | 10000 |
| `INVENTORY_STORAGE_ROOT` | absolute path on a backed-up volume |
| `INVENTORY_BACKUP_DIR` | absolute path, separate disk if possible |
| `INVENTORY_BACKUP_OFFSITE_DIR` | a mounted NAS/USB or sync folder |
| `PG_DUMP_PATH` | full path to `pg_dump` on Windows |
| JWT/session secrets (legacy app) | rotate to strong random values |

Never commit the real `.env`. Restrict its file permissions (`chmod 600`).

---

## 7. Backup automation

A `pg_dump` (custom format) + checksum + offsite-copy script already exists:

```bash
npm run inv:backup        # writes <ts>.dump + .sha256 to INVENTORY_BACKUP_DIR, copies offsite
```

Schedule nightly (outside service hours) **and** keep WAL archiving (§9) for
point-in-time recovery between dumps.

- **Linux cron:** `15 3 * * *  cd /opt/kidist && /usr/bin/node scripts/inventory/backup.js >> logs/backup.log 2>&1`
- **Windows Task Scheduler:** daily 03:15, action `node C:\kidist\scripts\inventory\backup.js`.

Also back up `INVENTORY_STORAGE_ROOT` (attachments live on disk; the DB only
stores metadata + checksum). Retention suggestion: 14 daily, 8 weekly, 12
monthly. Verify the offsite copy lands.

---

## 8. Restore procedure (runbook)

> Practice this on a scratch DB **before** you need it. An untested backup is not a backup.

```bash
# 1. Stop the API so nothing writes during restore.
pm2 stop kidist-api            # or: systemctl stop kidist-api

# 2. (Safety) snapshot current state in case the restore is wrong.
pg_dump -Fc cafe_bakery_db > /tmp/pre-restore.dump

# 3. Restore the chosen dump (custom format).
pg_restore --clean --if-exists --no-owner -d cafe_bakery_db /path/<ts>.dump

# 4. Verify checksum of the dump you used matches its .sha256 sidecar.
sha256sum -c /path/<ts>.dump.sha256

# 5. Restore attachments directory from its backup if needed.
#    rsync -a /backup/attachments/ $INVENTORY_STORAGE_ROOT/

# 6. Sanity check, then start.
node scripts/inventory/verifyMigration.js   # invariant checks
pm2 start kidist-api
```

For **point-in-time** recovery (e.g. "restore to 14:05 before the bad import"),
use the base backup + WAL replay (§9) with `recovery_target_time`.

---

## 9. WAL / PITR setup

With `archive_mode = on` and an `archive_command` (§2), take a periodic base
backup so WAL can be replayed onto it:

```bash
# Weekly base backup
pg_basebackup -D /backup/base/$(date +%F) -Ft -z -Xs -P -U kidist_backup
```

Recovery to a point in time:

```conf
# in the restored data dir: restore_command + target
restore_command = 'cp /var/lib/pg-wal-archive/%f %p'
recovery_target_time = '2026-05-29 14:05:00+03'
```

Keep WAL archive on a **different disk** from the live DB. Monitor archive disk
usage — a stuck `archive_command` will fill the disk and stall PostgreSQL.

---

## 10. Scheduled jobs

| Job | Command | Cadence |
|-----|---------|---------|
| Daily inventory snapshot (valuation trend, opening balances) | `npm run inv:snapshot` | nightly, after close, before backup |
| Fraud / anomaly scan | `npm run inv:fraud-scan` | nightly (or 2×/day) |
| Backup | `npm run inv:backup` | nightly |

The app also runs an in-process scheduler for some of these; if you rely on the
cron jobs above, confirm you are not double-running (pick one). Snapshots should
run **after** the business day closes (respecting `INVENTORY_TZ`).

---

## 11. Monitoring & logging

- **Process:** `pm2 monit` / `pm2 logs`, or `journalctl -u kidist-api -f`.
  Set `max_memory_restart` so a leak self-heals (see audit §memory leaks).
- **DB:** watch `pg_stat_activity` for long/idle-in-transaction sessions,
  `log_lock_waits` output, and connection count vs `max_connections`.
- **Disk:** alert at 80% on DB, WAL archive, backup, and attachment volumes.
- **App health:** poll a lightweight endpoint and the SSE client count
  (`sse.clientCount()` is exposed) to confirm realtime is alive.
- **Log rotation:** `pm2-logrotate` or `logrotate` for `logs/*.log`; rotate PG
  logs too. Keep 14–30 days.
- Errors return a structured envelope (`{status, code, message}`); 500s are
  logged with `[inventory] unhandled error`. Grep for that string as your
  primary "something is wrong" signal.

---

## 12. LAN deployment topology

```
                         ┌─────────────────────────────────────────┐
                         │  STORE SERVER (static IP 192.168.10.10)  │
                         │                                          │
   Wi-Fi / wired LAN     │  nginx :443  ──►  Node API :5000 (fork)  │
  ┌───────────────┐      │                      │                   │
  │ Cashier tablet│──────┤                      ▼                   │
  ├───────────────┤      │              PostgreSQL 16 :5432         │
  │ Manager PC    │──────┤              WAL archive (disk 2)        │
  ├───────────────┤      │              Attachments (backed-up vol) │
  │ Bar tablet    │──────┤              Nightly backup → offsite    │
  ├───────────────┤      │                                          │
  │ Kitchen screen│──────┘                                          │
  └───────────────┘      └─────────────────────────────────────────┘
            │
            └── UPS on the server + switch + router (see audit: power recovery)
```

- Server, network switch, and router on a **UPS**. A clean DB shutdown beats a
  crash-recovery every time.
- Terminals are stateless browsers — if one reboots, it just reconnects; no
  local data to lose.
- Keep the server wired to the switch; put tablets on a dedicated SSID.

---

## 13. Staged rollout strategy

1. **Shadow (read-only) week.** Deploy with `INVENTORY_BACKEND=pg`, migrate a
   copy of legacy data, let managers *view* balances/reports while real
   operations still run on the old flow. Compare numbers daily.
2. **One store / one shift pilot.** Turn on writes for a single store and a
   single shift (e.g. mornings). Watch alerts, run a stock count at end of day,
   reconcile against physical. Fix friction.
3. **Full store.** All shifts, all roles. Keep the legacy JSON backend
   available (flip `INVENTORY_BACKEND` back) as the rollback switch for the
   first two weeks.
4. **Decommission legacy** only after two clean weekly closings reconcile and a
   restore drill has succeeded.

Rollback at any stage: stop API → `INVENTORY_BACKEND=json` → restart. PG data is
untouched and you can re-enable later.
