import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import useMasterData from '../../hooks/useMasterData';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/invPermissions';
import AttachmentsPanel from '../../components/inventory/AttachmentsPanel';
import { fetchLegacyApprovedPRs } from '../../utils/legacyPrBridge';
import { PageHeader, Btn, DataTable, Modal, Select, TextInput, StatusBadge, fmtMoney, fmtDay, useApiResource, useSubmitGuard } from '../../components/inventory/kit';

export default function PurchaseOrders() {
  const { user } = useAuth();
  const canCreate = can(user?.role, 'purchasing');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.po.list({ status: status || undefined }).then((r) => r.data.data.orders || []),
    [status]
  );

  const columns = [
    { key: 'po_number', label: 'PO #', render: (r) => <span className="font-mono text-xs">{r.po_number}</span> },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'order_date', label: 'Ordered', render: (r) => fmtDay(r.order_date) },
    { key: 'expected_date', label: 'Expected', render: (r) => fmtDay(r.expected_date) },
    { key: 'total_cost', label: 'Total', align: 'right', render: (r) => fmtMoney(r.total_cost ?? r.total) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'actions', label: '', align: 'right', render: (r) => <Btn onClick={() => setOpenId(r.id)}>Open</Btn> },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Purchase Orders">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-48">
          <option value="">All statuses</option>
          {['issued', 'partially_received', 'received', 'closed', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
        {canCreate && <Btn variant="primary" onClick={() => setCreating(true)}>New order</Btn>}
      </PageHeader>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No orders" />

      {creating && <NewPO onClose={() => setCreating(false)} onDone={() => { setCreating(false); refetch(); }} />}
      {openId && <PODetail id={openId} onClose={() => { setOpenId(null); refetch(); }} />}
    </div>
  );
}

