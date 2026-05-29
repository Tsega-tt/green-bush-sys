import React, { useState } from 'react';
import inventoryApi from '../../services/inventoryApi';
import { PageHeader, DataTable, Select, Btn, fmtDate, useApiResource } from '../../components/inventory/kit';

const ENTITIES = ['', 'transfer', 'purchase_requisition', 'purchase_order', 'goods_receipt', 'stock_count', 'daily_closing', 'keg', 'inventory_item', 'adjustment'];

export default function AuditLog() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.auditLogs({ entity_type: entityType || undefined, action: action || undefined, limit, offset: page * limit })
      .then((r) => r.data.data.audit_logs || []),
    [entityType, action, page]
  );

  const columns = [
    { key: 'created_at', label: 'When', render: (r) => fmtDate(r.created_at) },
    { key: 'actor', label: 'Actor', render: (r) => <span>{r.actor_name || r.actor_id} <span className="text-xs text-gray-400">{r.actor_role}</span></span> },
    { key: 'action', label: 'Action', render: (r) => <span className="font-medium">{r.action}</span> },
    { key: 'entity', label: 'Entity', render: (r) => <span>{r.entity_type} <span className="text-gray-400">#{r.entity_id}</span></span> },
    { key: 'store_id', label: 'Store', render: (r) => (r.store_name || r.store_id || '-') },
    { key: 'detail', label: 'Detail', render: (r) => {
      const v = r.new_value || r.details;
      const txt = v ? (typeof v === 'string' ? v : JSON.stringify(v)) : '';
      return <span className="text-xs text-gray-500 truncate inline-block max-w-xs" title={txt}>{txt}</span>;
    } },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Audit Log">
        <Select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(0); }} className="!w-52">
          {ENTITIES.map((e) => <option key={e} value={e}>{e ? e.replace(/_/g, ' ') : 'All entities'}</option>)}
        </Select>
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Action (e.g. approve)" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} />
        <Btn onClick={refetch}>Refresh</Btn>
      </PageHeader>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No audit entries" />
      <div className="flex justify-between items-center mt-3 text-sm">
        <Btn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>← Newer</Btn>
        <span className="text-gray-500">Page {page + 1}</span>
        <Btn onClick={() => setPage((p) => p + 1)} disabled={(data || []).length < limit}>Older →</Btn>
      </div>
    </div>
  );
}
