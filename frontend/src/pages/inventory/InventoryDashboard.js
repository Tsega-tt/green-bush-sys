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
  const [alerts, setAlerts] = useState([]);
  const [low, setLow] = useState([]);

  const load = useCallback(() => {
    inventoryApi.reports.valuation().then((r) => setValuation(r.data.data.rows || [])).catch(() => {});
    inventoryApi.alerts.list({ status: 'open' }).then((r) => setAlerts(r.data.data.alerts || [])).catch(() => {});
    inventoryApi.reports.lowStock().then((r) => setLow(r.data.data.rows || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  useInventoryEvents(useCallback(() => load(), [load]));

  const totalValue = valuation.reduce((s, r) => s + Number(r.total_value || 0), 0);
  const critical = alerts.filter((a) => a.severity === 'critical').length;

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold mb-4">Inventory Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="Total inventory value" value={money(totalValue)} to="/dashboard/inventory-pg/balances" />
        <Card label="Open alerts" value={alerts.length} to="/dashboard/inventory-pg/alerts" accent={critical ? 'text-red-600' : ''} />
        <Card label="Critical alerts" value={critical} to="/dashboard/inventory-pg/alerts" accent={critical ? 'text-red-600' : ''} />
        <Card label="Low-stock items" value={low.length} to="/dashboard/inventory-pg/balances" accent={low.length ? 'text-amber-600' : ''} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-5">
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
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold mb-3">Recent alerts</h2>
          <div className="space-y-2">
            {alerts.slice(0, 6).map((a) => (
              <div key={a.id} className="text-sm flex gap-2">
                <span className={`px-2 rounded-full text-xs ${a.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{a.severity}</span>
                <span className="truncate">{a.message}</span>
              </div>
            ))}
            {alerts.length === 0 && <div className="text-gray-400 text-sm">No open alerts</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
