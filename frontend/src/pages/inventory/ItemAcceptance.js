import React, { useEffect, useMemo, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import { useAuth } from '../../context/AuthContext';
import UomFields from '../../components/inventory/UomFields';
import { PageHeader, Btn, Modal, TextInput, Select, useSubmitGuard, fmtMoney } from '../../components/inventory/kit';

const STATUS_META = {
  awaiting_fnb:      { label: 'Awaiting F&B Review', color: 'bg-amber-100 text-amber-700' },
  fnb_approved:      { label: 'F&B Approved',        color: 'bg-blue-100 text-blue-700' },
  fnb_rejected:      { label: 'F&B Rejected',        color: 'bg-red-100 text-red-700' },
  sent_to_store:     { label: 'Sent to Store',       color: 'bg-indigo-100 text-indigo-700' },
  awaiting_store:    { label: 'Awaiting Store Acceptance', color: 'bg-purple-100 text-purple-700' },
  store_accepted:    { label: 'Store Accepted',      color: 'bg-green-100 text-green-700' },
  store_rejected:    { label: 'Store Rejected',      color: 'bg-red-100 text-red-700' },
  added_to_inventory:{ label: 'Added to Inventory',  color: 'bg-emerald-100 text-emerald-700' },
  purchased:         { label: 'Purchased',           color: 'bg-gray-100 text-gray-700' },
};
const StatusBadge = ({ s }) => {
  const m = STATUS_META[s] || { label: s, color: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${m.color}`}>{m.label}</span>;
};

const emptyLine = () => ({
  _mode: 'existing', item_id: '', description: '', category: '', sub_category: '', item_type: '',
  uom: 'pcs', uom_attributes: {}, is_perishable: false, track_batches: false,
  specifications: '', storage_requirements: '', quantity: '', unit_cost: '', destination_store_id: '',
});

export default function ItemAcceptance() {
  const { user } = useAuth();
  const role = user?.role;
  const canSubmit = ['purchaser', 'admin'].includes(role);
  const canFnb = ['fnb_manager', 'owner', 'admin'].includes(role);
  const canStore = ['store_admin', 'store_manager', 'admin'].includes(role);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [decision, setDecision] = useState(null); // { item, stage, action }

  const load = useCallback(() => {
    setLoading(true);
    inventoryApi.acceptance.listItems()
      .then((r) => setItems(r.data.data.items || []))
      .catch(() => toast.error('Failed to load items'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter);
  const counts = useMemo(() => items.reduce((m, i) => { m[i.status] = (m[i.status] || 0) + 1; return m; }, {}), [items]);

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Item Acceptance">
        <Btn onClick={load}>Refresh</Btn>
        {canSubmit && <Btn variant="primary" onClick={() => setShowForm(true)}>New Receiving</Btn>}
      </PageHeader>
      <p className="text-sm text-gray-500 mb-4">
        {canFnb && !canStore && 'Review each purchased item and approve or reject it individually.'}
        {canStore && !canFnb && 'Accept items into your store (adds to stock) or reject with a reason.'}
        {canSubmit && 'Submit purchased items with supplier, documents and costs for F&B review.'}
      </p>

      {/* status filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {['all', ...Object.keys(STATUS_META).filter((s) => counts[s])].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
            {s === 'all' ? `All (${items.length})` : `${STATUS_META[s].label} (${counts[s]})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 py-10 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 py-10 text-center border rounded-xl">No items{filter !== 'all' ? ' in this status' : ''}.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((it) => (
            <ItemCard key={it.id} item={it}
              onFnb={canFnb && it.status === 'awaiting_fnb' ? (action) => setDecision({ item: it, stage: 'fnb', action }) : null}
              onStore={canStore && it.status === 'awaiting_store' ? (action) => setDecision({ item: it, stage: 'store', action }) : null}
            />
          ))}
        </div>
      )}

      {showForm && <SubmitModal onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); load(); }} purchaserName={user?.full_name || user?.username} />}
      {decision && <DecisionModal {...decision} onClose={() => setDecision(null)} onDone={() => { setDecision(null); load(); }} />}
    </div>
  );
}

