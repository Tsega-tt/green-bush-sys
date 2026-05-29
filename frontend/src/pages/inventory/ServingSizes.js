import React, { useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import { PageHeader, Btn, DataTable, Modal, TextInput, StatusBadge, fmtDate, useApiResource, useSubmitGuard } from '../../components/inventory/kit';

const blank = { name: '', code: '', liter_quantity: '', is_active: true };

export default function ServingSizes() {
  const [edit, setEdit] = useState(null);
  const [busy, run] = useSubmitGuard();
  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.servingSizes.list().then((r) => r.data.data.serving_sizes || []), []
  );

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const payload = { name: edit.name, liter_quantity: Number(edit.liter_quantity), is_active: edit.is_active };
        if (edit.id) await inventoryApi.servingSizes.update(edit.id, payload);
        else await inventoryApi.servingSizes.create({ ...payload, code: edit.code || undefined });
        toast.success('Serving size saved');
        setEdit(null); refetch();
      } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    });
  };

  const toggle = (s) => run(async () => {
    try { await inventoryApi.servingSizes.update(s.id, { is_active: !s.is_active }); refetch(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  });

  const columns = [
    { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: 'liter_quantity', label: 'Liters', align: 'right', render: (r) => `${Number(r.liter_quantity)} L` },
    { key: 'is_active', label: 'Status', render: (r) => <StatusBadge value={r.is_active ? 'approved' : 'closed'} /> },
    { key: 'updated_at', label: 'Updated', render: (r) => fmtDate(r.updated_at) },
    { key: 'actions', label: '', align: 'right', render: (r) => (
      <div className="flex justify-end gap-2">
        <Btn onClick={() => toggle(r)} disabled={busy}>{r.is_active ? 'Deactivate' : 'Activate'}</Btn>
        <Btn variant="primary" onClick={() => setEdit({ ...blank, ...r })}>Edit</Btn>
      </div>
    ) },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Draft Serving Sizes">
        <Btn variant="primary" onClick={() => setEdit({ ...blank })}>New serving size</Btn>
      </PageHeader>
      <p className="text-sm text-gray-500 mb-4">Liter amounts are configurable here — draft sales read these values at sale time. No code changes needed to add or adjust sizes.</p>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No serving sizes" />

      {edit && (
        <Modal title={edit.id ? `Edit — ${edit.name}` : 'New serving size'} onClose={() => setEdit(null)}>
          <form onSubmit={save} className="space-y-3">
            <TextInput label="Display name" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Large" />
            {!edit.id && <TextInput label="Code (optional, auto from name)" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder="large" />}
            <TextInput label="Liter quantity" type="number" step="0.001" min="0" required value={edit.liter_quantity} onChange={(e) => setEdit({ ...edit, liter_quantity: e.target.value })} placeholder="0.50" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" onClick={() => setEdit(null)}>Cancel</Btn>
              <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
