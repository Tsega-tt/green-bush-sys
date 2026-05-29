import React, { useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import useMasterData from '../../hooks/useMasterData';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/invPermissions';
import AttachmentsPanel from '../../components/inventory/AttachmentsPanel';
import { PageHeader, Btn, DataTable, Modal, Select, TextInput, StatusBadge, fmtMoney, fmtDate, useApiResource, useSubmitGuard } from '../../components/inventory/kit';

const FNB = ['admin', 'owner', 'fnb_manager'];
const blankLine = () => ({ item_id: '', description: '', uom: '', quantity_requested: '', est_unit_cost: '' });

export default function PurchaseRequests() {
  const { user } = useAuth();
  const isFnb = FNB.includes(user?.role);
  const isOwner = ['admin', 'owner'].includes(user?.role);
  const canCreate = can(user?.role, 'receiveGoods');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.pr.list({ status: status || undefined }).then((r) => r.data.data.requisitions || []),
    [status]
  );

  const columns = [
    { key: 'pr_number', label: 'PR #', render: (r) => <span className="font-mono text-xs">{r.pr_number}</span> },
    { key: 'store_name', label: 'Store' },
    { key: 'created_at', label: 'Raised', render: (r) => fmtDate(r.created_at) },
    { key: 'estimated_total', label: 'Est. total', align: 'right', render: (r) => fmtMoney(r.estimated_total) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'actions', label: '', align: 'right', render: (r) => <Btn onClick={() => setOpenId(r.id)}>Open</Btn> },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Purchase Requests">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-48">
          <option value="">All statuses</option>
          {['pending_fnb', 'pending_owner', 'approved', 'partially_approved', 'rejected', 'closed'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
        {canCreate && <Btn variant="primary" onClick={() => setCreating(true)}>New request</Btn>}
      </PageHeader>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No requests" />

      {creating && <NewPR onClose={() => setCreating(false)} onDone={() => { setCreating(false); refetch(); }} />}
      {openId && <PRDetail id={openId} isFnb={isFnb} isOwner={isOwner} onClose={() => { setOpenId(null); refetch(); }} />}
    </div>
  );
}

function NewPR({ onClose, onDone }) {
  const { user } = useAuth();
  const { stores, items } = useMasterData({ stores: true, items: true });
  const [storeId, setStoreId] = useState(user?.store_id || '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [busy, run] = useSubmitGuard();

  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const pickItem = (i, itemId) => {
    const it = items.find((x) => String(x.id) === String(itemId));
    setLine(i, { item_id: itemId, description: it?.description || '', uom: it?.uom || '' });
  };

  const submit = (e) => {
    e.preventDefault();
    const clean = lines.filter((l) => (l.item_id || l.description) && l.quantity_requested);
    if (clean.length === 0) { toast.error('Add at least one line'); return; }
    run(async () => {
      try {
        await inventoryApi.pr.create({
          store_id: Number(storeId), notes: notes || undefined,
          lines: clean.map((l) => ({
            item_id: l.item_id ? Number(l.item_id) : null, description: l.description || undefined, uom: l.uom || undefined,
            quantity_requested: Number(l.quantity_requested), est_unit_cost: l.est_unit_cost ? Number(l.est_unit_cost) : 0,
          })),
        });
        toast.success('Request submitted');
        onDone();
      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    });
  };

  return (
    <Modal title="New purchase request" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <Select label="Store" required value={storeId} onChange={(e) => setStoreId(e.target.value)} disabled={!!user?.store_id}>
          <option value="">Select…</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <select className="col-span-5 border rounded-lg px-2 py-2 text-sm" value={l.item_id} onChange={(e) => pickItem(i, e.target.value)}>
                <option value="">Item…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.description}</option>)}
              </select>
              <input className="col-span-3 border rounded-lg px-2 py-2 text-sm" placeholder="Qty" type="number" step="0.001" value={l.quantity_requested} onChange={(e) => setLine(i, { quantity_requested: e.target.value })} />
              <input className="col-span-3 border rounded-lg px-2 py-2 text-sm" placeholder="Est. cost" type="number" step="0.01" value={l.est_unit_cost} onChange={(e) => setLine(i, { est_unit_cost: e.target.value })} />
              <button type="button" className="col-span-1 text-red-500" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="text-sm text-blue-600" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ add line</button>
        </div>
        <TextInput label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function PRDetail({ id, isFnb, isOwner, onClose }) {
  const [busy, run] = useSubmitGuard();
  const { data: pr, loading, error, refetch } = useApiResource(() => inventoryApi.pr.get(id).then((r) => r.data.data.requisition), [id]);

  const approve = () => run(async () => {
    try { await inventoryApi.pr.approve(id, []); toast.success('Approved'); refetch(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  });
  const ownerApprove = () => run(async () => {
    try { await inventoryApi.pr.ownerApprove(id); toast.success('Owner approved'); refetch(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  });
  const reject = () => run(async () => {
    const reason = window.prompt('Rejection reason?');
    if (!reason) return;
    try { await inventoryApi.pr.reject(id, reason); toast.success('Rejected'); refetch(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  });

  return (
    <Modal title={pr ? `${pr.pr_number} — ${pr.store_name}` : 'Purchase request'} onClose={onClose} wide>
      {pr && <div className="flex items-center gap-3 mb-3"><StatusBadge value={pr.status} /><span className="text-sm text-gray-500">Est. {fmtMoney(pr.estimated_total)} · band {pr.threshold_band || '-'}</span></div>}
      <DataTable
        keyField="id"
        columns={[
          { key: 'description', label: 'Item', render: (r) => <span className="font-medium">{r.description}</span> },
          { key: 'quantity_requested', label: 'Requested', align: 'right' },
          { key: 'quantity_approved', label: 'Approved', align: 'right', render: (r) => (r.quantity_approved ?? '-') },
          { key: 'uom', label: 'UoM' },
          { key: 'est_unit_cost', label: 'Est. cost', align: 'right', render: (r) => fmtMoney(r.est_unit_cost) },
        ]}
        rows={pr?.lines || []} loading={loading} error={error} onRetry={refetch} empty="No lines"
      />
      {pr && (
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          {isFnb && pr.status === 'pending_fnb' && <>
            <Btn variant="danger" onClick={reject} disabled={busy}>Reject</Btn>
            <Btn variant="success" onClick={approve} disabled={busy}>Approve</Btn>
          </>}
          {isOwner && pr.status === 'pending_owner' && <Btn variant="success" onClick={ownerApprove} disabled={busy}>Owner approve</Btn>}
        </div>
      )}
      {pr && <div className="mt-4"><AttachmentsPanel entityType="purchase_requisition" entityId={pr.id} labels={['quote', 'specification', 'other']} /></div>}
    </Modal>
  );
}
