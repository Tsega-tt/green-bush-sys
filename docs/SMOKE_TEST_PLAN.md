# Kidist Cafe — Inventory Ecosystem Smoke Test Plan

End-to-end smoke test for the connected system: **Stores · Capabilities · Managers ·
Serving Sizes · Items · Suppliers · Recipes/BOM · Transfers · Purchasing (PR/PO/GRN) ·
Kegs · Order→Sale Consumption · Reports · Audit · RBAC.**

Goal: in ~30–45 minutes confirm every module works and that a real sale moves
inventory automatically (Purchase → Transfer → Sale → Consumption → Ledger → Balance).

---

## 0. Prerequisites & environment

| Item | Value |
|---|---|
| Backend port | **8080** (`.env` `PORT=8080`, `INVENTORY_BACKEND=pg`) |
| Frontend (prod build) | http://localhost:8080 |
| Frontend (dev server) | http://localhost:3000 (proxies `/api` → 8080) |
| DB | PostgreSQL `cafe_bakery_db` |

**Start clean:**
```bash
cd "c:\Users\Hanna.tt\OneDrive\Documents\MY PROJECTS\KIDIST-SHIRO\Kidist_cafe"
npm run inv:migrate          # all migrations applied (through 0013)
npm run inv:verify           # expect: ✅ VERIFICATION PASSED
npm run inv:seed-users       # test accounts, PIN 1234
npm start                    # backend -> "🌐 Server running on port 8080"
# (optional) cd frontend && npm start   # for live-reload dev UI on :3000
```

**API health check (PowerShell or curl):**
```bash
curl -s -o NUL -w "health %{http_code}\n" http://localhost:8080/health
curl -s -H "x-user-id: 1" http://localhost:8080/api/inv/health/db
```
Expect `health 200` and a JSON body with `latest_migration: 0013_draft_serving_sizes`.

### Test accounts (PIN login → Name + PIN)

| Username | PIN | Role | Use for |
|---|---|---|---|
| `inv_admin` | 1234 | admin | everything / Stores Admin / Serving Sizes |
| `inv_owner` | 1234 | owner | owner approvals, reports, audit |
| `inv_fnb` | 1234 | fnb_manager | approvals, items, recipes, reports |
| `inv_store` | 1234 | store_manager | store ops (pinned to **Dry/Goods**, store_id 10) |
| `inv_purchaser` | 1234 | purchaser | purchasing, suppliers |

### Reference data already present

- **Stores (id):** main_store 1, mini_store 2, barman_store 3, bar_store 4, pizza_burger 5,
  juice_store 6, kitfo_store 7, draft_george 8, draft_heineken 9, dry_goods 10 (+ legacy bar/pastry/kitchen/barman).
- **Dry/Goods stock:** `flour` (item code LEG-00001) ≈ 160 on hand.
- **Serving sizes:** Large 0.50 L, Medium 0.40 L, Small 0.25 L.

> Pass/fail: each step lists **Expected**. Record results in the table at the bottom.

---

## 1. Authentication & RBAC

| # | Action | Expected |
|---|---|---|
|1.1| Login `inv_admin` / 1234 | Lands on dashboard; sidebar shows full inventory group incl. **Stores Admin, Serving Sizes, Menu Recipes, Audit Log**. |
|1.2| Login `inv_store` / 1234 | Lands on **Inventory** overview; sidebar has Balances/Transfers/Stock Counts/Waste/Daily Closing/Kegs/Receive Goods/Purchase Requests/Alerts — **no** Stores Admin, Items, Reports, Audit, Serving Sizes. |
|1.3| Login `inv_purchaser` / 1234 | Lands on **Purchasing** hub; sidebar has Purchasing/Purchase Requests/Purchase Orders/Receive Goods/Suppliers — **no** Waste/Counts/Stores Admin. |
|1.4| Login `inv_owner` / 1234 | Can open **Approvals** and **Audit Log**; on Suppliers/Items pages, no "manage" buttons (read-oriented). |
|1.5| As `inv_store`, manually visit `/dashboard/inventory-pg/stores` | Redirected away (not "Invalid role", not blank). |

---

## 2. Stores Administration (login `inv_admin`)

