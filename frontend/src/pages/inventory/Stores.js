import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import {
  PageHeader, Btn, DataTable, Modal, TextInput, StatusBadge, StatCard,
  fmtMoney, fmtNum, fmtDate, useApiResource, useSubmitGuard,
} from '../../components/inventory/kit';

const blank = { code: '', name: '', description: '', is_active: true };

export default function Stores() {
  const [catalog, setCatalog] = useState([]);
  const [managers, setManagers] = useState([]);
  const [editor, setEditor] = useState(null); // store being created/edited
  const [detail, setDetail] = useState(null); // store being viewed

  const { data: stores, loading, error, refetch } = useApiResource(
    () => inventoryApi.stores.list().then((r) => r.data.data.stores || []), []
  );

  useEffect(() => {
    inventoryApi.stores.capabilityCatalog().then((r) => setCatalog(r.data.data.capabilities || [])).catch(() => {});
    inventoryApi.stores.managers().then((r) => setManagers(r.data.data.managers || [])).catch(() => {});
  }, []);

  const reloadManagers = () => inventoryApi.stores.managers().then((r) => setManagers(r.data.data.managers || [])).catch(() => {});
  // Always pull the freshest manager list when opening an editor, so a store
  // admin created moments ago (in User Management) shows up without a reload.
  const openEditor = (s) => { reloadManagers(); setEditor(s); };

  const columns = [
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: 'name', label: 'Store', render: (r) => <span className="font-medium">{r.icon ? `${r.icon} ` : ''}{r.name}</span> },
    { key: 'manager_name', label: 'Manager', render: (r) => (r.manager_name?.trim() || <span className="text-gray-400">— unassigned —</span>) },
    { key: 'capabilities', label: 'Capabilities', render: (r) => <span className="text-xs text-gray-500">{(r.capabilities || []).length} enabled</span> },
    { key: 'is_active', label: 'Status', render: (r) => <StatusBadge value={r.is_active ? 'approved' : 'closed'} /> },
    { key: 'actions', label: '', align: 'right', render: (r) => (
      <div className="flex justify-end gap-2">
        <Btn onClick={() => setDetail(r)}>View</Btn>
        <Btn variant="primary" onClick={() => openEditor(r)}>Manage</Btn>
      </div>
    ) },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Stores Administration">
        <Btn variant="primary" onClick={() => openEditor({ ...blank })}>New store</Btn>
      </PageHeader>
      <DataTable columns={columns} rows={stores || []} loading={loading} error={error} onRetry={refetch} empty="No stores" />

      {editor && (
        <StoreEditor
          store={editor} catalog={catalog} managers={managers}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); refetch(); reloadManagers(); }}
        />
      )}
      {detail && <StoreDetail store={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function StoreEditor({ store, catalog, managers, onClose, onSaved }) {
  const isNew = !store.id;
  const [form, setForm] = useState({
    code: store.code || '', name: store.name || '', description: store.description || '',
    icon: store.icon || '', is_active: store.is_active !== false,
    manager_id: store.manager_id ? String(store.manager_id) : '',
  });
  const [caps, setCaps] = useState(() => new Set(store.capabilities || []));
  const [busy, run] = useSubmitGuard();

  const toggle = (key) => setCaps((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        let id = store.id;
        if (isNew) {
          const r = await inventoryApi.stores.create({
            code: form.code, name: form.name, description: form.description, icon: form.icon || undefined,
          });
          id = r.data.data.store.id;
        } else {
          await inventoryApi.stores.update(id, {
            name: form.name, description: form.description, icon: form.icon || undefined, is_active: form.is_active,
          });
        }
        // Capabilities — send the full catalog with enabled flags (data-driven).
        await inventoryApi.stores.setCapabilities(id, catalog.map((c) => ({ capability_key: c.key, enabled: caps.has(c.key) })));
        // Manager (only when changed).
        const newMgr = form.manager_id ? Number(form.manager_id) : null;
        if (Number(store.manager_id || 0) !== Number(newMgr || 0)) {
          await inventoryApi.stores.assignManager(id, newMgr);
        }
        toast.success(isNew ? 'Store created' : 'Store updated');
        onSaved();
      } catch (err) {
        toast.error(err.response?.data?.message || 'Save failed');
      }
    });
  };

  return (
    <Modal title={isNew ? 'New store' : `Manage — ${store.name}`} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Store code" required value={form.code} disabled={!isNew}
            onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. main_store" />
          <TextInput label="Icon (emoji)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🥩" />
        </div>
        <TextInput label="Store name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextInput label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

        <div className="grid grid-cols-2 gap-3 items-end">
          <label className="block text-sm">
            <span className="block text-gray-600 mb-1">Store Manager</span>
            <select className="w-full border rounded-lg px-3 py-2" value={form.manager_id}
              onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
              <option value="">— unassigned —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{(m.full_name || m.username)} ({m.username})</option>
              ))}
            </select>
          </label>
          {!isNew && (
            <label className="flex items-center gap-2 text-sm pb-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active
            </label>
          )}
        </div>

        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">Capabilities</div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto border rounded-lg p-3">
            {catalog.map((c) => (
              <label key={c.key} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={caps.has(c.key)} onChange={() => toggle(c.key)} />
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-gray-400">{c.description}</span>
                </span>
              </label>
            ))}
            {catalog.length === 0 && <span className="text-gray-400 text-sm">Loading capabilities…</span>}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save store'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function StoreDetail({ store, onClose }) {
  const [tab, setTab] = useState('summary');
  const TABS = ['summary', 'transfers', 'requests', 'audit'];
  return (
    <Modal title={`${store.icon ? `${store.icon} ` : ''}${store.name}`} onClose={onClose} wide>
      <div className="flex gap-2 mb-4 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize ${tab === t ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'summary' && <StoreSummary store={store} />}
      {tab === 'transfers' && <StoreTransfers store={store} />}
      {tab === 'requests' && <StoreRequests store={store} />}
      {tab === 'audit' && <StoreAudit store={store} />}
    </Modal>
  );
}

