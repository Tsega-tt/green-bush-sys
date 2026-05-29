import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import inventoryApi from '../../services/inventoryApi';
import useInventoryEvents from '../../hooks/useInventoryEvents';

const money = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

function Card({ label, value, to, accent }) {
  const body = (
    <div className={`bg-white rounded-xl shadow p-5 ${to ? 'hover:shadow-md transition' : ''}`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent || ''}`}>{value}</div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function InventoryDashboard() {
  const [valuation, setValuation] = useState([]);

  const load = useCallback(() => {
    inventoryApi.reports.valuation().then((r) => setValuation(r.data.data.rows || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  useInventoryEvents(useCallback(() => load(), [load]));

  const totalValue = valuation.reduce((s, r) => s + Number(r.total_value || 0), 0);

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold mb-4">Inventory Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="Total inventory value" value={money(totalValue)} />
        <Card label="Stores" value={valuation.length} to="/dashboard/inventory-pg/stores" />
        <Card label="Transfers" value="Manage" to="/dashboard/inventory-pg/transfers" />
        <Card label="Purchase requests" value="Open" to="/dashboard/inventory-pg/purchase-requests" />
      </div>

      <div className="bg-white rounded-xl shadow p-5 max-w-2xl">
        <h2 className="font-semibold mb-3">Value by store</h2>
        <table className="w-full text-sm">
          <tbody>
            {valuation.map((r) => (
              <tr key={r.store_id} className="border-b last:border-0">
                <td className="py-2">{r.store_name}</td>
                <td className="py-2 text-right font-medium">{money(r.total_value)}</td>
              </tr>
            ))}
            {valuation.length === 0 && <tr><td className="py-3 text-gray-400">No data</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
