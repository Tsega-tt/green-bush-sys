import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import toast from 'react-hot-toast';

const EmployeeManagement = () => {
  const [loading, setLoading] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [timeRange, setTimeRange] = useState('today');
  const [customMode, setCustomMode] = useState('single');
  const [customDate, setCustomDate] = useState(() => {
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  });
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  });
  const [employees, setEmployees] = useState([]);
  const [details, setDetails] = useState(null);

  const formatAmount = (value) => {
    const n = parseFloat(value);
    return (Number.isFinite(n) ? n : 0).toFixed(2);
  };

  const selectedEmployee = useMemo(() => {
    const id = selectedEmployeeId ? parseInt(selectedEmployeeId, 10) : null;
    if (!Number.isFinite(id)) return null;
    return employees.find(e => parseInt(e.employee_id, 10) === id) || null;
  }, [employees, selectedEmployeeId]);

  const allEmployeesSummary = useMemo(() => {
    const totals = (Array.isArray(employees) ? employees : []).reduce(
      (acc, e) => {
        acc.orders_total += parseFloat(e?.orders_total || 0) || 0;
        acc.paid_total += parseFloat(e?.paid_total || 0) || 0;
        acc.unpaid_total += parseFloat(e?.unpaid_total || 0) || 0;
        acc.orders_count += parseInt(e?.orders_count || 0, 10) || 0;
        acc.payments_count += parseInt(e?.payments_count || 0, 10) || 0;
        return acc;
      },
      { orders_total: 0, paid_total: 0, unpaid_total: 0, orders_count: 0, payments_count: 0 }
    );
    return totals;
  }, [employees]);

  const activeSummary = selectedEmployee || allEmployeesSummary;

  const getDateRangeParams = () => {
    if (timeRange === 'all') return { from: null, to: null };

    const pad2 = (n) => String(n).padStart(2, '0');
    const formatYmdLocal = (d) => {
      if (!d || Number.isNaN(d.getTime())) return null;
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    };

    const now = new Date();

    if (timeRange === 'today') {
      const ymd = formatYmdLocal(now);
      return { from: ymd, to: ymd };
    }

    if (timeRange === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const ymd = formatYmdLocal(y);
      return { from: ymd, to: ymd };
    }

    if (timeRange === 'week') {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      const fromYmd = formatYmdLocal(from);
      const toYmd = formatYmdLocal(now);
      return { from: fromYmd, to: toYmd };
    }

    if (timeRange === 'month') {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      const fromYmd = formatYmdLocal(from);
      const toYmd = formatYmdLocal(now);
      return { from: fromYmd, to: toYmd };
    }

    if (timeRange === 'custom') {
      if (customMode === 'single') {
        const ymd = customDate || null;
        return { from: ymd, to: ymd };
      }

      const a = String(customStartDate || '').trim();
      const b = String(customEndDate || '').trim();
      if (!a || !b) return { from: null, to: null };
      const from = a <= b ? a : b;
      const to = a <= b ? b : a;
      return { from, to };
    }

    return { from: null, to: null };
  };

  const fetchLedger = async (employeeId = null) => {
    const params = {};
    if (employeeId) params.employee_id = employeeId;
    const { from, to } = getDateRangeParams();
    if (from && to) {
      params.from = from;
      params.to = to;
    }
    const res = await api.employees.getLedger(params);

    const list = res?.data?.data?.employees ?? res?.data?.employees ?? [];
    const listArray = Array.isArray(list) ? list : [];
    setEmployees(listArray);

    const det = res?.data?.data?.details ?? res?.data?.details ?? null;
    setDetails(det);
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const id = selectedEmployeeId ? parseInt(selectedEmployeeId, 10) : null;
        await fetchLedger(Number.isFinite(id) ? id : null);
      } catch (e) {
        console.error('Employee ledger load error:', e);
        toast.error('Failed to load employee ledger');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedEmployeeId, timeRange, customMode, customDate, customStartDate, customEndDate]);

  if (loading) {
    return <LoadingSpinner text="Loading employees..." />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Employee Management</h1>
          <p className="text-gray-600 mt-1">Orders, payments and unpaid balance per employee</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Filter</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <select
                className="input-field"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
              >
                <option value="">All employees</option>
                {employees.map((e) => (
                  <option key={e.employee_id} value={String(e.employee_id)}>
                    {e.employee_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTimeRange('today')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border ${timeRange === 'today' ? 'bg-gray-100 text-gray-900 border-gray-300' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  Today
                </button>
                <button
                  onClick={() => setTimeRange('yesterday')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border ${timeRange === 'yesterday' ? 'bg-gray-100 text-gray-900 border-gray-300' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  Yesterday
                </button>
                <button
                  onClick={() => setTimeRange('week')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border ${timeRange === 'week' ? 'bg-gray-100 text-gray-900 border-gray-300' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  Week
                </button>
                <button
                  onClick={() => setTimeRange('month')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border ${timeRange === 'month' ? 'bg-gray-100 text-gray-900 border-gray-300' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  Month
                </button>
                <button
                  onClick={() => setTimeRange('custom')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border ${timeRange === 'custom' ? 'bg-gray-100 text-gray-900 border-gray-300' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  Custom
                </button>
                <button
                  onClick={() => setTimeRange('all')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border ${timeRange === 'all' ? 'bg-gray-100 text-gray-900 border-gray-300' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  All
                </button>
              </div>

              {timeRange === 'custom' && (
                <div className="mt-3 space-y-3">
                  <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
                    <button
                      onClick={() => setCustomMode('single')}
                      className={`px-3 py-2 text-sm font-medium ${customMode === 'single' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      Specific date
                    </button>
                    <button
                      onClick={() => setCustomMode('range')}
                      className={`px-3 py-2 text-sm font-medium border-l border-gray-200 ${customMode === 'range' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      Range
                    </button>
                  </div>

                  {customMode === 'single' ? (
                    <div>
                      <input
                        type="date"
                        className="input-field"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                        <input
                          type="date"
                          className="input-field"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                        <input
                          type="date"
                          className="input-field"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="p-6">
            <p className="text-sm font-medium text-gray-600">Orders Total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatAmount(activeSummary?.orders_total)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Count: {activeSummary?.orders_count ?? 0}</p>
          </div>
        </div>

        <div className="card">
          <div className="p-6">
            <p className="text-sm font-medium text-gray-600">Paid Total</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {formatAmount(activeSummary?.paid_total)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Payments: {activeSummary?.payments_count ?? 0}</p>
          </div>
        </div>

        <div className="card">
          <div className="p-6">
            <p className="text-sm font-medium text-gray-600">Unpaid Total</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {formatAmount(activeSummary?.unpaid_total)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Computed: unpaid orders total</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Employees Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header text-left py-3 px-4">Employee</th>
                <th className="table-header text-left py-3 px-4">Orders</th>
                <th className="table-header text-left py-3 px-4">Paid</th>
                <th className="table-header text-left py-3 px-4">Unpaid</th>
              </tr>
            </thead>
            <tbody>
              {employees.length > 0 ? (
                employees.map((e) => (
                  <tr
                    key={e.employee_id}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      String(e.employee_id) === String(selectedEmployeeId) ? 'bg-primary-50' : ''
                    }`}
                    onClick={() => setSelectedEmployeeId(String(e.employee_id))}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="table-cell font-medium">{e.employee_name}</td>
                    <td className="table-cell">{(parseFloat(e.orders_total || 0) || 0).toFixed(2)}</td>
                    <td className="table-cell text-green-700">{(parseFloat(e.paid_total || 0) || 0).toFixed(2)}</td>
                    <td className="table-cell text-red-700">{(parseFloat(e.unpaid_total || 0) || 0).toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="text-center py-8 text-gray-500">No employees found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedEmployeeId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-semibold text-gray-900">Orders</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="table-header text-left py-3 px-4">Order #</th>
                    <th className="table-header text-left py-3 px-4">Type</th>
                    <th className="table-header text-left py-3 px-4">Total</th>
                    <th className="table-header text-left py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(details?.orders || []).length > 0 ? (
                    details.orders.map((o) => (
                      <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="table-cell font-medium">{o.id}</td>
                        <td className="table-cell capitalize">{o.type}</td>
                        <td className="table-cell">{(parseFloat(o.total_amount || 0) || 0).toFixed(2)}</td>
                        <td className="table-cell capitalize">{o.status}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="text-center py-8 text-gray-500">No orders for this employee</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-semibold text-gray-900">Paid Payments</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="table-header text-left py-3 px-4">Payment #</th>
                    <th className="table-header text-left py-3 px-4">Order #</th>
                    <th className="table-header text-left py-3 px-4">Method</th>
                    <th className="table-header text-left py-3 px-4">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(details?.payments || []).length > 0 ? (
                    details.payments.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="table-cell font-medium">{p.id}</td>
                        <td className="table-cell">{p.order_id}</td>
                        <td className="table-cell capitalize">{p.payment_method || 'cash'}</td>
                        <td className="table-cell text-green-700">{(parseFloat(p.amount || 0) || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="text-center py-8 text-gray-500">No paid payments for this employee</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeManagement;
