import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/invPermissions';
import { PageHeader, Btn, DataTable, Modal, TextInput, Select, StatusBadge, fmtMoney, fmtDate, useApiResource, useSubmitGuard } from '../../components/inventory/kit';
import UomFields from '../../components/inventory/UomFields';

const blank = { item_code: '', description: '', category: '', uom: 'pcs', is_perishable: false, track_batches: false, default_min_qty: 0, default_reorder: 0, is_active: true, uom_attributes: {} };

export default function ItemsMaster() {
  const { user } = useAuth();
  const canManage = can(user?.role, 'manageItems');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const [history, setHistory] = useState(null); // { item, rows }
  const [uoms, setUoms] = useState([]);
  const [busy, run] = useSubmitGuard();

  useEffect(() => {
    inventoryApi.uoms.list().then((r) => setUoms(r.data.data.uoms || [])).catch(() => {});
  }, []);

  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.items.list({ q: search || undefined, limit: 500 }).then((r) => r.data.data.items || []),
    [search]
  );

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const payload = { ...edit, default_min_qty: Number(edit.default_min_qty), default_reorder: Number(edit.default_reorder) };
        if (edit.id) await inventoryApi.items.update(edit.id, payload);
        else await inventoryApi.items.create(payload);
        toast.success('Saved');
        setEdit(null);
        refetch();
      } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    });
  };

  const openHistory = async (item) => {
    try {
      const r = await inventoryApi.items.priceHistory(item.id);
      setHistory({ item, rows: r.data.data.history || r.data.data.rows || [] });
    } catch { toast.error('Could not load price history'); }
  };

  const columns = [
    { key: 'item_code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.item_code}</span> },
    { key: 'description', label: 'Item', render: (r) => <span className="font-medium">{r.description}</span> },
    { key: 'category', label: 'Category' },
    { key: 'uom', label: 'UoM' },
    { key: 'flags', label: 'Tracking', render: (r) => (
      <span className="text-xs text-gray-500">{r.is_perishable ? 'perishable ' : ''}{r.track_batches ? 'batches' : ''}{!r.is_perishable && !r.track_batches ? '—' : ''}</span>
    ) },
    { key: 'is_active', label: 'Status', render: (r) => <StatusBadge value={r.is_active ? 'approved' : 'closed'} /> },
    { key: 'actions', label: '', align: 'right', render: (r) => (
      <div className="flex justify-end gap-2">
        <Btn onClick={() => openHistory(r)}>Prices</Btn>
        {canManage && <Btn onClick={() => setEdit({ ...blank, ...r })}>Edit</Btn>}
      </div>
    ) },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Items">
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Search code / name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {canManage && <Btn variant="primary" onClick={() => setEdit({ ...blank })}>New item</Btn>}
      </PageHeader>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No items" />

      {edit && (
        <Modal title={edit.id ? 'Edit item' : 'New item'} onClose={() => setEdit(null)} wide>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Item code" required value={edit.item_code} onChange={(e) => setEdit({ ...edit, item_code: e.target.value })} />
              <Select label="Unit of Measure" value={edit.uom} onChange={(e) => setEdit({ ...edit, uom: e.target.value, uom_attributes: {} })}>
                {uoms.map((u) => <option key={u.code} value={u.code}>{u.name} ({u.code})</option>)}
              </Select>
            </div>
            <TextInput label="Description" required value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <TextInput label="Category" value={edit.category || ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Min qty" type="number" step="0.001" value={edit.default_min_qty} onChange={(e) => setEdit({ ...edit, default_min_qty: e.target.value })} />
              <TextInput label="Reorder point" type="number" step="0.001" value={edit.default_reorder} onChange={(e) => setEdit({ ...edit, default_reorder: e.target.value })} />
            </div>

            {/* Data-driven UOM details */}
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/60">
              <div className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                📐 {uoms.find((u) => u.code === edit.uom)?.name || edit.uom} details
              </div>
              <UomFields uom={edit.uom} value={edit.uom_attributes || {}} uoms={uoms}
                onChange={(next) => setEdit((s) => ({ ...s, uom_attributes: next }))} />
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!edit.is_perishable} onChange={(e) => setEdit({ ...edit, is_perishable: e.target.checked })} /> Perishable</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!edit.track_batches} onChange={(e) => setEdit({ ...edit, track_batches: e.target.checked })} /> Track batches</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" onClick={() => setEdit(null)}>Cancel</Btn>
              <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
            </div>
          </form>
        </Modal>
      )}

      {history && (
        <Modal title={`Price history — ${history.item.description}`} onClose={() => setHistory(null)} wide>
          <DataTable
            keyField="id"
            columns={[
              { key: 'effective_date', label: 'Date', render: (r) => fmtDate(r.effective_date || r.created_at) },
              { key: 'supplier_name', label: 'Supplier', render: (r) => r.supplier_name || '-' },
              { key: 'unit_cost', label: 'Unit cost', align: 'right', render: (r) => fmtMoney(r.unit_cost) },
              { key: 'source', label: 'Source', render: (r) => r.source || r.doc_type || '-' },
            ]}
            rows={history.rows}
            loading={false}
            empty="No price changes recorded"
          />
        </Modal>
      )}
    </div>
  );
}