function Row({ label, children }) {
  return <div className="flex justify-between gap-3 text-sm"><span className="text-gray-500">{label}</span><span className="text-gray-900 text-right">{children}</span></div>;
}

function ItemCard({ item, onFnb, onStore }) {
  const attrs = item.uom_attributes && Object.keys(item.uom_attributes).length
    ? Object.entries(item.uom_attributes).map(([k, v]) => `${k}: ${v}`).join(', ') : '—';
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-gray-900">{item.description}</div>
          <div className="text-xs text-gray-400 font-mono">{item.item_code || (item.is_new_item ? 'NEW ITEM' : '')} · {item.batch_number}</div>
        </div>
        <StatusBadge s={item.status} />
      </div>
      <div className="space-y-1 border-t pt-2">
        <Row label="Category">{item.category || '—'}{item.sub_category ? ` / ${item.sub_category}` : ''}</Row>
        <Row label="Quantity">{Number(item.quantity)} {item.uom}</Row>
        <Row label="UOM details">{attrs}</Row>
        <Row label="Unit / Total cost">{fmtMoney(item.unit_cost)} / <b>{fmtMoney(item.total_cost)}</b></Row>
        <Row label="Supplier">{item.supplier_name || '—'}</Row>
        <Row label="Invoice / GRN">{item.invoice_number || '—'} / {item.grn_number || '—'}</Row>
        <Row label="Destination">{item.destination_store_icon ? `${item.destination_store_icon} ` : ''}{item.destination_store_name}</Row>
        {item.specifications && <Row label="Specs">{item.specifications}</Row>}
        {item.fnb_reason && <Row label="F&B note"><span className="text-red-600">{item.fnb_reason}</span></Row>}
        {item.store_reason && <Row label="Store note"><span className="text-red-600">{item.store_reason}</span></Row>}
      </div>
      {(onFnb || onStore) && (
        <div className="flex gap-2 pt-2 border-t">
          {onFnb && <>
            <button onClick={() => onFnb('approve')} className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Approve</button>
            <button onClick={() => onFnb('reject')} className="flex-1 px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">Reject</button>
          </>}
          {onStore && <>
            <button onClick={() => onStore('accept')} className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Accept</button>
            <button onClick={() => onStore('reject')} className="flex-1 px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">Reject</button>
          </>}
        </div>
      )}
    </div>
  );
}

