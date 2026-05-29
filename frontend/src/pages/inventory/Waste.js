import React, { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import useMasterData from '../../hooks/useMasterData';
import useInventoryEvents from '../../hooks/useInventoryEvents';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/invPermissions';
import { PageHeader, Btn, DataTable, Modal, Select, TextInput, fmtNum, fmtMoney, fmtDate, useApiResource, useSubmitGuard } from '../../components/inventory/kit';

const REASONS = ['spoilage', 'expired', 'breakage', 'prep_loss', 'over_production', 'theft', 'other'];

export default function Waste() {
  const { user } = useAuth();
  const canRecord = can(user?.role, 'operations');
  const { stores, items } = useMasterData({ stores: true, items: true });
  const pinned = user?.store_id || null;
  const [storeId, setStoreId] = useState(pinned || '');
  const [form, setForm] = useState(null);
  const [busy, run] = useSubmitGuard();

  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.waste.list({ store_id: storeId || undefined }).then((r) => r.data.data.waste || r.data.data.rows || []),
    [storeId]
  );
  useInventoryEvents(useCallback((t) => { if (t === 'inventory.changed') refetch(); }, [refetch]));

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        await inventoryApi.waste.record({
          store_id: Number(form.store_id), item_id: Number(form.item_id),
          quantity: Number(form.quantity), reason: form.reason,
        });
        toast.success('Waste recorded');
        setForm(null);
        refetch();
      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    });
  };

  const columns = [
    { key: 'created_at', label: 'When', render: (r) => fmtDate(r.created_at) },
    { key: 'store_name', label: 'Store' },
    { key: 'description', label: 'Item', render: (r) => <span className="font-medium">{r.description}</span> },
    { key: 'quantity', label: 'Qty', align: 'right', render: (r) => fmtNum(r.quantity) },
    { key: 'reason', label: 'Reason' },
    { key: 'value', label: 'Value', align: 'right', render: (r) => fmtMoney(r.value ?? r.total_value) },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Waste">
        <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="!w-48">
          <option value="">All stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {canRecord && <Btn variant="primary" onClick={() => setForm({ store_id: pinned || storeId || '', item_id: '', quantity: '', reason: REASONS[0] })}>Record waste</Btn>}
      </PageHeader>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} keyField="id" empty="No waste recorded" />

      {form && (
        <Modal title="Record waste" onClose={() => setForm(null)}>
          <form onSubmit={submit} className="space-y-3">
            <Select label="Store" required value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })} disabled={!!pinned}>
              <option value="">Select…</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select label="Item" required value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
              <option value="">Select…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.description}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Quantity" type="number" step="0.001" min="0" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              <Select label="Reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" onClick={() => setForm(null)}>Cancel</Btn>
              <Btn type="submit" variant="danger" disabled={busy}>{busy ? 'Saving…' : 'Record waste'}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
