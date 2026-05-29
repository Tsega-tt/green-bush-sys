# Kidist Cafe — Operational Testing Matrix

Step-by-step acceptance scenarios to run **before** go-live and after any
change. Each scenario lists: setup → steps → expected result → integrity check.
Run on the real tablets/PCs over the LAN, not just on the dev machine.

Legend: 🟢 normal flow · 🔴 failure/abuse flow · ⏱ concurrency · 🌐 realtime.

Automated baseline first:

```bash
INVENTORY_TEST_DB=1 npm run inv:test          # WAC + ledger invariants
npm run inv:concurrency-test                  # no oversell under parallel load
node scripts/inventory/verifyMigration.js     # balance = sum(ledger), no negatives
```

---

## 1. Cashier operations (order → consumption)

🟢 **1.1 Sale deducts ingredients**
1. Seed a menu item with a recipe (e.g. Macchiato → 18 g beans, 150 ml milk).
2. Note current balances of beans/milk in **Balances**.
3. Cashier completes an order containing 2 Macchiatos.
4. **Expected:** order completes; balances drop by 36 g / 300 ml.
5. **Integrity:** Item ledger shows two `consumption` rows tied to the order id;
   `verifyMigration` still reports balance = Σ ledger.

🔴 **1.2 Sale blocked when an ingredient is out**
1. Adjust beans to 10 g.
2. Try to sell a Macchiato (needs 18 g).
3. **Expected:** availability shows unavailable / sale rejected with a clear
   "insufficient stock" message. No partial deduction; milk not touched.

🟢 **1.3 Idempotent consumption**
1. Complete an order, then trigger completion again (retry / double network).
2. **Expected:** ingredients deducted **once** (consumption is keyed by order).

---

## 2. Simultaneous sales ⏱

🟢 **2.1 Two cashiers, same scarce item**
1. Set beans to exactly enough for **one** Macchiato (18 g).
2. From two terminals, complete a Macchiato order at the same moment.
3. **Expected:** exactly one succeeds; the other gets insufficient-stock. Never
   both. Balance never goes negative.
4. **Integrity:** run `npm run inv:concurrency-test` for the automated version.

🟢 **2.2 Throughput**
1. Fire 50 small orders across 5 terminals in a burst.
2. **Expected:** all succeed in order, no deadlock errors surfaced to staff
   (retryable serialization is absorbed by `withTransaction`), balances correct.

---

## 3. Concurrent transfers ⏱ 🌐

🟢 **3.1 Normal transfer lifecycle**
1. Store A → Store B transfer for 5 kg flour.
2. F&B approves → A sends → B receives.
3. **Expected:** stock leaves A only at **send**, arrives at B only at
   **receive**, at the carried cost. Status badges track pending_fnb → approved
   → sent → received → closed.
4. 🌐 A second browser on the Transfers page updates **without refresh** at each
   step (SSE `transfer.changed`).

🔴 **3.2 Separation of duties**
1. The user who created the transfer tries to approve it. Then the sender tries
   to receive it.
2. **Expected:** blocked with a permission/SoD message.

⏱ **3.3 Transfer vs sale race on source stock**
1. Source has 5 kg flour. Start a send of 5 kg and, simultaneously, a sale that
   consumes flour from the same store.
2. **Expected:** total out never exceeds 5 kg; one of the two is rejected if
   they collide. No negative balance.

---

## 4. GRN posting (purchasing receipt)

🟢 **4.1 Receive against PO increases stock at cost**
1. Approved PO for 20 kg sugar @ 50.
2. Receive goods → draft GRN (received 20, batch + expiry entered).
3. Attach **invoice** and **GRN** documents.
4. Post.
5. **Expected:** sugar +20 kg; weighted-average cost recalculated; batch created
   with expiry; PO marked received/partially_received.

🔴 **4.2 Cannot post without documents**
1. Create a draft GRN, attach nothing (or only a delivery note).
2. Try to Post.
3. **Expected:** rejected with "invoice & GRN documents are required". No stock
   movement.

🔴 **4.3 Over-receipt guard**
1. PO ordered 20; try to receive 25.
2. **Expected:** rejected / clamped per business rule; never silently inflates.

🟢 **4.4 Idempotent post**
1. Post a GRN, then retry the post (double click is already blocked; simulate a
   network retry).
2. **Expected:** stock increased **once**.

---

## 5. Approvals (PR → PO)

🟢 **5.1 Threshold routing**
1. Raise a small PR (under owner threshold) → F&B approves → becomes approved.
2. Raise a large PR (over threshold) → F&B approves → status pending_owner →
   owner approves → approved.
3. **Expected:** band shown on the PR; owner step only appears when required.

🔴 **5.2 Role gating**
1. As a store manager, open the Approvals page.
2. **Expected:** not in the sidebar / route redirects; approve buttons never
   shown. (Backend also rejects with 403 if called directly.)

🟢 **5.3 PO from approved PR**
1. Purchaser creates a PO, prefilled from the approved PR, picks supplier + unit
   costs.
2. **Expected:** PO created; quantities default to approved amounts.

---

## 6. Stock counts

🟢 **6.1 Open count → variance adjustment**
1. New count for a store. Enter physical quantities that differ from system for
   a couple of items.
2. Finalize.
3. **Expected:** confirmation prompt; on finalize, variances post as
   `stock_count` ledger adjustments; sheet locks; balances now equal the
   physical numbers.
4. **Integrity:** ledger shows the adjustment rows; balance = Σ ledger.

