# Kidist Cafe — Production Readiness Audit

Scope: stabilization review of the PostgreSQL inventory module and its React
frontend. Architecture, ledger, concurrency, and schema are **frozen**; this
audit only flags risks and the fixes already applied during stabilization.

Severity: 🔴 must fix before/at go-live · 🟡 should fix soon · 🟢 already solid.

---

## A. Hardening review (the 13 audit areas)

### 1. Duplicate submission risk — 🟢 / 🟡
- **Frontend:** every create/post form uses `useSubmitGuard` (button disables
  while in-flight). Prevents the common double-click double-post.
- **Stock-mutating paths are idempotent** at the ledger: adjust/deduct/receipt
  movements + order consumption are keyed (`idempotency_key` / order id), so a
  network retry cannot double-apply stock. ✅ This is the integrity-critical part.
- 🟡 **Gap:** document *creation* (PR, PO, GRN draft, transfer header) is **not**
  idempotency-keyed. A deliberate resubmit/refresh can create a duplicate
  *draft*. No stock impact (posting is idempotent), but it's operational noise.
  - *Mitigation now:* submit guard + clear status. *Future:* accept a client
    `idempotency_key` on these POSTs (additive, no schema break).

### 2. Stale SSE state — 🟡
- The SSE hub cleans up on `close`, sends keepalives every 25 s, and the client
  hook auto-reconnects (`retry: 3000`). Live updates are reliable while connected.
- 🟡 **Gap:** events emitted **while a client is disconnected are missed** (no
  replay/cursor). After a network blip a screen can be momentarily stale until
  the next event or a manual refresh.
  - *Mitigation:* pages that matter (Balances, Alerts, Transfers, Purchasing)
    already refetch on every relevant event; add a "pull-to-refresh"/refresh
    button habit. *Future:* a `Last-Event-ID` cursor + short server-side ring
    buffer for replay.
- 🔴 **Single-instance requirement** (deployment): the client `Set` is
  in-process. Do **not** run the API in PM2 cluster mode — see deployment §3.

### 3. Race conditions — 🟢
- Every stock mutation goes through `withTransaction` with row locks
  (`FOR UPDATE`) and a **consistent lock order (item_id asc)**, plus
  non-negative `CHECK` constraints. Verified by `inv:concurrency-test`
  (parallel sells on scarce stock never oversell).
- Serialization/deadlock (`40001`/`40P01`) are **retried** with jittered
  backoff (bounded). Staff never see a raw deadlock.

### 4. Deadlock edge cases — 🟢
- Consistent ordering makes deadlocks unlikely; the retry wrapper is the safety
  net if one slips through. `lock_timeout` (deployment §2) bounds worst-case
  waits so a stuck lock fails fast instead of hanging a terminal.

### 5. Pagination / performance — 🟡
- List endpoints have server-side `limit` defaults (100–200); Audit Log paginates
  in the UI.
- 🟡 **Gap:** several frontend list pages (Balances, Transfers, PR/PO/GRN,
  Waste, Kegs) render whatever the API returns **without UI paging**. Fine for a
  single store's catalogue (hundreds of rows). For very large item masters this
  could get heavy.
  - *Recommendation:* add the same offset/limit pager used in Audit Log to
    Balances and the purchasing lists when any store exceeds ~500 active items.
    Server already supports `limit`/`offset`.

### 6. Large-table rendering — 🟡
- `DataTable` renders all rows (no virtualization). Up to ~1–2k rows is fine on
  a modern tablet; beyond that, scrolling/initial paint will lag.
  - *Recommendation:* pair pagination (above) with the existing filters
    (store/category/search) so the rendered set stays small. Add row
    virtualization only if a single view legitimately needs thousands of rows.

### 7. Upload abuse / security — 🟡
- Uploads go through multer 2.x (the 1.x advisory is already remediated),
  attachments are checksummed (SHA-256), versioned, and permanent; GRN posting
  *requires* invoice+GRN docs.
- 🟡 **Harden at the edge:** set `client_max_body_size 15m` in nginx (done in the
  example) and confirm the multer file-size/type limits match. Restrict accepted
  MIME/extensions to documents/images. Ensure `INVENTORY_STORAGE_ROOT` is **not**
  web-served directly (downloads go through the authorized API route).