| # | Action / Data | Expected |
|---|---|---|
|2.1| Open **Stores Admin** | Lists all stores with code, manager, capability count, Active status. |
|2.2| Open **Pizza & Burger Store** ▸ Manage | Capabilities checked: Request Items, Transfer, Receive Transfers, Sell, **Uses Recipe/BOM**; **Purchase Directly = off**. |
|2.3| Open **Draft Heineken** ▸ Manage | **Requires Keg Tracking = on**. |
|2.4| Assign manager: Dry/Goods → `inv_store` (if not already), Save | Saves; manager shown on the row. |
|2.5| Create store: code `test_store`, name "Test Store", tick Transfer + Receive Transfers, Save | Appears in list, Active. |
|2.6| Edit `test_store` → untick Active → Save | Status shows Inactive. |
|2.7| Open any store ▸ **View** → Summary / Transfers / Requests / Audit tabs | Summary shows item count/value; tabs load (may be empty) without error. |

API spot check:
```bash
curl -s -H "x-user-id: 1" http://localhost:8080/api/inv/stores | findstr /C:"capabilities"
```

---

## 3. Draft Serving Sizes (login `inv_admin`)

| # | Action / Data | Expected |
|---|---|---|
|3.1| Open **Serving Sizes** | Shows Large 0.50 / Medium 0.40 / Small 0.25, all Active. |
|3.2| New serving size: name **Mini**, liters **0.20**, Save | Row "Mini · mini · 0.2 L · Active" added (proves no-code add). |
|3.3| Edit **Large** → liters **0.60** → Save | Large now 0.60 L (proves configurable liters). Revert to 0.50 after. |
|3.4| Deactivate **Mini** | Status → Inactive; it disappears from recipe serving-size dropdowns. |

---

## 4. Items master (login `inv_fnb`) — create ingredients for recipes

Open **Items** ▸ New item, create:

| Code (auto ok) | Description | UoM | Perishable | Track batches |
|---|---|---|---|---|
| auto | Beef | kg | yes | yes |
| auto | Butter | kg | yes | no |
| auto | Mitmita | kg | no | no |
| auto | Avocado | pcs | yes | no |
| auto | Heineken Draft | l | no | no |

**Expected:** each saves and is searchable. Note the generated item codes (ITM-0000xx).

---

## 5. Suppliers (login `inv_purchaser`)

| # | Action / Data | Expected |
|---|---|---|
|5.1| Open **Suppliers** ▸ New supplier: name "Addis Meat Supplier", phone any | Saved, Active. |
|5.2| Edit it → deactivate → reactivate | Status toggles. |

---

## 6. Balances & adjustment (login `inv_store`, pinned to Dry/Goods)

| # | Action | Expected |
|---|---|---|
|6.1| Open **Balances** | Store pinned to Dry/Goods; `flour` shows ≈160. |
|6.2| Adjust `flour` → Set to 200, reason "smoke count" | Toast success; row shows 200; **Audit log** records an adjustment. |
|6.3| Tick "Low stock only" | Filters to items at/below min. |

---

## 7. Purchasing chain — PR → PO → GRN (the 3-way + SoD)

**7a. Purchase Request** (login `inv_store`):
- Purchase Requests ▸ New request → Store **Dry/Goods** → line: Beef, qty 50, est cost 8 → Submit.
- **Expected:** status `pending_fnb`.

**7b. F&B approval** (login `inv_fnb`):
- Approvals → open the PR → **Approve**.
- **Expected:** status `approved` (or `pending_owner` if over threshold).

**7c. Purchase Order** (login `inv_purchaser`):
- Purchase Orders ▸ New order → choose the approved PR (prefills lines) → supplier "Addis Meat Supplier" → set unit cost 8 → Create.
- **Expected:** PO `issued`.

**7d. Goods Receipt** (login `inv_store`):
- Receive Goods ▸ Receive goods → select the PO → received qty 50, batch "B-001", expiry +30 days → Create draft.
- Attach **invoice** and **grn** documents (any small files) → **Post receipt**.
- **Expected:** posting **fails without the documents**; succeeds with them. After posting, **Balances** for the receiving store shows Beef +50 and a `purchase_receipt` ledger row.

> RBAC note: F&B/owner won't see "New order" (purchasing = purchaser/admin); purchaser/F&B/owner won't see "Receive goods" post unless `receiveGoods` (store managers/admin).

