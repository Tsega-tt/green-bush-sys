import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import inventoryApi from '../../services/inventoryApi';
import useInventoryEvents from '../../hooks/useInventoryEvents';
import { can } from '../../utils/invPermissions';
import StorePicker from './StorePicker';

const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InventoryBalances() {
  const { user } = useAuth();
  const canAdjust = can(user?.role, 'adjust');
  const pinned = user?.store_id || null;
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(pinned || null);
  const [rows, setRows] = useState([]);
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adjust, setAdjust] = useState(null); // { item_id, description, quantity }

  useEffect(() => {
    inventoryApi.stores.list().then((r) => setStores(r.data.data.stores || [])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!storeId) { setRows([]); return; }
    setLoading(true);
    inventoryApi.balances({ store_id: storeId, low_only: lowOnly })
      .then((r) => setRows(r.data.data.balances || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [storeId, lowOnly]);

  useEffect(() => { load(); }, [load]);
  useInventoryEvents(useCallback((type, data) => {
    if (type === 'inventory.changed' && (!data.store_id || Number(data.store_id) === Number(storeId))) load();
  }, [storeId, load]));

  const submitAdjust = async (e) => {
    e.preventDefault();
    try {
      await inventoryApi.adjust({
        store_id: storeId, item_id: adjust.item_id,
        new_quantity: adjust.mode === 'set' ? Number(adjust.value) : undefined,
        delta: adjust.mode === 'delta' ? Number(adjust.value) : undefined,
        reason: adjust.reason,
      });
      toast.success('Adjustment posted');
      setAdjust(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Adjustment failed');
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-bold mr-auto">Inventory Balances</h1>
        <StorePicker stores={stores} value={storeId} onChange={setStoreId} pinnedStoreId={pinned} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
        </label>
        <button onClick={load} className="px-3 py-2 bg-gray-100 rounded-lg text-sm">Refresh</button>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3 text-right">Min</th>
              <th className="px-4 py-3 text-right">WAC</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-4 py-6 text-center text-gray-400" colSpan={6}>Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td className="px-4 py-6 text-center text-gray-400" colSpan={6}>No items</td></tr>}
            {rows.map((r) => {
              const low = Number(r.quantity) <= Number(r.min_quantity);
              return (
                <tr key={r.item_id} className={low ? 'bg-amber-50' : ''}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.description}</div>
                    <div className="text-xs text-gray-400">{r.item_code}</div>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">{Number(r.quantity)} {r.uom}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{Number(r.min_quantity)}</td>
                  <td className="px-4 py-2 text-right">{money(r.weighted_avg_cost)}</td>
                  <td className="px-4 py-2 text-right">{money(r.value)}</td>
                  <td className="px-4 py-2 text-right">
                    {canAdjust && (
                      <button
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                        onClick={() => setAdjust({ item_id: r.item_id, description: r.description, mode: 'set', value: r.quantity, reason: '' })}
                      >Adjust</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adjust && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={submitAdjust} className="bg-white rounded-xl p-5 w-full max-w-md space-y-3">
            <h2 className="font-bold">Adjust — {adjust.description}</h2>
            <div className="flex gap-2 text-sm">
              <button type="button" onClick={() => setAdjust({ ...adjust, mode: 'set' })}
                className={`px-3 py-1 rounded ${adjust.mode === 'set' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Set to</button>
              <button type="button" onClick={() => setAdjust({ ...adjust, mode: 'delta' })}
                className={`px-3 py-1 rounded ${adjust.mode === 'delta' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Delta</button>
            </div>
            <input type="number" step="0.001" required className="w-full border rounded-lg px-3 py-2"
              value={adjust.value} onChange={(e) => setAdjust({ ...adjust, value: e.target.value })}
              placeholder={adjust.mode === 'set' ? 'New quantity' : 'Change (+/-)'} />
            <input required className="w-full border rounded-lg px-3 py-2" placeholder="Reason (required)"
              value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 bg-gray-100 rounded-lg" onClick={() => setAdjust(null)}>Cancel</button>
              <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded-lg">Post adjustment</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
