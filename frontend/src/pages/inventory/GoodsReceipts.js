import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import useMasterData from '../../hooks/useMasterData';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/invPermissions';
import AttachmentsPanel from '../../components/inventory/AttachmentsPanel';
import { PageHeader, Btn, DataTable, Modal, Select, TextInput, StatusBadge, fmtNum, fmtMoney, fmtDate, fmtDay, useApiResource, useSubmitGuard } from '../../components/inventory/kit';

export default function GoodsReceipts() {
  const { user } = useAuth();
  const canReceive = can(user?.role, 'receiveGoods');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.grn.list({ status: status || undefined }).then((r) => r.data.data.receipts || []),
    [status]
  );

  const columns = [
    { key: 'grn_number', label: 'GRN #', render: (r) => <span className="font-mono text-xs">{r.grn_number}</span> },
    { key: 'po_number', label: 'PO' },
    { key: 'store_name', label: 'Store' },
    { key: 'invoice_number', label: 'Invoice' },
    { key: 'created_at', label: 'Received', render: (r) => fmtDate(r.created_at || r.received_at) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'actions', label: '', align: 'right', render: (r) => <Btn onClick={() => setOpenId(r.id)}>{r.status === 'draft' ? 'Review & post' : 'View'}</Btn> },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Goods Receipts">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-44">
          <option value="">All statuses</option>
          {['draft', 'posted', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        {canReceive && <Btn variant="primary" onClick={() => setCreating(true)}>Receive goods</Btn>}
      </PageHeader>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No receipts" />

      {creating && <NewGRN onClose={() => setCreating(false)} onDone={(gid) => { setCreating(false); refetch(); setOpenId(gid); }} />}
      {openId && <GRNDetail id={openId} onClose={() => { setOpenId(null); refetch(); }} />}
    </div>
  );
}

function NewGRN({ onClose, onDone }) {
  const { user } = useAuth();
  const { stores } = useMasterData();
  const [openPOs, setOpenPOs] = useState([]);
  const [poId, setPoId] = useState('');
  const [po, setPo] = useState(null);
  const [storeId, setStoreId] = useState(user?.store_id || '');
  const [docs, setDocs] = useState({ invoice_number: '', grn_number: '', delivery_note_number: '' });
  const [lines, setLines] = useState([]);
  const [busy, run] = useSubmitGuard();

  useEffect(() => {
    Promise.all([inventoryApi.po.list({ status: 'issued' }), inventoryApi.po.list({ status: 'partially_received' })])
      .then(([a, b]) => setOpenPOs([...(a.data.data.orders || []), ...(b.data.data.orders || [])]))
      .catch(() => {});
  }, []);

  const loadPO = async (id) => {
    setPoId(id);
    setPo(null);
    if (!id) { setLines([]); return; }
    try {
      const r = await inventoryApi.po.get(id);
      const order = r.data.data.order;
      setPo(order);
      setLines((order.lines || []).map((l) => {
        const outstanding = Math.max(0, (Number(l.quantity_ordered) || 0) - (Number(l.quantity_received) || 0));
        return { po_line_id: l.id, description: l.description, unit_cost: l.unit_cost, ordered: l.quantity_ordered, outstanding, quantity_received: outstanding, quantity_rejected: '', batch_number: '', expiry_date: '' };
      }));
    } catch { toast.error('Could not load PO'); }
  };

  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = (e) => {
    e.preventDefault();
    if (!poId || !storeId) { toast.error('Select PO and store'); return; }
    const payloadLines = lines
      .filter((l) => Number(l.quantity_received) > 0 || Number(l.quantity_rejected) > 0)
      .map((l) => ({
        po_line_id: l.po_line_id, quantity_received: Number(l.quantity_received || 0),
        quantity_rejected: l.quantity_rejected ? Number(l.quantity_rejected) : 0,
        unit_cost: l.unit_cost, batch_number: l.batch_number || undefined, expiry_date: l.expiry_date || undefined,
      }));
    if (payloadLines.length === 0) { toast.error('Enter received quantities'); return; }
    run(async () => {
      try {
        const r = await inventoryApi.grn.create({
          po_id: Number(poId), store_id: Number(storeId),
          invoice_number: docs.invoice_number || undefined, grn_number: docs.grn_number || undefined,
          delivery_note_number: docs.delivery_note_number || undefined, lines: payloadLines,
        });
        toast.success('Receipt drafted — attach invoice & GRN, then post');
        onDone(r.data.data.receipt.id);
      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    });
  };

  return (
    <Modal title="Receive goods" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Purchase order" required value={poId} onChange={(e) => loadPO(e.target.value)}>
            <option value="">Select…</option>
            {openPOs.map((p) => <option key={p.id} value={p.id}>{p.po_number} — {p.supplier_name}</option>)}
          </Select>
          <Select label="Receiving store" required value={storeId} onChange={(e) => setStoreId(e.target.value)} disabled={!!user?.store_id}>
            <option value="">Select…</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextInput label="Invoice #" value={docs.invoice_number} onChange={(e) => setDocs({ ...docs, invoice_number: e.target.value })} />
          <TextInput label="GRN #" value={docs.grn_number} onChange={(e) => setDocs({ ...docs, grn_number: e.target.value })} />
          <TextInput label="Delivery note #" value={docs.delivery_note_number} onChange={(e) => setDocs({ ...docs, delivery_note_number: e.target.value })} />
        </div>

        {po && (
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left"><tr>
                <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Rejected</th>
                <th className="px-3 py-2">Batch</th><th className="px-3 py-2">Expiry</th>
              </tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.po_line_id} className="border-t">
                    <td className="px-3 py-2 font-medium">{l.description}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{fmtNum(l.outstanding)}</td>
                    <td className="px-3 py-2 text-right"><input type="number" step="0.001" min="0" className="w-24 border rounded px-2 py-1 text-right" value={l.quantity_received} onChange={(e) => setLine(i, { quantity_received: e.target.value })} /></td>
                    <td className="px-3 py-2 text-right"><input type="number" step="0.001" min="0" className="w-20 border rounded px-2 py-1 text-right" value={l.quantity_rejected} onChange={(e) => setLine(i, { quantity_rejected: e.target.value })} /></td>
                    <td className="px-3 py-2"><input className="w-28 border rounded px-2 py-1" value={l.batch_number} onChange={(e) => setLine(i, { batch_number: e.target.value })} /></td>
                    <td className="px-3 py-2"><input type="date" className="border rounded px-2 py-1" value={l.expiry_date} onChange={(e) => setLine(i, { expiry_date: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Create draft'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function GRNDetail({ id, onClose }) {
  const { user } = useAuth();
  const canPost = can(user?.role, 'receiveGoods');
  const [busy, run] = useSubmitGuard();
  const { data: grn, loading, error, refetch } = useApiResource(() => inventoryApi.grn.get(id).then((r) => r.data.data.receipt), [id]);

  const post = () => run(async () => {
    if (!window.confirm('Post this receipt? Stock will be increased and costs updated. This cannot be undone.')) return;
    try { await inventoryApi.grn.post(id); toast.success('Receipt posted — stock updated'); refetch(); }
    catch (e) { toast.error(e.response?.data?.message || 'Post failed (invoice & GRN documents are required)'); }
  });

  return (
    <Modal title={grn ? `${grn.grn_number} — PO ${grn.po_number}` : 'Goods receipt'} onClose={onClose} wide>
      {grn && <div className="flex items-center gap-3 mb-3"><StatusBadge value={grn.status} /><span className="text-sm text-gray-500">{grn.store_name} · Invoice {grn.invoice_number || '—'} · {fmtDate(grn.created_at)}</span></div>}
      <DataTable
        keyField="id"
        columns={[
          { key: 'description', label: 'Item', render: (r) => <span className="font-medium">{r.description}</span> },
          { key: 'quantity_received', label: 'Received', align: 'right', render: (r) => fmtNum(r.quantity_received) },
          { key: 'quantity_rejected', label: 'Rejected', align: 'right', render: (r) => fmtNum(r.quantity_rejected) },
          { key: 'unit_cost', label: 'Unit cost', align: 'right', render: (r) => fmtMoney(r.unit_cost) },
          { key: 'batch_number', label: 'Batch', render: (r) => r.batch_number || '-' },
          { key: 'expiry_date', label: 'Expiry', render: (r) => (r.expiry_date ? fmtDay(r.expiry_date) : '-') },
        ]}
        rows={grn?.lines || []} loading={loading} error={error} onRetry={refetch} empty="No lines"
      />
      {grn && grn.status === 'draft' && (
        <>
          <div className="mt-4"><AttachmentsPanel entityType="goods_receipt" entityId={grn.id} labels={['invoice', 'grn', 'delivery_note', 'other']} /></div>
          {canPost && (
            <>
              <div className="flex justify-end mt-4">
                <Btn variant="success" onClick={post} disabled={busy}>Post receipt</Btn>
              </div>
              <p className="text-xs text-gray-400 text-right mt-1">Invoice and GRN documents must be attached before posting.</p>
            </>
          )}
        </>
      )}
      {grn && grn.status !== 'draft' && <div className="mt-4"><AttachmentsPanel entityType="goods_receipt" entityId={grn.id} labels={['invoice', 'grn', 'delivery_note', 'other']} /></div>}
    </Modal>
  );
}