---

## 8. Transfers — main_store → kitfo_store

| # | Login | Action | Expected |
|---|---|---|---|
|8.1| `inv_admin` | Put stock in main_store: Balances → store main_store → adjust Beef "Set to 100" | main_store Beef = 100. |
|8.2| `inv_store`/admin | Transfers ▸ New: source **main_store**, dest **kitfo_store**, line Beef 40 → Create | status `pending_fnb`. |
|8.3| `inv_fnb` | Transfers → Approve | `approved`. |
|8.4| source mgr/admin | **Send** | `sent`; main_store Beef = 60. |
|8.5| dest mgr/admin | **Receive** | `received`; kitfo_store Beef = 40. Ledger has transfer_out + transfer_in. |

> Capability check: transfer to a store without **Receive Transfers** is rejected ("CAP_NOT_ENABLED").

---

## 9. Recipes / BOM + costing (login `inv_fnb`)

| # | Action / Data | Expected |
|---|---|---|
|9.1| Menu Recipes ▸ Add recipe → menu item "Special Kitfo" (or any) → store **Kitfo Store** → ingredients: Beef 0.25 kg, Butter 0.03 kg, Mitmita 0.005 kg → selling price 300 | On picking the store, **live recipe cost** and **margin %** appear (uses Kitfo WAC). Save succeeds. |
|9.2| Recipe list | Row shows cost, price 300, margin %, **Availability** (units based on Kitfo stock). |
|9.3| Set Beef to 0 in Kitfo (Balances adjust) then refresh recipes | Availability flips to **out** (critical badge). |

API: `curl -s -H "x-user-id: 1" http://localhost:8080/api/inv/reports/menu-profitability`

---

## 10. Draft beer + serving sizes + keg (login `inv_admin`)

| # | Action / Data | Expected |
|---|---|---|
|10.1| Kegs ▸ Receive keg → store **Draft Heineken**, size **50** L, item **Heineken Draft**, unit cost 4 | Keg row created, status `received`, remaining 50 L. Balances for Draft Heineken show Heineken Draft = 50 L (keg mirrored to ledger). |
|10.2| Kegs → that keg → **Record** → Tap | status `tapped`. |
|10.3| Menu Recipes ▸ Add recipe → menu item "Draft Heineken Large" → store **Draft Heineken** → **🍺 serving size = Large (0.5L)** → 1 ingredient = Heineken Draft → price 90 | Serving-size selector appears (keg store). Save requires a serving size. |
|10.4| (Sale happens in §11) sell 2 of this item | Keg remaining 50 → **49.0** L; `keg_event(sale)`; ledger `sale` row; balance 49. |

---

## 11. Order → automatic sale consumption (the headline)

Two ways to finalize a sale; both deduct inventory **once** (idempotent).

**11a. Cash paid (cashier flow):**
```bash
# create an order with the draft item (use its real menu_item_id from the menu)
curl -s -X POST -H "Content-Type: application/json" ^
  -d "{\"employee_id\":1,\"items\":[{\"menu_item_id\":<DRAFT_ID>,\"quantity\":2,\"unit_price\":90}],\"total_amount\":180}" ^
  http://localhost:8080/api/orders/cafe
# -> note the returned order id, then:
curl -s -X POST -H "Content-Type: application/json" ^
  -d "{\"order_id\":<ORDER_ID>,\"amount\":180,\"status\":\"paid\",\"processed_by\":1}" ^
  http://localhost:8080/api/payments
```
**Expected:** payment `paid`; order `payment_status=paid`, `inventory_consumed=true`; Draft Heineken keg −1.0 L; ledger `sale` row; **SSE** updates any open Balances/Alerts tab live.

**11b. Confirm-payment flow:** create a `pending` payment then `POST /api/payments/{id}/confirm` → same consumption result.

**11c. Idempotency:** repeat the confirm/payment for the same order → **no second deduction** (balance unchanged).

**11d. Multi-item order:** order with 2 Special Kitfo + 1 Draft Heineken Large → pay → Beef/Butter/Mitmita deducted from Kitfo, 0.5 L from the Heineken keg, all in one go.

