import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { FiUsers, FiUser, FiUserCheck, FiUserX, FiArrowRight, FiSend } from 'react-icons/fi';

const ROLE_COLORS = {
  admin:          'bg-purple-100 text-purple-700',
  hr_admin:       'bg-pink-100 text-pink-700',
  store_admin:    'bg-teal-100 text-teal-700',
  fnb_manager:    'bg-amber-100 text-amber-700',
  cashier:        'bg-green-100 text-green-700',
  cafe_waiter:    'bg-blue-100 text-blue-700',
  kitchen_staff:  'bg-red-100 text-red-700',
  bakery_employee:'bg-orange-100 text-orange-700',
};

const ROLE_NAMES = {
  admin: 'Admin', hr_admin: 'HR Admin', store_admin: 'Store Admin',
  fnb_manager: 'F&B Manager', cashier: 'Cashier', cafe_waiter: 'Café Waiter',
  kitchen_staff: 'Kitchen Staff', bakery_employee: 'Bakery Employee',
};

export default function HRAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users,    setUsers]    = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [userRes, reqRes] = await Promise.all([
          api.users.getAll(),
          api.itemRequests.getAll({}),
        ]);
        const u = userRes?.data?.data?.users ?? userRes?.data?.users ?? [];
        const r = reqRes?.data?.data?.requests ?? reqRes?.data?.requests ?? [];
        setUsers(Array.isArray(u) ? u : []);
        setRequests(Array.isArray(r) ? r : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeUsers   = users.filter(u => u.is_active !== false).length;
  const inactiveUsers = users.filter(u => u.is_active === false).length;

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  const recentUsers = [...users]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-pink-500 to-pink-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">Welcome, {user?.full_name || user?.name}!</h1>
        <p className="mt-1 text-pink-100">HR Admin Dashboard — Manage users, employees, and monitor system activity</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Users',    value: users.length,   icon: FiUsers,     color: 'text-pink-600',   bg: 'bg-pink-50' },
          { label: 'Active',         value: activeUsers,    icon: FiUserCheck, color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Inactive',       value: inactiveUsers,  icon: FiUserX,     color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'Total Requests', value: requests.length, icon: FiSend,     color: 'text-blue-600',   bg: 'bg-blue-50' },
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

      {/* Role Breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-bold text-gray-800 mb-4">Users by Role</h2>
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(roleCounts).map(([role, count]) => (
              <span key={role} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-600'}`}>
                {ROLE_NAMES[role] || role}: <span className="font-bold">{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Recent Users */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Recently Added Users</h2>
          <button onClick={() => navigate('/dashboard/users')} className="text-sm text-pink-600 flex items-center gap-1 hover:underline">
            Manage Users <FiArrowRight className="w-4 h-4" />
          </button>
        </div>
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : recentUsers.length === 0 ? (
          <p className="text-gray-400 text-sm">No users found</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name', 'Username', 'Role', 'Status', 'Joined'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username}</td>
                    <td className="px-4 py-3 text-gray-500">@{u.username}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_NAMES[u.role] || u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${u.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {u.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={() => navigate('/dashboard/users')}
          className="flex items-center gap-3 p-4 bg-pink-600 text-white rounded-xl hover:bg-pink-700 transition-colors">
          <FiUsers className="w-6 h-6" />
          <div className="text-left">
            <p className="font-semibold">Manage Users</p>
            <p className="text-pink-200 text-xs">Create, edit, deactivate</p>
          </div>
        </button>
        <button onClick={() => navigate('/dashboard/employees')}
          className="flex items-center gap-3 p-4 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors">
          <FiUser className="w-6 h-6" />
          <div className="text-left">
            <p className="font-semibold">Employees</p>
            <p className="text-purple-200 text-xs">HR records & profiles</p>
          </div>
        </button>
        <button onClick={() => navigate('/dashboard/item-requests')}
          className="flex items-center gap-3 p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
          <FiSend className="w-6 h-6" />
          <div className="text-left">
            <p className="font-semibold">Item Requests</p>
            <p className="text-blue-200 text-xs">Track workflow activity</p>
          </div>
        </button>
      </div>
    </div>
  );
}
