import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import {
  FiLogOut, FiRefreshCw, FiFileText, FiClock,
  FiCheckCircle, FiXCircle, FiTrendingUp
} from 'react-icons/fi';

const PR_ZONES = [
  { id: 'dry_storage',  name: 'Dry Storage',  icon: '📦', accent: '#f59e0b' },
  { id: 'cold_storage', name: 'Cold Storage',  icon: '❄️', accent: '#60a5fa' },
  { id: 'freezer',      name: 'Freezer',       icon: '🧊', accent: '#818cf8' },
  { id: 'beverages',    name: 'Beverages',     icon: '🍹', accent: '#34d399' },
];

const STATUS_META = {
  pending_fnb:       { label: 'Pending F&B',      color: 'bg-yellow-900 text-yellow-300 border border-yellow-700' },
  approved:          { label: 'Approved',          color: 'bg-green-900 text-green-300 border border-green-700' },
  adjusted_approved: { label: 'Adj. Approved',     color: 'bg-blue-900 text-blue-300 border border-blue-700' },
  rejected:          { label: 'Rejected',          color: 'bg-red-900 text-red-300 border border-red-700' },
};

function fmt(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function OwnerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary]           = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [lastRefresh, setLastRefresh]   = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.purchaseRequisitions.getSummary();
      const s   = res?.data?.data?.summary     ?? res?.data?.summary     ?? [];
      const r   = res?.data?.data?.requisitions ?? res?.data?.requisitions ?? [];
      setSummary(Array.isArray(s) ? s : []);
      setRequisitions(Array.isArray(r) ? r : []);
      setLastRefresh(new Date());
    } catch { toast.error('Failed to load overview'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 20000);
    return () => clearInterval(pollRef.current);
  }, [fetchData]);

  const handleLogout = async () => { try { await logout(); navigate('/login'); } catch { navigate('/login'); } };

  const totalApproved = requisitions.filter(r => ['approved','adjusted_approved'].includes(r.status)).length;
  const totalPending  = requisitions.filter(r => r.status === 'pending_fnb').length;
  const totalRejected = requisitions.filter(r => r.status === 'rejected').length;
  const grandTotal    = summary.reduce((s, z) => s + (z.totalCost || 0), 0);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/assets/logo.png" alt="Logo" className="w-10 h-10 object-contain" onError={e => { e.target.style.display = 'none'; }} />
          <div>
            <h1 className="text-lg font-bold text-amber-400">Owner Overview</h1>
            <p className="text-xs text-gray-500">Welcome, {user?.full_name || user?.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-gray-600 hidden sm:block">
              Last: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchData} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700">
            <FiRefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => navigate('/dashboard/purchase-requisitions')} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-600 text-gray-950 font-semibold rounded-lg hover:bg-amber-500">
            <FiFileText className="w-3.5 h-3.5" /> All PRs
          </button>
          <button onClick={handleLogout} className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-400 hover:bg-gray-800 rounded-lg">
            <FiLogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6">

        {loading ? (
          <div className="flex items-center justify-center h-60 text-gray-500">
            <FiRefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading overview…
          </div>
        ) : (
          <>
            {/* Top KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total PRs',         value: requisitions.length, icon: FiFileText,    color: 'border-gray-700 bg-gray-800' },
                { label: 'Pending Review',    value: totalPending,        icon: FiClock,       color: 'border-yellow-700 bg-yellow-950' },
                { label: 'Approved',          value: totalApproved,       icon: FiCheckCircle, color: 'border-green-700 bg-green-950' },
                { label: 'Rejected',          value: totalRejected,       icon: FiXCircle,     color: 'border-red-700 bg-red-950' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className={`rounded-xl p-4 border ${color} flex items-center gap-3`}>
                  <Icon className="w-8 h-8 opacity-50" />
                  <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Grand total */}
            <div className="bg-amber-950 border border-amber-800 rounded-xl px-6 py-4 flex items-center gap-4">
              <FiTrendingUp className="w-8 h-8 text-amber-400" />
              <div>
                <p className="text-xs text-amber-600 uppercase tracking-wider font-semibold">Total Approved Spend</p>
                <p className="text-3xl font-bold text-amber-300">ETB {fmt(grandTotal)}</p>
              </div>
            </div>

            {/* Per-Zone Breakdown */}
            <div>
              <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">Per-Zone Spend Summary</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {PR_ZONES.map(zone => {
                  const z = summary.find(s => s.id === zone.id) || { total: 0, approved: 0, pending: 0, totalCost: 0 };
                  return (
                    <div key={zone.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{zone.icon}</span>
                        <p className="font-semibold text-gray-100">{zone.name}</p>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Total PRs</span><span className="font-semibold">{z.total}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Approved</span><span className="text-green-400 font-semibold">{z.approved}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Pending</span><span className="text-yellow-400 font-semibold">{z.pending}</span></div>
                      </div>
                      <div className="pt-2 border-t border-gray-800">
                        <p className="text-xs text-gray-500 mb-0.5">Approved Spend</p>
                        <p className="font-bold text-amber-300">ETB {fmt(z.totalCost)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Full Audit Table */}
            <div>
              <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">All Requisitions — Audit Table</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800 text-xs text-gray-400 uppercase tracking-wider">
                        {['PR #', 'Zone', 'Item', 'Supplier', 'Qty', 'Unit Cost', 'Est. Cost', 'Approved Qty', 'Status', 'Created By', 'Date'].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {requisitions.length === 0 ? (
                        <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-600">No requisitions yet</td></tr>
                      ) : requisitions.map(pr => (
                        <tr key={pr.id} className="hover:bg-gray-800 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-amber-500">{pr.req_number}</td>
                          <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{PR_ZONES.find(z=>z.id===pr.zone_id)?.icon} {pr.zone_name}</td>
                          <td className="px-4 py-3 font-medium text-gray-100 max-w-32 truncate">{pr.item_name}</td>
                          <td className="px-4 py-3 text-gray-400 max-w-24 truncate">{pr.supplier || '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-300">{pr.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-300">{fmt(pr.unit_cost)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-amber-400">{fmt(pr.estimated_cost)}</td>
                          <td className="px-4 py-3 text-right text-green-400">{pr.approved_quantity != null ? pr.approved_quantity : '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${(STATUS_META[pr.status]||{}).color || 'bg-gray-800 text-gray-300'}`}>
                              {(STATUS_META[pr.status]||{}).label || pr.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{pr.created_by_name}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{new Date(pr.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
