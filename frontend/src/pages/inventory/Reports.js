import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import useMasterData from '../../hooks/useMasterData';
import { PageHeader, DataTable, Select, Btn, StatCard, fmtMoney, fmtNum, fmtDate, fmtDay, useApiResource } from '../../components/inventory/kit';

/* Each report just returns { rows }. We render a self-describing table so new
 * report columns appear automatically without per-report wiring. */
const TABS = [
  { key: 'valuation', label: 'Valuation', fn: (p) => inventoryApi.reports.valuation(p), needs: ['store'] },
  { key: 'valuation-trend', label: 'Valuation trend', fn: (p) => inventoryApi.reports.valuationTrend(p), needs: ['store', 'days'] },
  { key: 'current-stock', label: 'Current stock', fn: (p) => inventoryApi.reports.currentStock(p), needs: ['store'] },
  { key: 'low-stock', label: 'Low stock', fn: (p) => inventoryApi.reports.lowStock(p), needs: ['store'] },
  { key: 'out-of-stock', label: 'Out of stock', fn: (p) => inventoryApi.reports.outOfStock(p), needs: ['store'] },
  { key: 'consumption', label: 'Consumption', fn: (p) => inventoryApi.reports.consumption(p), needs: ['store', 'dates'] },
  { key: 'waste', label: 'Waste', fn: (p) => inventoryApi.reports.waste(p), needs: ['store', 'dates'] },
  { key: 'transfers', label: 'Transfers', fn: (p) => inventoryApi.reports.transfers(p), needs: ['store', 'dates'] },
  { key: 'purchases', label: 'Purchases', fn: (p) => inventoryApi.reports.purchases(p), needs: ['store', 'dates'] },
  { key: 'supplier-performance', label: 'Supplier performance', fn: () => inventoryApi.reports.supplierPerformance(), needs: [] },
  { key: 'variance', label: 'Variance', fn: (p) => inventoryApi.reports.variance(p), needs: ['store', 'dates'] },
  { key: 'expiry', label: 'Expiry', fn: (p) => inventoryApi.reports.expiry(p), needs: ['store', 'withinDays'] },
  { key: 'kegs', label: 'Kegs', fn: (p) => inventoryApi.reports.kegs(p), needs: ['store'] },
  { key: 'daily-closings', label: 'Daily closings', fn: (p) => inventoryApi.reports.dailyClosings(p), needs: ['store'] },
];

const humanize = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const isMoney = (k) => /value|cost|total|amount|price/i.test(k);
const isDate = (k) => /(date|_at)$/i.test(k) || k === 'snapshot_date' || k === 'business_date';
const isNum = (v) => typeof v === 'number' || (v !== '' && v != null && !Number.isNaN(Number(v)));

function autoColumns(rows) {
  if (!rows || rows.length === 0) return [];
  // Self-describing: show every column except raw id / *_id keys (names are joined in).
  const visible = Object.keys(rows[0]).filter((k) => k !== 'id' && !k.endsWith('_id'));
  const use = visible.length ? visible : Object.keys(rows[0]);
  return use.map((k) => ({
    key: k,
    label: humanize(k),
    align: (isMoney(k) || (!isDate(k) && isNum(rows[0][k]))) ? 'right' : undefined,
    render: (r) => {
      const v = r[k];
      if (v == null || v === '') return '-';
      if (isDate(k)) return /(_at)$/.test(k) ? fmtDate(v) : fmtDay(v);
      if (isMoney(k)) return fmtMoney(v);
      if (isNum(v)) return fmtNum(v);
      return String(v);
    },
  }));
}

const today = () => new Date().toISOString().slice(0, 10);
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

export default function Reports() {
  const { stores, items } = useMasterData({ stores: true, items: true });
  const [tabKey, setTabKey] = useState('valuation');
  const [storeId, setStoreId] = useState('');
  const [from, setFrom] = useState(ago(30));
  const [to, setTo] = useState(today());
  const [days, setDays] = useState(30);
  const [withinDays, setWithinDays] = useState(30);
  const [priceItem, setPriceItem] = useState('');

  const tab = TABS.find((t) => t.key === tabKey);
  const needs = (n) => tab.needs.includes(n);

  const { data: rows, loading, error, refetch } = useApiResource(() => {
    const p = {};
    if (needs('store') && storeId) p.store_id = storeId;
    if (needs('dates')) { p.from = from; p.to = to; }
    if (needs('days')) p.days = days;
    if (needs('withinDays')) p.within_days = withinDays;
    return tab.fn(p).then((r) => r.data.data.rows || []);
  }, [tabKey, storeId, from, to, days, withinDays]);

  const priceHistory = useApiResource(
    () => (priceItem ? inventoryApi.reports.priceHistory({ item_id: priceItem }).then((r) => r.data.data.rows || []) : Promise.resolve([])),
    [priceItem]
  );

  const columns = useMemo(() => autoColumns(rows), [rows]);
  const totalValue = useMemo(
    () => (rows || []).reduce((s, r) => s + Number(r.total_value || r.inventory_value || r.value || 0), 0),
    [rows]
  );

  const exportCsv = () => {
    const data = rows || [];
    if (!data.length) { toast.error('Nothing to export'); return; }
    const keys = columns.map((c) => c.key);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [keys.map(humanize).join(','), ...data.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${tabKey}-${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Inventory Reports">
        <Btn onClick={exportCsv}>Export CSV</Btn>
      </PageHeader>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTabKey(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tabKey === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
        <button onClick={() => setTabKey('price-history')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tabKey === 'price-history' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
          Price history
        </button>
      </div>

      {tabKey === 'price-history' ? (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={priceItem} onChange={(e) => setPriceItem(e.target.value)} className="!w-72">
              <option value="">Select item…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.description}</option>)}
            </Select>
          </div>
          <DataTable columns={autoColumns(priceHistory.data)} rows={priceHistory.data || []} loading={priceHistory.loading} error={priceHistory.error} onRetry={priceHistory.refetch} empty="Pick an item to see price history" />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            {needs('store') && (
              <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="!w-44">
                <option value="">All stores</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
            {needs('dates') && <>
              <label className="text-sm">From<input type="date" className="block border rounded-lg px-3 py-2 mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="text-sm">To<input type="date" className="block border rounded-lg px-3 py-2 mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </>}
            {needs('days') && (
              <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="!w-40">
                {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
              </Select>
            )}
            {needs('withinDays') && (
              <Select value={withinDays} onChange={(e) => setWithinDays(Number(e.target.value))} className="!w-44">
                {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Within {d} days</option>)}
              </Select>
            )}
            <Btn onClick={refetch}>Refresh</Btn>
          </div>

          {['valuation', 'current-stock'].includes(tabKey) && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <StatCard label="Rows" value={(rows || []).length} />
              <StatCard label="Total value" value={fmtMoney(totalValue)} />
            </div>
          )}

          <DataTable columns={columns} rows={rows || []} loading={loading} error={error} onRetry={refetch} keyField="__none" empty="No data for this report" />
        </>
      )}
    </div>
  );
}