### 8. Transaction timeout — 🟢
- App sets `statement_timeout` (15 s) and `idle_in_transaction_session_timeout`
  (10 s) per session; deployment adds DB-level backstops. `withTransaction`
  explicitly forbids I/O inside the lock window, keeping transactions short.

### 9. Memory leaks — 🟢 / 🟡
- SSE clients are removed on disconnect; `keepalive` intervals are cleared on
  `close`. No obvious unbounded growth.
- 🟡 **Operational safety net:** set PM2 `max_memory_restart: '600M'` (done in
  the example) so any slow leak self-heals without downtime. Watch RSS in
  `pm2 monit` during the pilot.

### 10. Frontend state inconsistencies — 🟢 / 🟡
- `useApiResource` centralizes load/error/refetch; realtime events trigger
  refetch so screens converge to server truth.
- 🟡 Optimistic UI is intentionally avoided (good for integrity). The cost is a
  brief spinner on actions; acceptable and safer than divergent local state.

### 11. Missing loading / error states — 🟢
- `DataTable` has explicit loading, empty, and **error + retry** states; forms
  show busy state and toast errors with the server message. Applied uniformly
  across all inventory pages.

### 12. Retry-loop risk — 🟢
- The only automatic retry is `withTransaction` (bounded, 3 attempts, backoff).
  SSE reconnect is browser-native with a 3 s floor. No unbounded client retry
  loops; failed mutations surface an error rather than silently re-firing.

### 13. RBAC consistency (frontend ↔ backend) — 🔴 → ✅ fixed
- Found during this pass: several screens let a role *reach* an action the API
  would 403 (e.g. F&B on the Audit page where `viewAudit` is admin/owner only;
  owner on Suppliers where `manageSuppliers` excludes owner; F&B/owner/purchaser
  seeing "New PR" where create needs `receiveGoods`).
- **Fixed:** added `frontend/src/utils/invPermissions.js` mirroring the backend
  `GROUPS`, gated every write button by `can(role, group)`, and corrected the
  Audit/Suppliers route + sidebar role lists to match the API. Backend remains
  the source of truth (still 403s on direct calls); the UI now never shows a
  dead action.

---

## B. Role routing fix (closed)

- `getRedirectPath` now routes `store_manager` → Inventory dashboard and
  `purchaser` → Purchasing; `fnb_manager`/`owner` already landed correctly.
- `DashboardRouter` switch gained `store_manager` and `purchaser` cases (they no
  longer hit "Invalid user role").
- `ProtectedRoute` unauthorized fallback (`getHomePath`) updated for the same two
  roles — no redirect loops (their `/dashboard` index resolves).
- `/dashboard/*` guard and the sidebar already include the new roles; sidebar is
  role-filtered so each role sees only its relevant entries.
- Removed debug `console.log`s from the redirect path.
- **Verified:** ESLint (CRA `react-app`) = 0 errors / 0 warnings across all
  changed files; all inventory files Babel-parse.

---

## C. Production readiness audit (gaps / risks)

### Unfinished / thin areas
- **Recipe/BOM editor UI.** The consumption engine and APIs exist; there is no
  dedicated screen to author recipes (currently data/seed driven). 🟡 Add a
  simple recipe editor before heavy menu churn.
- **Approval-threshold admin UI.** `manageThresholds` API exists; no screen.
  Thresholds are config-set today. 🟡 Low urgency.
- **Store capability / store admin UI.** Stores/capabilities are seeded via
  migration; no CRUD screen. 🟢 Acceptable for a single store.
- **Per-line partial approve/receive UI.** Backend supports partial
  approve/receive; the UI does "approve all / receive outstanding". 🟡 Add
  per-line controls if partial workflows become common.

### Weak areas / technical debt
- Duplicate-draft creation (A.1) and SSE replay gap (A.2) as above.
- Two parallel inventory backends (`json` legacy + `pg`) during transition —
  intentional for rollback, but **decommission the legacy path** after the
  pilot to avoid drift/confusion.
- List pagination not yet wired on all pages (A.5).