function NewPO({ onClose, onDone }) {
  const { user } = useAuth();
  const { items, suppliers } = useMasterData({ stores: false, items: true, suppliers: true });
  const [approvedPRs, setApprovedPRs] = useState([]);
  const [prId, setPrId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [expected, setExpected] = useState('');
  const [lines, setLines] = useState([{ item_id: '', description: '', uom: '', quantity_ordered: '', unit_cost: '' }]);
  const [busy, run] = useSubmitGuard();

  useEffect(() => {
    Promise.all([
      inventoryApi.pr.list({ status: 'approved' }),
      inventoryApi.pr.list({ status: 'partially_approved' }),
      fetchLegacyApprovedPRs(user),
    ])
      .then(([a, b, legacy]) => setApprovedPRs([...(a.data.data.requisitions || []), ...(b.data.data.requisitions || []), ...legacy]))
      .catch(() => {});
  }, [user]);

  const selectedPR = approvedPRs.find((p) => String(p.id) === String(prId));

  const loadFromPR = async (id) => {
    setPrId(id);
    if (!id) return;
    try {
      // Legacy PRs already carry their normalized lines; PG PRs are fetched.
      const sel = approvedPRs.find((p) => String(p.id) === String(id));
      const prLines = sel?.is_legacy
        ? (sel.lines || [])
        : ((await inventoryApi.pr.get(id)).data.data.requisition.lines || []);
      setLines(prLines.map((l) => ({
        item_id: l.item_id || '', description: l.description || '', uom: l.uom || '',
        quantity_ordered: l.quantity_approved ?? l.quantity_requested, unit_cost: l.est_unit_cost || '',
      })));
    } catch { toast.error('Could not load PR lines'); }
  };

  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const pickItem = (i, itemId) => {
    const it = items.find((x) => String(x.id) === String(itemId));
    setLine(i, { item_id: itemId, description: it?.description || '', uom: it?.uom || '' });
  };

  const submit = (e) => {
    e.preventDefault();
    const clean = lines.filter((l) => l.item_id && l.quantity_ordered && l.unit_cost !== '');
    if (!supplierId) { toast.error('Pick a supplier'); return; }
    if (clean.length === 0) { toast.error('Add at least one priced line'); return; }
    run(async () => {
      try {
        // Legacy PRs don't exist in the PG table, so the PO is raised as a manual
        // order (no pr_id); the legacy PR is then closed via the bridge endpoint.
        const isLegacy = !!selectedPR?.is_legacy;
        const order = await inventoryApi.po.create({
          pr_id: prId && !isLegacy ? Number(prId) : undefined, supplier_id: Number(supplierId), expected_date: expected || undefined,
          lines: clean.map((l) => ({ item_id: Number(l.item_id), description: l.description || undefined, uom: l.uom || undefined, quantity_ordered: Number(l.quantity_ordered), unit_cost: Number(l.unit_cost) })),
        });
        if (isLegacy) {
          try {
            await inventoryApi.legacyPr.close(selectedPR.legacy_id, {
              actor_id: user?.id, actor_name: user?.full_name || user?.username,
              po_number: order?.data?.data?.order?.po_number,
            });
          } catch { /* PO is created; closing the legacy PR is best-effort */ }
        }
        toast.success('Order created');
        onDone();
      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    });
  };

  const total = lines.reduce((s, l) => s + (Number(l.quantity_ordered) || 0) * (Number(l.unit_cost) || 0), 0);

  return (
    <Modal title="New purchase order" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Select label="From approved PR (optional)" value={prId} onChange={(e) => loadFromPR(e.target.value)}>
            <option value="">Manual order</option>
            {approvedPRs.map((p) => <option key={p.id} value={p.id}>{p.pr_number} — {p.store_name}{p.is_legacy ? ' (req)' : ''}</option>)}
          </Select>
          <Select label="Supplier" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Select…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <TextInput label="Expected date" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <select className="col-span-5 border rounded-lg px-2 py-2 text-sm" value={l.item_id} onChange={(e) => pickItem(i, e.target.value)}>
                <option value="">Item…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.description}</option>)}
              </select>
              <input className="col-span-3 border rounded-lg px-2 py-2 text-sm" placeholder="Qty" type="number" step="0.001" value={l.quantity_ordered} onChange={(e) => setLine(i, { quantity_ordered: e.target.value })} />
              <input className="col-span-3 border rounded-lg px-2 py-2 text-sm" placeholder="Unit cost" type="number" step="0.01" value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} />
              <button type="button" className="col-span-1 text-red-500" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="text-sm text-blue-600" onClick={() => setLines((ls) => [...ls, { item_id: '', description: '', uom: '', quantity_ordered: '', unit_cost: '' }])}>+ add line</button>
        </div>
        <div className="text-right font-semibold">Total: {fmtMoney(total)}</div>
        <div className="flex justify-end gap-2 pt-2">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Creating…' : 'Create order'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function PODetail({ id, onClose }) {
  const { data: po, loading, error, refetch } = useApiResource(() => inventoryApi.po.get(id).then((r) => r.data.data.order), [id]);
  return (
    <Modal title={po ? `${po.po_number} — ${po.supplier_name}` : 'Purchase order'} onClose={onClose} wide>
      {po && <div className="flex items-center gap-3 mb-3"><StatusBadge value={po.status} /><span className="text-sm text-gray-500">Ordered {fmtDay(po.order_date)} · Expected {fmtDay(po.expected_date)} · Total {fmtMoney(po.total_cost ?? po.total)}</span></div>}
      <DataTable
        keyField="id"
        columns={[
          { key: 'description', label: 'Item', render: (r) => <span className="font-medium">{r.description}</span> },
          { key: 'quantity_ordered', label: 'Ordered', align: 'right' },
          { key: 'quantity_received', label: 'Received', align: 'right', render: (r) => (r.quantity_received ?? 0) },
          { key: 'uom', label: 'UoM' },
          { key: 'unit_cost', label: 'Unit cost', align: 'right', render: (r) => fmtMoney(r.unit_cost) },
          { key: 'line_total', label: 'Total', align: 'right', render: (r) => fmtMoney((Number(r.quantity_ordered) || 0) * (Number(r.unit_cost) || 0)) },
        ]}
        rows={po?.lines || []} loading={loading} error={error} onRetry={refetch} empty="No lines"
      />
      {po && <div className="mt-4"><AttachmentsPanel entityType="purchase_order" entityId={po.id} labels={['po_document', 'quote', 'other']} /></div>}
    </Modal>
  );
}
