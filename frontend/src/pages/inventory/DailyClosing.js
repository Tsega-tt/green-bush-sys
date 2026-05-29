import React, { useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import useMasterData from '../../hooks/useMasterData';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/invPermissions';
import { PageHeader, Btn, DataTable, Select, StatusBadge, fmtMoney, fmtDay, useApiResource, useSubmitGuard } from '../../components/inventory/kit';

const today = () => new Date().toISOString().slice(0, 10);

export default function DailyClosing() {
  const { user } = useAuth();
  const canOps = can(user?.role, 'operations');
  const { stores } = useMasterData();
  const pinned = user?.store_id || null;
  const [storeId, setStoreId] = useState(pinned || '');
  const [date, setDate] = useState(today());
  const [current, setCurrent] = useState(null);
  const [physical, setPhysical] = useState('');
  const [busy, run] = useSubmitGuard();

  const { data: history, refetch } = useApiResource(
    () => (storeId ? inventoryApi.closing.list({ store_id: storeId }).then((r) => r.data.data.closings || r.data.data.rows || []) : Promise.resolve([])),
    [storeId]
  );

  const generate = () => run(async () => {
    if (!storeId) { toast.error('Pick a store'); return; }
    try {
      const r = await inventoryApi.closing.generate({ store_id: Number(storeId), business_date: date });
      setCurrent(r.data.data.closing);
      setPhysical('');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  });

  const confirm = () => run(async () => {
    if (!window.confirm('Confirm and lock this closing? It cannot be changed afterwards.')) return;
    try {
      const r = await inventoryApi.closing.confirm({ store_id: Number(storeId), business_date: date, physical_value: physical === '' ? undefined : Number(physical) });
      setCurrent(r.data.data.closing);
      toast.success('Closing confirmed');
      refetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  });

  const rowsFor = (c) => [
    ['Opening value', c.opening_value], ['Purchases', c.purchases_value], ['Transfers in', c.transfers_in_value],
    ['Transfers out', c.transfers_out_value], ['Consumption', c.consumption_value], ['Waste', c.waste_value],
    ['Adjustments', c.adjustment_value], ['Expected closing', c.expected_value],
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Daily Closing">
        <Select value={storeId} onChange={(e) => { setStoreId(e.target.value); setCurrent(null); }} className="!w-48" disabled={!!pinned}>
          <option value="">Select store…</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={date} onChange={(e) => { setDate(e.target.value); setCurrent(null); }} />
        {canOps && <Btn variant="primary" onClick={generate} disabled={busy}>Generate</Btn>}
      </PageHeader>

      {current && (
        <div className="bg-white rounded-xl shadow p-5 mb-6 max-w-xl">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="font-bold">{current.store_name} · {fmtDay(current.business_date)}</h2>
            <StatusBadge value={current.status} />
          </div>
          <table className="w-full text-sm">
            <tbody>
              {rowsFor(current).map(([label, v]) => (
                <tr key={label} className="border-b last:border-0">
                  <td className="py-2 text-gray-600">{label}</td>
                  <td className="py-2 text-right font-medium">{fmtMoney(v)}</td>
                </tr>
              ))}
              {current.physical_value != null && (
                <tr className="border-b"><td className="py-2 text-gray-600">Physical value</td><td className="py-2 text-right font-medium">{fmtMoney(current.physical_value)}</td></tr>
              )}
              {current.variance_value != null && (
                <tr><td className="py-2 text-gray-600">Variance</td>
                  <td className={`py-2 text-right font-bold ${Number(current.variance_value) === 0 ? 'text-gray-500' : 'text-red-600'}`}>{fmtMoney(current.variance_value)}</td></tr>
              )}
            </tbody>
          </table>
          {current.status === 'open' && canOps && (
            <div className="flex items-end gap-2 mt-4">
              <label className="text-sm flex-1">Physical count value (optional)
                <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 mt-1" value={physical} onChange={(e) => setPhysical(e.target.value)} placeholder="Leave blank to use expected" />
              </label>
              <Btn variant="success" onClick={confirm} disabled={busy}>Confirm &amp; lock</Btn>
            </div>
          )}
        </div>
      )}

      <h2 className="font-semibold mb-2">Recent closings</h2>
      <DataTable
        columns={[
          { key: 'business_date', label: 'Date', render: (r) => fmtDay(r.business_date) },
          { key: 'store_name', label: 'Store' },
          { key: 'expected_value', label: 'Expected', align: 'right', render: (r) => fmtMoney(r.expected_value) },
          { key: 'physical_value', label: 'Physical', align: 'right', render: (r) => (r.physical_value != null ? fmtMoney(r.physical_value) : '-') },
          { key: 'variance_value', label: 'Variance', align: 'right', render: (r) => (r.variance_value != null ? fmtMoney(r.variance_value) : '-') },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
        ]}
        rows={history || []} loading={false} keyField="id" empty="No closings yet"
      />
    </div>
  );
}
