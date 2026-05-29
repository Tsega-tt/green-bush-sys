import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import inventoryApi from '../../services/inventoryApi';
import useInventoryEvents from '../../hooks/useInventoryEvents';

const PRIVILEGED = ['admin', 'owner', 'fnb_manager'];
const statusColor = {
  pending_fnb: 'bg-amber-100 text-amber-700', approved: 'bg-blue-100 text-blue-700',
  partially_approved: 'bg-blue-100 text-blue-700', sent: 'bg-purple-100 text-purple-700',
  received: 'bg-green-100 text-green-700', closed: 'bg-gray-100 text-gray-600',
  rejected: 'bg-red-100 text-red-700',
};

export default function Transfers() {
  const { user } = useAuth();
  const role = user?.role;
  const isFnb = PRIVILEGED.includes(role);
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [list, setList] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ source_store_id: '', dest_store_id: '', lines: [{ item_id: '', quantity: '' }] });

  useEffect(() => {
    inventoryApi.stores.list().then((r) => setStores(r.data.data.stores || [])).catch(() => {});
    inventoryApi.items.list({ limit: 500 }).then((r) => setItems(r.data.data.items || [])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    inventoryApi.transfers.list().then((r) => setList(r.data.data.transfers || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  useInventoryEvents(useCallback((type) => { if (type === 'transfer.changed') load(); }, [load]));

  const canSend = (t) => (isFnb || Number(user?.store_id) === Number(t.source_store_id)) && ['approved', 'partially_approved'].includes(t.status);
  const canReceive = (t) => (isFnb || Number(user?.store_id) === Number(t.dest_store_id)) && t.status === 'sent';

  const doAction = async (fn, okMsg) => {
    try { await fn(); toast.success(okMsg); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Action failed'); }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    try {
      await inventoryApi.transfers.create({
        source_store_id: Number(form.source_store_id), dest_store_id: Number(form.dest_store_id),
        lines: form.lines.filter((l) => l.item_id && l.quantity).map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity) })),
      });
      toast.success('Transfer created');
      setCreating(false);
      setForm({ source_store_id: '', dest_store_id: '', lines: [{ item_id: '', quantity: '' }] });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Create failed'); }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold mr-auto">Transfers</h1>
        <button onClick={() => setCreating(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">New transfer</button>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3">Number</th><th className="px-4 py-3">From → To</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No transfers</td></tr>}
            {list.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2 font-mono text-xs">{t.transfer_number}</td>
                <td className="px-4 py-2">{t.source_name} → {t.dest_name}</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-1 rounded-full ${statusColor[t.status] || 'bg-gray-100'}`}>{t.status}</span></td>
                <td className="px-4 py-2 text-right space-x-1">
                  {isFnb && t.status === 'pending_fnb' && (
                    <>
                      <button className="px-2 py-1 text-xs bg-green-600 text-white rounded" onClick={() => doAction(() => inventoryApi.transfers.approve(t.id, []), 'Approved')}>Approve</button>
                      <button className="px-2 py-1 text-xs bg-red-600 text-white rounded" onClick={() => { const reason = window.prompt('Reason?'); if (reason) doAction(() => inventoryApi.transfers.reject(t.id, reason), 'Rejected'); }}>Reject</button>
                    </>
                  )}
                  {canSend(t) && <button className="px-2 py-1 text-xs bg-purple-600 text-white rounded" onClick={() => doAction(() => inventoryApi.transfers.send(t.id), 'Sent')}>Send</button>}
                  {canReceive(t) && <button className="px-2 py-1 text-xs bg-green-700 text-white rounded" onClick={() => doAction(() => inventoryApi.transfers.receive(t.id, []), 'Received')}>Receive</button>}
                  {t.status === 'received' && <button className="px-2 py-1 text-xs bg-gray-200 rounded" onClick={() => doAction(() => inventoryApi.transfers.close(t.id), 'Closed')}>Close</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={submitCreate} className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3">
            <h2 className="font-bold">New transfer</h2>
            <div className="grid grid-cols-2 gap-2">
              <select required className="border rounded-lg px-3 py-2" value={form.source_store_id} onChange={(e) => setForm({ ...form, source_store_id: e.target.value })}>
                <option value="">Source store…</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select required className="border rounded-lg px-3 py-2" value={form.dest_store_id} onChange={(e) => setForm({ ...form, dest_store_id: e.target.value })}>
                <option value="">Destination store…</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {form.lines.map((l, idx) => (
              <div key={idx} className="flex gap-2">
                <select className="flex-1 border rounded-lg px-3 py-2" value={l.item_id}
                  onChange={(e) => { const lines = [...form.lines]; lines[idx].item_id = e.target.value; setForm({ ...form, lines }); }}>
                  <option value="">Item…</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.description}</option>)}
                </select>
                <input type="number" step="0.001" placeholder="Qty" className="w-28 border rounded-lg px-3 py-2" value={l.quantity}
                  onChange={(e) => { const lines = [...form.lines]; lines[idx].quantity = e.target.value; setForm({ ...form, lines }); }} />
              </div>
            ))}
            <button type="button" className="text-sm text-blue-600" onClick={() => setForm({ ...form, lines: [...form.lines, { item_id: '', quantity: '' }] })}>+ add line</button>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 bg-gray-100 rounded-lg" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded-lg">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