function StoreSummary({ store }) {
  const { data, loading } = useApiResource(() => inventoryApi.stores.summary(store.id).then((r) => r.data.data.summary), [store.id]);
  if (loading || !data) return <div className="text-gray-400 py-6 text-center">Loading…</div>;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard label="Items on hand" value={data.item_count} />
        <StatCard label="Total quantity" value={fmtNum(data.total_quantity)} />
        <StatCard label="Stock value" value={fmtMoney(data.total_value)} />
        <StatCard label="Low-stock items" value={data.low_stock_count} accent={data.low_stock_count ? 'text-amber-600' : ''} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Transfers in" value={data.transfers_in} />
        <StatCard label="Transfers out" value={data.transfers_out} />
        <StatCard label="Open requests" value={data.open_requests} accent={data.open_requests ? 'text-amber-600' : ''} />
      </div>
      <div className="mt-4 text-xs text-gray-400">
        Enabled capabilities: {(store.capabilities || []).map((c) => c.replace(/_/g, ' ')).join(', ') || 'none'}
      </div>
    </>
  );
}

function StoreTransfers({ store }) {
  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.transfers.list().then((r) => (r.data.data.transfers || []).filter(
      (t) => Number(t.source_store_id) === Number(store.id) || Number(t.dest_store_id) === Number(store.id)
    )), [store.id]
  );
  return (
    <DataTable
      keyField="id"
      columns={[
        { key: 'transfer_number', label: 'Transfer', render: (r) => <span className="font-mono text-xs">{r.transfer_number}</span> },
        { key: 'dir', label: 'Direction', render: (r) => (Number(r.source_store_id) === Number(store.id) ? `→ ${r.dest_name}` : `← ${r.source_name}`) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
        { key: 'created_at', label: 'Created', render: (r) => fmtDate(r.created_at) },
      ]}
      rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No transfers"
    />
  );
}

function StoreRequests({ store }) {
  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.pr.list({ store_id: store.id }).then((r) => r.data.data.requisitions || []), [store.id]
  );
  return (
    <DataTable
      keyField="id"
      columns={[
        { key: 'pr_number', label: 'PR', render: (r) => <span className="font-mono text-xs">{r.pr_number}</span> },
        { key: 'estimated_total', label: 'Est. total', align: 'right', render: (r) => fmtMoney(r.estimated_total) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
        { key: 'created_at', label: 'Raised', render: (r) => fmtDate(r.created_at) },
      ]}
      rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No requests"
    />
  );
}

function StoreAudit({ store }) {
  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.auditLogs({ store_id: store.id, limit: 50 }).then((r) => r.data.data.audit_logs || []), [store.id]
  );
  return (
    <DataTable
      keyField="id"
      columns={[
        { key: 'created_at', label: 'When', render: (r) => fmtDate(r.created_at) },
        { key: 'action', label: 'Action', render: (r) => <span className="font-medium">{r.action}</span> },
        { key: 'entity', label: 'Entity', render: (r) => `${r.entity_type} #${r.entity_id ?? ''}` },
        { key: 'actor', label: 'By', render: (r) => (r.actor_name || r.actor_id) },
      ]}
      rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No audit entries"
    />
  );
}