**11e. Shortage:** set `INVENTORY_ENFORCE_ON_SALE=true` in `.env`, restart, then sell more than on hand → payment returns **409 INVENTORY_SHORTAGE**, **nothing deducted** (full rollback). (Default off = sale completes + alert.)

**11f. Cancellation:** `PUT /api/orders/{id}/status` body `{"status":"cancelled"}` on a consumed order → consumption reversed (balance restored), audit `reverse_consume`.

---

## 12. Operations — waste / count / closing (login `inv_store`)

| # | Action | Expected |
|---|---|---|
|12.1| Waste ▸ Record: store Dry/Goods, flour, qty 2, reason spoilage | flour −2; ledger `waste`; value shown. |
|12.2| Stock Counts ▸ New count (Dry/Goods) → Enter physical for flour (e.g. system−3) → Save → **Finalize** | Variance posts an adjustment; status `finalized`; large variance raises an alert. |
|12.3| Daily Closing → store Dry/Goods → **Generate** → enter physical value → **Confirm & lock** | Shows opening/purchases/waste/expected; confirm locks (re-confirm blocked). |

---

## 13. Alerts & fraud (login `inv_fnb`)

| # | Action | Expected |
|---|---|---|
|13.1| Alerts | Low-stock / variance / over-sale alerts from earlier steps appear; severity cards count them. |
|13.2| Click an alert | Expands with entity + details. |
|13.3| **Run fraud scan** | Completes with a toast (n new alerts). |
|13.4| Ack / Resolve an alert | Status changes; list refreshes. |

---

## 14. Reports & audit (login `inv_owner` / `inv_fnb`)

| # | Action | Expected |
|---|---|---|
|14.1| Reports ▸ **Valuation** | Per-store value totals; **Export CSV** downloads. |
|14.2| Reports ▸ **Menu profitability** | Rows with recipe cost / price / margin %. |
|14.3| Reports ▸ Consumption / Waste / Transfers / Expiry tabs | Load with the date/store filters. |
|14.4| Audit Log (owner/admin) | Shows recent create/approve/post/consume/adjust entries; filter by entity. |

---

## 15. Automated regression (run anytime)

```bash
npm run inv:verify              # ledger == balances, JSON==PG reconcile  -> PASSED
node scripts/inventory/orderSaleTest.js   # end-to-end -> RESULT: 21 passed, 0 failed
npm run inv:concurrency-test    # concurrent deductions stay consistent (needs DB)
INVENTORY_TEST_DB=1 npm run inv:test      # unit + integration suite
```

`orderSaleTest.js` proves the full chain in one run:
Purchase → Transfer → Store Inventory → Sale → Recipe Consumption → Ledger → Balance,
plus idempotency, multi-item, shortage rollback, **draft keg sale via serving size**, and cancellation reversal.

---

## Results sheet

| Section | Pass | Notes |
|---|---|---|
| 0 Environment / health | ☐ | |
| 1 Auth & RBAC | ☐ | |
| 2 Stores admin | ☐ | |
| 3 Serving sizes | ☐ | |
| 4 Items | ☐ | |
| 5 Suppliers | ☐ | |
| 6 Balances & adjust | ☐ | |
| 7 PR → PO → GRN | ☐ | |
| 8 Transfers | ☐ | |
| 9 Recipes & costing | ☐ | |
| 10 Draft keg + serving size | ☐ | |
| 11 Order → sale consumption | ☐ | |
| 12 Waste / count / closing | ☐ | |
| 13 Alerts & fraud | ☐ | |
| 14 Reports & audit | ☐ | |
| 15 Automated scripts | ☐ | |

---

## Notes / known behavior

- **Append-only ledger:** stock corrections are adjustments/reversals, never deletes.
- **Idempotency:** consumption is keyed by order id — retries/refresh never double-deduct.
- **Capabilities drive behavior:** turning off a capability (e.g. Receive Transfers) blocks
  that action for the store with `CAP_NOT_ENABLED`.
- **Two finalize triggers:** `POST /api/payments` (status `paid`), `POST /api/payments/:id/confirm`,
  and `PUT /api/payments/:id/status` → all funnel through the same idempotent consume helper.
- **Enforce vs non-blocking sale:** `INVENTORY_ENFORCE_ON_SALE=false` (default) lets a sale
  complete on shortage and raises an alert; `true` blocks it with 409.