🟢 **6.2 Blind count**
1. Create a blind count.
2. **Expected:** system quantities hidden while entering; revealed with variance
   only after finalize.

🔴 **6.3 No double finalize**
1. Finalize, then try to finalize again / edit a finalized sheet.
2. **Expected:** rejected ("count is not open").

---

## 7. Waste entries

🟢 **7.1 Record waste reduces stock at WAC**
1. Record 2 kg tomato waste, reason "spoilage".
2. **Expected:** stock −2 kg; waste valued at weighted-average cost; appears in
   Waste list and Waste report.
3. 🌐 Balances screen elsewhere updates live.

🔴 **7.2 Cannot waste more than on hand**
1. On-hand 1 kg; try to waste 3 kg.
2. **Expected:** rejected; no negative balance.

🔴 **7.3 Excessive-waste alert**
1. Record repeated/large waste, then run `npm run inv:fraud-scan` (or the
   in-app scan).
2. **Expected:** an `excessive_waste` alert appears in **Alerts**.

---

## 8. Keg tracking

🟢 **8.1 Receive → tap → pour → empty**
1. Receive a 50 L keg.
2. Tap it. Record sales of 20 L, then 30 L.
3. **Expected:** remaining goes 50 → 30 → 0; status received → tapped → empty;
   remaining never below 0.

🔴 **8.2 Pour beyond remaining**
1. 5 L remaining; record a 10 L sale.
2. **Expected:** rejected.

🟢 **8.3 Variance alert on close**
1. Receive a keg, tap, record sales+waste that don't fully account for the
   volume, let it empty.
2. **Expected:** `keg_variance` alert raised for the unexplained litres.

---

## 9. Expiry handling

🟢 **9.1 Expiry visibility**
1. Receive stock with a near expiry (e.g. 3 days) via GRN.
2. Open **Batches & Expiry**, window "Next 7 days".
3. **Expected:** the batch shows with a red/amber "in N days" badge.

🟢 **9.2 FEFO consumption**
1. Two batches of the same item, different expiries.
2. Consume a quantity.
3. **Expected:** the earliest-expiry batch is drawn down first (first-expiry-
   first-out).

🔴 **9.3 Expiry alert**
1. Run the fraud/alert scan with items past/near expiry.
2. **Expected:** `expiry` alerts present; visible in Alerts with severity.

---

## 10. Reporting accuracy

🟢 **10.1 Valuation cross-check**
1. Open **Reports → Valuation**; note total.
2. Compare with **Balances** value column summed per store.
3. **Expected:** they match (both derive from balance × WAC).

🟢 **10.2 Movement reconciliation**
1. For one item over a day, sum purchases − consumption − waste − transfers from
   the relevant reports.
2. **Expected:** opening + net movements = closing (matches Daily Closing
   expected value).

🟢 **10.3 CSV export**
1. Export any report.
2. **Expected:** CSV opens in Excel with the same columns/values shown.

🟢 **10.4 Supplier performance / price history**
1. After a few GRNs, open Supplier Performance and an item's Price history.
2. **Expected:** non-empty, sensible numbers; price changes reflect GRN costs.

---

## 11. Realtime updates 🌐

🟢 **11.1 Multi-terminal propagation**
1. Open Balances on tablet A and Alerts on tablet B.
2. On a PC, post a GRN / record waste / trigger a low-stock condition.
3. **Expected:** A's balance updates and B's alert list grows within ~1–2 s, no
   manual refresh.

🟢 **11.2 Reconnect after drop**
1. Disconnect tablet A's Wi-Fi for 30 s, reconnect.
2. **Expected:** SSE auto-reconnects (retry hint 3 s); subsequent changes flow
   again. Do a manual refresh to resync any events missed while offline (known
   limitation — see audit).

---

## 12. Duplicate requests 🔴

🟢 **12.1 Double-click submit**
1. On any create/post form, double-click the primary button rapidly.
2. **Expected:** only one submission (button disables via the submit guard).

🟢 **12.2 Stock-movement retry safety**
1. Post a GRN / finalize a count / complete an order, then replay the same
   request (browser back + resubmit, or network retry).
2. **Expected:** stock effect happens once (idempotent on the ledger paths).
3. **Note:** document *creation* (PR/PO/GRN draft) is **not** idempotency-keyed
   — a deliberate resubmit can create a duplicate draft. It carries no stock
   impact until posting; reject/cancel the extra. (Tracked in the audit.)

---

## 13. Power / network interruption recovery 🔴

🟢 **13.1 Server power loss mid-write**
1. Begin a GRN post and pull server power (lab only) or `kill -9` the node
   process during the call.
2. Restart the API.
3. **Expected:** the transaction either fully committed or fully rolled back —
   never half. `verifyMigration` shows balance = Σ ledger, no negatives.

🟢 **13.2 PostgreSQL restart**
1. Restart PostgreSQL while the API is up.
2. **Expected:** in-flight calls error cleanly; the pool reconnects; new calls
   succeed without an API restart.

🟢 **13.3 Tablet/network loss**
1. Kill a tablet's network mid-form.
2. **Expected:** the submit fails with an error toast (no false "success"); on
   reconnect the user retries. No partial server state.

🟢 **13.4 Clean recovery drill**
1. Graceful server reboot (UPS scenario).
2. **Expected:** PM2/systemd auto-starts the API after PostgreSQL; terminals
   reconnect on their own.

---

## Sign-off

A scenario passes only when **both** the expected UI result **and** the
integrity check hold. Record date, tester, build/commit, and any deviation. Do
not go live with any 🔴 integrity check failing.
