import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import inventoryApi from '../../services/inventoryApi';
import useInventoryEvents from '../../hooks/useInventoryEvents';

const statusColor = {
  pending_fnb: 'bg-amber-100 text-amber-700', pending_owner: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700', partially_approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700', closed: 'bg-gray-100 text-gray-600',
};

export default function Approvals() {
  const { user } = useAuth();
  const isOwner = ['owner', 'admin'].includes(user?.role);
  const [list, setList] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending_fnb');

  const load = useCallback(() => {
    inventoryApi.pr.list({ status: statusFilter || undefined })
      .then((r) => setList(r.data.data.requisitions || [])).catch(() => {});
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);
  useInventoryEvents(useCallback((type) => { if (type === 'pr.changed') load(); }, [load]));

  const act = async (fn, msg) => {
    try { await fn(); toast.success(msg); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold mr-auto">Purchase Approvals (F&amp;B)</h1>
        <select className="border rounded-lg px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="pending_fnb">Pending F&amp;B</option>
          <option value="pending_owner">Pending owner</option>
          <option value="">All</option>
        </select>
      </div>
      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3">PR</th><th className="px-4 py-3">Store</th>
              <th className="px-4 py-3 text-right">Est. total</th><th className="px-4 py-3">Band</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Nothing to review</td></tr>}
            {list.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 font-mono text-xs">{p.pr_number}</td>
                <td className="px-4 py-2">{p.store_name}</td>
                <td className="px-4 py-2 text-right">{Number(p.estimated_total).toLocaleString()}</td>
                <td className="px-4 py-2">{p.threshold_band || '-'}</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-1 rounded-full ${statusColor[p.status] || 'bg-gray-100'}`}>{p.status}</span></td>
                <td className="px-4 py-2 text-right space-x-1">
                  {p.status === 'pending_fnb' && (
                    <>
                      <button className="px-2 py-1 text-xs bg-green-600 text-white rounded" onClick={() => act(() => inventoryApi.pr.approve(p.id, []), 'Approved')}>Approve</button>
                      <button className="px-2 py-1 text-xs bg-red-600 text-white rounded" onClick={() => { const r = window.prompt('Reason?'); if (r) act(() => inventoryApi.pr.reject(p.id, r), 'Rejected'); }}>Reject</button>
                    </>
                  )}
                  {p.status === 'pending_owner' && isOwner && (
                    <button className="px-2 py-1 text-xs bg-green-700 text-white rounded" onClick={() => act(() => inventoryApi.pr.ownerApprove(p.id), 'Owner approved')}>Owner approve</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
