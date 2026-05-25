import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { FiPackage, FiSend, FiClock, FiAlertCircle, FiCheckCircle, FiArrowRight } from 'react-icons/fi';

const STORES = [
  { id: 'dry_goods', name: 'Dry/Goods',  icon: '📦' },
  { id: 'bar',       name: 'Bar',         icon: '🍷' },
  { id: 'pastry',    name: 'Pastry/Cake', icon: '🎂' },
  { id: 'kitchen',   name: 'Kitchen',     icon: '🍳' },
  { id: 'barman',    name: 'Barman',      icon: '🍸' },
];

export default function StoreAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [storeSummary, setStoreSummary] = useState([]);
  const [pendingReqs,  setPendingReqs]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [reqRes, ...itemResults] = await Promise.all([
          api.itemRequests.getAll({ status: 'pending' }),
          ...STORES.map(s => api.stores.getItems(s.id)),
        ]);
        const reqs = reqRes?.data?.data?.requests ?? reqRes?.data?.requests ?? [];
        setPendingReqs(reqs);
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

  const totalItems = storeSummary.reduce((s, x) => s + x.total, 0);
  const totalLow   = storeSummary.reduce((s, x) => s + x.low, 0); // eslint-disable-line no-unused-vars

  return (
    <div className="p-6 space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-teal-500 to-teal-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">Welcome, {user?.full_name || user?.name}!</h1>
        <p className="mt-1 text-teal-100">Store Admin Dashboard — Manage inventory and approve item requests</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Items',     value: totalItems,        icon: FiPackage,      color: 'text-teal-600',   bg: 'bg-teal-50' },
          { label: 'Low Stock',       value: totalLow,          icon: FiAlertCircle,  color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'Pending Requests',value: pendingReqs.length, icon: FiClock,       color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Stores',          value: 5,                 icon: FiCheckCircle,  color: 'text-blue-600',   bg: 'bg-blue-50' },
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

      {/* Store Summary */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Store Overview</h2>
          <button onClick={() => navigate('/dashboard/store-inventory')} className="text-sm text-teal-600 flex items-center gap-1 hover:underline">
            Manage Inventory <FiArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {storeSummary.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 text-center hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate('/dashboard/store-inventory')}>
              <span className="text-2xl">{s.icon}</span>
              <p className="font-semibold text-gray-800 text-sm mt-2">{s.name}</p>
              <p className="text-gray-500 text-xs mt-1">{s.total} items</p>
              {s.low > 0 && <p className="text-xs text-red-600 font-medium mt-1">{s.low} low stock</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Pending Requests */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Pending Approval Requests</h2>
          <button onClick={() => navigate('/dashboard/item-requests')} className="text-sm text-indigo-600 flex items-center gap-1 hover:underline">
            View All <FiArrowRight className="w-4 h-4" />
          </button>
        </div>
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : pendingReqs.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-400">
            <FiCheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p>No pending requests — all caught up!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingReqs.slice(0, 5).map(r => (
              <div key={r.id} className="bg-white border border-yellow-200 rounded-xl px-5 py-3 flex items-center justify-between hover:shadow-sm">
                <div>
                  <span className="font-mono text-xs text-gray-400">{r.request_number}</span>
                  <span className="ml-3 font-semibold text-gray-800">{r.store_name}</span>
                  <span className="ml-3 text-sm text-gray-500">by {r.requester_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                  <button onClick={() => navigate('/dashboard/item-requests')}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                    Review
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => navigate('/dashboard/store-inventory')}
          className="flex items-center gap-3 p-4 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
          <FiPackage className="w-6 h-6" />
          <div className="text-left">
            <p className="font-semibold">Store Inventory</p>
            <p className="text-teal-200 text-xs">View & manage all stores</p>
          </div>
        </button>
        <button onClick={() => navigate('/dashboard/item-requests')}
          className="flex items-center gap-3 p-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
          <FiSend className="w-6 h-6" />
          <div className="text-left">
            <p className="font-semibold">Item Requests</p>
            <p className="text-indigo-200 text-xs">Review & approve requests</p>
          </div>
        </button>
      </div>
    </div>
  );
}