function DecisionModal({ item, stage, action, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, run] = useSubmitGuard();
  const reject = action === 'reject';
  const verb = stage === 'fnb' ? (reject ? 'Reject' : 'Approve') : (reject ? 'Reject' : 'Accept');
  const submit = () => run(async () => {
    if (reject && !reason.trim()) { toast.error('A reason is required'); return; }
    try {
      const decisionVal = stage === 'fnb' ? (reject ? 'reject' : 'approve') : (reject ? 'reject' : 'accept');
      const fn = stage === 'fnb' ? inventoryApi.acceptance.fnbDecision : inventoryApi.acceptance.storeDecision;
      await fn(item.id, { decision: decisionVal, reason });
      toast.success(`Item ${verb.toLowerCase()}ed`);
      onDone();
    } catch (err) { toast.error(err.response?.data?.message || 'Action failed'); }
  });
  return (
    <Modal title={`${verb} — ${item.description}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">{Number(item.quantity)} {item.uom} → {item.destination_store_name} · {fmtMoney(item.total_cost)}</p>
        {!reject && stage === 'store' && <p className="text-sm text-green-700 bg-green-50 rounded-lg p-2">Accepting will add this quantity to {item.destination_store_name} stock and update valuation.</p>}
        {reject && <TextInput label="Reason *" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this item rejected?" />}
        <div className="flex justify-end gap-2 pt-2">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn variant={reject ? 'danger' : 'primary'} onClick={submit} disabled={busy}>{busy ? 'Working…' : verb}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function SubmitModal({ onClose, onDone, purchaserName }) {
  const [masterItems, setMasterItems] = useState([]);
  const [stores, setStores] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [head, setHead] = useState({ supplier_id: '', supplier_name: '', supplier_info: '', invoice_number: '', grn_number: '', notes: '' });
  const [lines, setLines] = useState([emptyLine()]);
  const [busy, run] = useSubmitGuard();

  useEffect(() => {
    inventoryApi.items.list({ limit: 1000 }).then((r) => setMasterItems(r.data.data.items || [])).catch(() => {});
    inventoryApi.stores.list().then((r) => setStores((r.data.data.stores || []).filter((s) => s.is_active !== false))).catch(() => {});
    inventoryApi.suppliers.list().then((r) => setSuppliers(r.data.data.suppliers || [])).catch(() => {});
    inventoryApi.uoms.list().then((r) => setUoms(r.data.data.uoms || [])).catch(() => {});
  }, []);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const pickItem = (i, val) => {
    if (val === '__new__') { setLine(i, { _mode: 'new', item_id: '', description: '' }); return; }
    const m = masterItems.find((x) => String(x.id) === String(val));
    // Auto-load all master data for an existing item.
    setLine(i, { _mode: 'existing', item_id: val, description: m?.description || '', category: m?.category || '',
      uom: m?.uom || 'pcs', uom_attributes: m?.uom_attributes || {}, is_perishable: !!m?.is_perishable, track_batches: !!m?.track_batches });
  };
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);

  const submit = () => run(async () => {
    const clean = lines.filter((l) => l.description && Number(l.quantity) > 0 && l.destination_store_id);
    if (!clean.length) { toast.error('Add at least one item with description, quantity and destination store'); return; }
    try {
      const sup = suppliers.find((s) => String(s.id) === String(head.supplier_id));
      await inventoryApi.acceptance.createBatch({
        purchaser_name: purchaserName,
        supplier_id: head.supplier_id || undefined,
        supplier_name: head.supplier_name || (sup ? sup.name : undefined),
        supplier_info: head.supplier_info, invoice_number: head.invoice_number, grn_number: head.grn_number, notes: head.notes,
        items: clean.map((l) => ({
          item_id: l._mode === 'existing' ? Number(l.item_id) : undefined,
          is_new_item: l._mode === 'new',
          item_code: l.item_code, description: l.description, category: l.category, sub_category: l.sub_category, item_type: l.item_type,
          uom: l.uom, uom_attributes: l.uom_attributes, is_perishable: l.is_perishable, track_batches: l.track_batches,
          specifications: l.specifications, storage_requirements: l.storage_requirements,
          quantity: Number(l.quantity), unit_cost: Number(l.unit_cost) || 0, destination_store_id: Number(l.destination_store_id),
        })),
      });
      toast.success('Submitted for F&B review');
      onDone();
    } catch (err) { toast.error(err.response?.data?.message || 'Submit failed'); }
  });

  return (
    <Modal title="New Receiving — submit purchased items" onClose={onClose} wide>
      <div className="space-y-4">
        {/* Supplier + documents */}
        <div className="border rounded-xl p-3 bg-gray-50/60">
          <div className="text-sm font-semibold text-gray-700 mb-2">Supplier &amp; documents</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Supplier" value={head.supplier_id} onChange={(e) => setHead({ ...head, supplier_id: e.target.value })}>
              <option value="">Select / or type below…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <TextInput label="Invoice / Receipt #" value={head.invoice_number} onChange={(e) => setHead({ ...head, invoice_number: e.target.value })} />
            <TextInput label="GRN #" value={head.grn_number} onChange={(e) => setHead({ ...head, grn_number: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <TextInput label="Supplier name (if not listed)" value={head.supplier_name} onChange={(e) => setHead({ ...head, supplier_name: e.target.value })} />
            <TextInput label="Supplier info (phone / address / TIN)" value={head.supplier_info} onChange={(e) => setHead({ ...head, supplier_info: e.target.value })} />
          </div>
          <p className="text-xs text-gray-400 mt-2">Tip: attach the scanned receipt/invoice file from the item detail after submitting (Documents).</p>
        </div>

        {/* Item lines */}
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="border rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Item {i + 1}</span>
                {lines.length > 1 && <button onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="text-red-500 text-sm">Remove</button>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Inventory item</span>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={l._mode === 'new' ? '__new__' : l.item_id}
                    onChange={(e) => pickItem(i, e.target.value)}>
                    <option value="">Select item…</option>
                    <option value="__new__">➕ New item…</option>
                    {masterItems.map((m) => <option key={m.id} value={m.id}>{m.description} ({m.uom})</option>)}
                  </select>
                </label>
                <Select label="Destination store *" value={l.destination_store_id} onChange={(e) => setLine(i, { destination_store_id: e.target.value })}>
                  <option value="">Select store…</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.icon ? `${s.icon} ` : ''}{s.name}</option>)}
                </Select>
              </div>

              {/* New item: full add-item fields */}
              {l._mode === 'new' && (
                <div className="mt-3 border rounded-lg p-3 bg-teal-50/50 space-y-3">
                  <div className="text-xs font-semibold text-teal-700">New item details (added to inventory master)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextInput label="Description *" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                    <TextInput label="Item code (auto if blank)" value={l.item_code || ''} onChange={(e) => setLine(i, { item_code: e.target.value })} />
                    <TextInput label="Category" value={l.category} onChange={(e) => setLine(i, { category: e.target.value })} />
                    <TextInput label="Sub-category" value={l.sub_category} onChange={(e) => setLine(i, { sub_category: e.target.value })} />
                    <Select label="Unit of Measure" value={l.uom} onChange={(e) => setLine(i, { uom: e.target.value, uom_attributes: {} })}>
                      {uoms.map((u) => <option key={u.code} value={u.code}>{u.name} ({u.code})</option>)}
                    </Select>
                    <TextInput label="Item type" value={l.item_type} onChange={(e) => setLine(i, { item_type: e.target.value })} />
                  </div>
                  <div className="border rounded-lg p-2 bg-white">
                    <div className="text-xs font-semibold text-gray-600 mb-2">📐 {uoms.find((u) => u.code === l.uom)?.name || l.uom} details</div>
                    <UomFields uom={l.uom} value={l.uom_attributes} uoms={uoms} onChange={(next) => setLine(i, { uom_attributes: next })} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextInput label="Specifications" value={l.specifications} onChange={(e) => setLine(i, { specifications: e.target.value })} />
                    <TextInput label="Storage requirements" value={l.storage_requirements} onChange={(e) => setLine(i, { storage_requirements: e.target.value })} />
                  </div>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={l.is_perishable} onChange={(e) => setLine(i, { is_perishable: e.target.checked })} /> Perishable</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={l.track_batches} onChange={(e) => setLine(i, { track_batches: e.target.checked })} /> Track batches</label>
                  </div>
                </div>
              )}

              {/* Existing item: show loaded summary */}
              {l._mode === 'existing' && l.item_id && (
                <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                  Loaded: <b>{l.description}</b> · {l.uom} · {l.category || 'no category'}
                  {l.uom_attributes && Object.keys(l.uom_attributes).length ? ` · ${Object.entries(l.uom_attributes).map(([k, v]) => `${k}:${v}`).join(', ')}` : ''}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                <TextInput label="Quantity *" type="number" min="0" step="0.001" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <TextInput label="Unit cost" type="number" min="0" step="0.01" value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} />
                <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Line total</span>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm font-bold">{fmtMoney((Number(l.quantity) || 0) * (Number(l.unit_cost) || 0))}</div>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => setLines((ls) => [...ls, emptyLine()])} className="text-sm text-blue-600">+ add another item</button>
        </div>

        {/* Summary */}
        <div className="border rounded-xl p-3 bg-blue-50/50">
          <div className="text-sm font-semibold text-gray-700 mb-2">Item Information Summary</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th className="py-1">Item</th><th>Qty</th><th>Dest.</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {lines.filter((l) => l.description).map((l, i) => (
                <tr key={i} className="border-t border-blue-100">
                  <td className="py-1">{l.description}{l._mode === 'new' ? ' (new)' : ''}</td>
                  <td>{l.quantity || 0} {l.uom}</td>
                  <td>{stores.find((s) => String(s.id) === String(l.destination_store_id))?.name || '—'}</td>
                  <td className="text-right">{fmtMoney((Number(l.quantity) || 0) * (Number(l.unit_cost) || 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-blue-200 font-bold"><td className="py-1" colSpan={3}>Grand total</td><td className="text-right">{fmtMoney(total)}</td></tr></tfoot>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit for F&B review'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
