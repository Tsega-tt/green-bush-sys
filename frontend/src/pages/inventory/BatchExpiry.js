import React, { useState } from 'react';
import inventoryApi from '../../services/inventoryApi';
import useMasterData from '../../hooks/useMasterData';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, DataTable, Select, StatusBadge, fmtNum, fmtMoney, fmtDay, useApiResource } from '../../components/inventory/kit';

const WINDOWS = [{ v: 7, l: 'Next 7 days' }, { v: 14, l: 'Next 14 days' }, { v: 30, l: 'Next 30 days' }, { v: 90, l: 'Next 90 days' }, { v: 3650, l: 'All batches' }];

export default function BatchExpiry() {
  const { user } = useAuth();
  const { stores } = useMasterData();
  const pinned = user?.store_id || null;
  const [storeId, setStoreId] = useState(pinned || '');
  const [days, setDays] = useState(30);

  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.batches({ store_id: storeId || undefined, expiring_in_days: days }).then((r) => r.data.data.batches || []),
    [storeId, days]
  );

  const qty = (r) => r.quantity_remaining ?? r.remaining_quantity ?? r.quantity;
  const expiryBadge = (d) => {
    if (d == null) return null;
    const n = Number(d);
    if (n < 0) return <StatusBadge value="critical" />;
    if (n <= 7) return <StatusBadge value="warning" />;
    return <span className="text-gray-500">{n}d</span>;
  };

  const columns = [
    { key: 'expiry_date', label: 'Expiry', render: (r) => <span className="font-medium">{fmtDay(r.expiry_date)}</span> },
    { key: 'days_to_expiry', label: 'In', render: (r) => expiryBadge(r.days_to_expiry) },
    { key: 'description', label: 'Item', render: (r) => <span className="font-medium">{r.description}</span> },
    { key: 'store_name', label: 'Store' },
    { key: 'batch_number', label: 'Batch', render: (r) => <span className="font-mono text-xs">{r.batch_number || '-'}</span> },
    { key: 'qty', label: 'Remaining', align: 'right', render: (r) => fmtNum(qty(r)) },
    { key: 'unit_cost', label: 'Unit cost', align: 'right', render: (r) => fmtMoney(r.unit_cost) },
    { key: 'value', label: 'Value', align: 'right', render: (r) => fmtMoney((Number(qty(r)) || 0) * (Number(r.unit_cost) || 0)) },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Batches & Expiry">
        <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="!w-44" disabled={!!pinned}>
          <option value="">All stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="!w-44">
          {WINDOWS.map((w) => <option key={w.v} value={w.v}>{w.l}</option>)}
        </Select>
      </PageHeader>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} keyField="id" empty="No batches in this window" />
    </div>
  );
}
