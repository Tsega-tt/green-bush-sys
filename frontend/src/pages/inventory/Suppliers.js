import React, { useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import { PageHeader, Btn, DataTable, Modal, TextInput, StatusBadge, useApiResource, useSubmitGuard } from '../../components/inventory/kit';

const blank = { name: '', contact_name: '', phone: '', email: '', address: '', is_active: true };

export default function Suppliers() {
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const [busy, run] = useSubmitGuard();
  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.suppliers.list({ q: search || undefined }).then((r) => r.data.data.suppliers || []),
    [search]
  );

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        if (edit.id) await inventoryApi.suppliers.update(edit.id, edit);
        else await inventoryApi.suppliers.create(edit);
        toast.success('Saved');
        setEdit(null);
        refetch();
      } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    });
  };

  const columns = [
    { key: 'name', label: 'Supplier', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'contact_name', label: 'Contact' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'is_active', label: 'Status', render: (r) => <StatusBadge value={r.is_active ? 'approved' : 'closed'} /> },
    { key: 'actions', label: '', align: 'right', render: (r) => <Btn onClick={() => setEdit({ ...blank, ...r })}>Edit</Btn> },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Suppliers">
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Btn variant="primary" onClick={() => setEdit({ ...blank })}>New supplier</Btn>
      </PageHeader>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No suppliers" />

      {edit && (
        <Modal title={edit.id ? 'Edit supplier' : 'New supplier'} onClose={() => setEdit(null)}>
          <form onSubmit={save} className="space-y-3">
            <TextInput label="Name" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Contact name" value={edit.contact_name || ''} onChange={(e) => setEdit({ ...edit, contact_name: e.target.value })} />
              <TextInput label="Phone" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </div>
            <TextInput label="Email" type="email" value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            <TextInput label="Address" value={edit.address || ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
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
