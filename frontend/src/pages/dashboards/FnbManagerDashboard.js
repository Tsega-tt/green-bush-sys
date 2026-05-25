import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { FiArchive, FiCheckSquare, FiClock, FiCheck, FiCheckCircle, FiXCircle, FiArrowRight, FiAlertCircle } from 'react-icons/fi';

const STORES = [
  { id: 'dry_goods', name: 'Dry/Goods',  icon: '📦' },
  { id: 'bar',       name: 'Bar',         icon: '🍷' },
  { id: 'pastry',    name: 'Pastry/Cake', icon: '🎂' },
  { id: 'kitchen',   name: 'Kitchen',     icon: '🍳' },
  { id: 'barman',    name: 'Barman',      icon: '🍸' },
];

export default function FnbManagerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allRequests,  setAllRequests]  = useState([]);
  const [storeSummary, setStoreSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [reqRes, ...itemResults] = await Promise.all([
          api.itemRequests.getAll({}),
          ...STORES.map(s => api.stores.getItems(s.id)),
        ]);
        const reqs = reqRes?.data?.data?.requests ?? reqRes?.data?.requests ?? [];
        setAllRequests(reqs);
        const summary = STORES.map((s, i) => {
          const items = itemResults[i]?.data?.data?.items ?? itemResults[i]?.data?.items ?? [];
          const low   = items.filter(it => it.quantity <= it.min_quantity && it.min_quantity > 0).length;
          return { ...s, total: items.length, low };
        });
        setStoreSummary(summary);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const awaitingFinal  = allRequests.filter(r => r.status === 'store_approved');
  const totalApproved  = allRequests.filter(r => r.status === 'fully_approved').length;
  const totalRejected  = allRequests.filter(r => r.status === 'rejected').length;
  const totalPending   = allRequests.filter(r => r.status === 'pending').length;
  const totalItems     = storeSummary.reduce((s, x) => s + x.total, 0);
  const totalLow       = storeSummary.reduce((s, x) => s + x.low, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">Welcome, {user?.full_name || user?.name}!</h1>
        <p className="mt-1 text-amber-100">F&B Manager Dashboard — Cross-store oversight and final approval authority</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Awaiting Final Approval', value: awaitingFinal.length, icon: FiCheckSquare, color: 'text-amber-600',  bg: 'bg-amber-50' },
          { label: 'Fully Approved',          value: totalApproved,        icon: FiCheckCircle, color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Pending (Step 1)',         value: totalPending,         icon: FiClock,       color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Total Inventory Items',   value: totalItems,           icon: FiArchive,     color: 'text-blue-600',   bg: 'bg-blue-50' },
        ].map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`${c.bg} rounded-xl p-5`}>
              <div className="flex items-center gap-3">
                <Icon className={`w-7 h-7 ${c.color}`} />
                <div>
                  <p className="text-2xl font-bold text-gray-900">{loading ? '…' : c.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Awaiting Final Approval */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Awaiting Your Final Approval</h2>
          <button onClick={() => navigate('/dashboard/item-requests')} className="text-sm text-amber-600 flex items-center gap-1 hover:underline">
            View All <FiArrowRight className="w-4 h-4" />
          </button>
        </div>
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : awaitingFinal.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-400">
            <FiCheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p>No requests awaiting final approval</p>
          </div>
        ) : (
          <div className="space-y-2">
            {awaitingFinal.slice(0, 5).map(r => (
              <div key={r.id} className="bg-white border-2 border-amber-200 rounded-xl px-5 py-3 flex items-center justify-between hover:shadow-sm">
                <div>
                  <span className="font-mono text-xs text-gray-400">{r.request_number}</span>
                  <span className="ml-3 font-semibold text-gray-800">{r.store_name}</span>
                  <span className="ml-3 text-sm text-gray-500">by {r.requester_name}</span>
                  {r.store_admin_name && (
                    <span className="ml-3 text-xs text-blue-600">✓ {r.store_admin_name}</span>
                  )}
                </div>
                <button onClick={() => navigate('/dashboard/item-requests')}
                  className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700">
                  Final Approve
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cross-store Overview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">All Stores Overview</h2>
          <button onClick={() => navigate('/dashboard/store-inventory')} className="text-sm text-blue-600 flex items-center gap-1 hover:underline">
            Open Inventory <FiArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {storeSummary.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:shadow-md"
              onClick={() => navigate('/dashboard/store-inventory')}>
              <span className="text-2xl">{s.icon}</span>
              <p className="font-semibold text-gray-800 text-sm mt-2">{s.name}</p>
              <p className="text-gray-500 text-xs mt-1">{loading ? '…' : s.total} items</p>
              {!loading && s.low > 0 && (
                <p className="text-xs text-red-600 font-medium mt-1">
                  <FiAlertCircle className="inline w-3 h-3 mr-0.5" />{s.low} low
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Request Summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-bold text-gray-800 mb-4">Request Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Requests', value: allRequests.length, color: 'text-gray-800', bg: 'bg-gray-100' },
            { label: 'Pending',        value: totalPending,       color: 'text-yellow-700', bg: 'bg-yellow-50' },
            { label: 'Fully Approved', value: totalApproved,      color: 'text-green-700',  bg: 'bg-green-50' },
            { label: 'Rejected',       value: totalRejected,      color: 'text-red-700',    bg: 'bg-red-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-lg p-3 text-center`}>
              <p className={`text-xl font-bold ${s.color}`}>{loading ? '…' : s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => navigate('/dashboard/store-inventory')}
          className="flex items-center gap-3 p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
          <FiArchive className="w-6 h-6" />
          <div className="text-left">
            <p className="font-semibold">Store Inventory</p>
            <p className="text-blue-200 text-xs">Overview all 5 stores</p>
          </div>
        </button>
        <button onClick={() => navigate('/dashboard/item-requests')}
          className="flex items-center gap-3 p-4 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors">
          <FiCheckSquare className="w-6 h-6" />
          <div className="text-left">
            <p className="font-semibold">Approve Requests</p>
            <p className="text-amber-200 text-xs">Final approval sign-off</p>
          </div>
        </button>
      </div>
    </div>
  );
}
