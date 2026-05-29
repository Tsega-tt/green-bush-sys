import React, { useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import useMasterData from '../../hooks/useMasterData';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/invPermissions';
import { PageHeader, Btn, DataTable, Modal, Select, StatusBadge, fmtNum, fmtDate, useApiResource, useSubmitGuard } from '../../components/inventory/kit';

export default function StockCounts() {
  const { user } = useAuth();
  const canOps = can(user?.role, 'operations');
  const { stores } = useMasterData();
  const pinned = user?.store_id || null;
  const [storeId, setStoreId] = useState(pinned || '');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.counts.list({ store_id: storeId || undefined }).then((r) => r.data.data.counts || r.data.data.rows || []),
    [storeId]
  );

  const columns = [
    { key: 'count_number', label: 'Count #', render: (r) => <span className="font-mono text-xs">{r.count_number}</span> },
    { key: 'store_name', label: 'Store' },
    { key: 'is_blind', label: 'Type', render: (r) => (r.is_blind ? 'Blind' : 'Open') },
    { key: 'created_at', label: 'Created', render: (r) => fmtDate(r.created_at) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'actions', label: '', align: 'right', render: (r) => <Btn onClick={() => setOpenId(r.id)}>{r.status === 'open' ? 'Enter counts' : 'View'}</Btn> },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Stock Counts">
        <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="!w-48">
          <option value="">All stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {canOps && <Btn variant="primary" onClick={() => setCreating(true)}>New count</Btn>}
      </PageHeader>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No stock counts" />

      {creating && <NewCount stores={stores} pinned={pinned} onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); refetch(); setOpenId(id); }} />}
      {openId && <CountDetail id={openId} canEdit={canOps} onClose={() => { setOpenId(null); refetch(); }} />}
    </div>
  );
}

function NewCount({ stores, pinned, onClose, onDone }) {
  const [form, setForm] = useState({ store_id: pinned || '', is_blind: false });
  const [busy, run] = useSubmitGuard();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const r = await inventoryApi.counts.create({ store_id: Number(form.store_id), is_blind: form.is_blind });
        toast.success('Count sheet created');
        onDone(r.data.data.count.id);
      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    });
  };
  return (
    <Modal title="New stock count" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select label="Store" required value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })} disabled={!!pinned}>
          <option value="">Select…</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_blind} onChange={(e) => setForm({ ...form, is_blind: e.target.checked })} /> Blind count (hide system quantities)</label>
        <div className="flex justify-end gap-2 pt-2">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Creating…' : 'Create sheet'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function CountDetail({ id, canEdit, onClose }) {
  const [entries, setEntries] = useState({}); // line_id -> value
  const [busy, run] = useSubmitGuard();
  const { data: count, loading, error, refetch } = useApiResource(
    () => inventoryApi.counts.get(id).then((r) => r.data.data.count),
    [id]
  );
  const open = count?.status === 'open';
  const blind = count?.is_blind && open;

  const save = () => run(async () => {
    const lines = Object.entries(entries)
      .filter(([, v]) => v !== '' && v != null)
      .map(([line_id, v]) => ({ line_id: Number(line_id), physical_qty: Number(v) }));
    if (lines.length === 0) { toast.error('Enter at least one count'); return; }
    try { await inventoryApi.counts.enter(id, lines); toast.success('Counts saved'); setEntries({}); refetch(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  });

  const finalize = () => run(async () => {
    if (!window.confirm('Finalize this count? Variances will post stock adjustments and lock the sheet.')) return;
    try { await inventoryApi.counts.finalize(id); toast.success('Count finalized'); refetch(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  });

  const columns = [
    { key: 'description', label: 'Item', render: (r) => <span className="font-medium">{r.description}</span> },
    ...(!blind ? [{ key: 'system_qty', label: 'System', align: 'right', render: (r) => fmtNum(r.system_qty) }] : []),
    { key: 'physical', label: 'Physical', align: 'right', render: (r) => (open && canEdit)
      ? <input type="number" step="0.001" className="w-28 border rounded-lg px-2 py-1 text-right"
          value={entries[r.id] ?? (r.physical_qty ?? '')} onChange={(e) => setEntries({ ...entries, [r.id]: e.target.value })} />
      : fmtNum(r.physical_qty) },
    ...(!open ? [{ key: 'variance', label: 'Variance', align: 'right', render: (r) => {
      const v = Number(r.variance || 0);
      return <span className={v === 0 ? 'text-gray-400' : v > 0 ? 'text-green-600' : 'text-red-600'}>{fmtNum(v)}</span>;
    } }] : []),
  ];

  return (
    <Modal title={count ? `Count ${count.count_number} — ${count.store_name}` : 'Stock count'} onClose={onClose} wide>
      <div className="mb-3 flex items-center gap-3">
        {count && <StatusBadge value={count.status} />}
        {count && <span className="text-sm text-gray-500">{count.is_blind ? 'Blind count' : 'Open count'} · {fmtDate(count.created_at)}</span>}
      </div>
      <DataTable columns={columns} rows={count?.lines || []} loading={loading} error={error} onRetry={refetch} keyField="id" empty="No lines" />
      {open && canEdit && (
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="primary" onClick={save} disabled={busy}>Save counts</Btn>
          <Btn variant="success" onClick={finalize} disabled={busy}>Finalize</Btn>
        </div>
      )}
    </Modal>
  );
}
