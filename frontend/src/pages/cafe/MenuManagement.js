import React, { useState } from 'react';
import toast from 'react-hot-toast';
import apiService from '../../services/api';
import { PageHeader, Btn, DataTable, Modal, TextInput, Select, useApiResource, useSubmitGuard, fmtMoney } from '../../components/inventory/kit';

const blank = { name: '', category: '', price: '', description: '', type: 'cafe' };

export default function MenuManagement() {
  const [edit, setEdit] = useState(null);
  const [busy, run] = useSubmitGuard();
  const { data: items, loading, error, refetch } = useApiResource(
    () => apiService.menu.getAll().then((r) => {
      const d = r?.data;
      const arr = d?.data?.menuItems || d?.data?.items || d?.menuItems || d?.items || d?.menu
        || (Array.isArray(d?.data) ? d.data : null) || (Array.isArray(d) ? d : []);
      return arr || [];
    }), []
  );

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const payload = { name: edit.name, category: edit.category, price: Number(edit.price), description: edit.description, type: edit.type || 'cafe' };
        if (edit.id) await apiService.menu.update(edit.id, payload);
        else await apiService.menu.create(payload);
        toast.success('Menu item saved');
        setEdit(null); refetch();
      } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    });
  };

  const columns = [
    { key: 'name', label: 'Item name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description', render: (r) => <span className="text-sm text-gray-600">{r.description || '—'}</span> },
    { key: 'price', label: 'Price', align: 'right', render: (r) => fmtMoney(r.price || r.selling_price) },
    { key: 'actions', label: '', align: 'right', render: (r) => (
      <div className="flex justify-end gap-2">
        <Btn onClick={() => setEdit({ ...blank, ...r })}>Edit</Btn>
        <Btn variant="danger" onClick={() => {
          if (window.confirm(`Delete "${r.name}"?`)) {
            run(async () => {
              try { await apiService.menu.delete(r.id); refetch(); toast.success('Deleted'); }
              catch (err) { toast.error('Failed'); }
            });
          }
        }} disabled={busy}>Delete</Btn>
      </div>
    ) },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Menu Management">
        <Btn variant="primary" onClick={() => setEdit({ ...blank })}>Add menu item</Btn>
      </PageHeader>
      <p className="text-sm text-gray-500 mb-4">Manage cafe menu items. After adding here, create recipes in Inventory to link items to store ingredients and enable automatic stock deduction on sale.</p>
      <DataTable columns={columns} rows={items || []} loading={loading} error={error} onRetry={refetch} empty="No menu items. Add one to get started." />

      {edit && (
        <Modal title={edit.id ? `Edit — ${edit.name}` : 'Add menu item'} onClose={() => setEdit(null)}>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Item name" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Draft Heineken Large" />
              <Select label="Type" value={edit.type || 'cafe'} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
                <option value="cafe">Cafe</option>
                <option value="bakery">Bakery</option>
              </Select>
            </div>
            <TextInput label="Category" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="e.g. Beverages" />
            <TextInput label="Price" type="number" step="0.01" min="0" required value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} placeholder="90.00" />
            <TextInput label="Description (optional)" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="e.g. 0.5L draft beer" />
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