### Dangerous assumptions to validate
- **Single API process / single store server.** The realtime design assumes
  one process. Multi-store or HA needs a shared pub/sub first (don't cluster
  blindly).
- **`INVENTORY_TZ` correctness.** Daily closing and snapshots key off this. A
  wrong TZ silently shifts day boundaries and variance. Confirm on the server.
- **Recipes are accurate.** Consumption integrity is only as good as the BOM.
  Garbage recipe → wrong deductions. Validate recipes during the pilot against
  physical counts.
- **Clock sync.** Terminals rely on the server clock for ordering; keep the
  server on NTP.

### Scalability risks
- In-process SSE fan-out (covered). Pool sizing vs `max_connections` (covered).
- Unpaginated large tables (covered). All are single-store-fine; revisit before
  multi-store.

### Operational risks (real restaurant floor)
- **Power loss** → mitigated by transactional integrity + UPS recommendation +
  auto-restart. Test 13.x in the matrix.
- **Wi-Fi flakiness** → SSE reconnects, but missed-event staleness means staff
  should treat a refresh as cheap. Train on it.
- **Untested backups** → the single biggest real-world risk. Do the restore
  drill (deployment §8) before go-live and quarterly after.
- **Attachment disk growth** → monitor; invoices accumulate.

---

## D. UI/UX operational polish review

Reviewed every inventory screen against speed / clarity / low-training /
tablet-friendliness.

### Strengths (keep)
- Large tap targets (`Btn`, big table rows), consistent status **badges** with
  fixed color semantics (amber=pending, green=done, red=rejected/critical),
  one shared table everywhere → low training surface.
- Minimal nav nesting (flat, role-filtered sidebar); dashboards are
  click-through (counts → the work).
- Modals reserved for create/edit only; lists are full-screen and scannable.
- Realtime means "obvious inventory status" without manual refresh.

### Recommended polish (low effort, high floor-value)
1. 🟡 **Sticky table headers + sticky action column** on Balances/GRN entry so
   headers/buttons stay visible while scrolling long lists on a tablet.
2. 🟡 **Bigger numeric inputs** for stock-count and GRN-receive grids (current
   `w-24`/`w-28`); fat-finger entry on tablets is the main data-entry risk.
   Consider a numeric keypad (`inputMode="decimal"`).
3. 🟡 **Confirmation copy consistency.** Finalize/Confirm/Post all warn about
   irreversibility — good. Ensure the *language* is identical and plain
   ("This locks the count and adjusts stock. Continue?").
4. 🟡 **Low-stock visibility on the floor.** Balances already amber-rows low
   items; add a persistent low-stock count badge to the Inventory dashboard
   card (already links there) so it's glanceable mid-shift.
5. 🟡 **Empty-state guidance.** Replace bare "No records" with the next action
   ("No draft receipts — tap *Receive goods* to start") on the busy pages.
6. 🟢 **Keg remaining bar.** Remaining-litres already turns red < 15%; a tiny
   progress bar would read faster from across the bar — optional.
7. 🟡 **Approvals: show requester + age.** Add "raised by / N hours ago" so F&B
   can triage stale requests fast.

None of these change workflows or architecture; they reduce taps and
mis-entries during a rush.

---

## E. Go / no-go summary

| Area | State |
|------|-------|
| Inventory integrity (ledger, concurrency, idempotent stock paths) | 🟢 Ready |
| RBAC frontend↔backend alignment | 🟢 Fixed this pass |
| Role routing for all roles | 🟢 Fixed this pass |
| Loading/error/retry UX | 🟢 Ready |
| Backups exist | 🟢 — but 🔴 **must run a restore drill first** |
| Single-instance/SSE deployment constraint | 🔴 Must configure (fork mode) |
| TLS on LAN, env hardening | 🔴 Must configure before go-live |
| Duplicate-draft + SSE replay | 🟡 Known, non-blocking, mitigated |
| Pagination/large tables | 🟡 Fine for one store; revisit at scale |
| Recipe/threshold admin UIs | 🟡 Follow-up features |

**Verdict:** integrity and core workflows are production-grade. Go-live is
gated only on **operational setup** (fork-mode single instance, TLS, env
secrets, and a *proven* restore), not on code. Address the 🟡 items during the
staged pilot.
