import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import {
  FiClipboard,
  FiCheckCircle,
  FiCoffee,
  FiDollarSign,
  FiMapPin
} from 'react-icons/fi';

const CashierEmployees = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const [statsRange, setStatsRange] = useState('today');
  const [employeeOrders, setEmployeeOrders] = useState([]);
  const [employeeStats, setEmployeeStats] = useState({
    ordersCreated: 0,
    ordersServed: 0,
    totalRevenue: 0,
    pendingBalance: 0
  });

  const [ordersForPayment, setOrdersForPayment] = useState([]);
  const [orderDetailsById, setOrderDetailsById] = useState({});
  const [loadingOrderIds, setLoadingOrderIds] = useState(() => new Set());
  const fetchedOrderIdsRef = useRef(new Set());
  const [processingOrders, setProcessingOrders] = useState(new Set());
 
  const [showProcessPaymentConfirmModal, setShowProcessPaymentConfirmModal] = useState(false);
  const [confirmProcessPaymentOrder, setConfirmProcessPaymentOrder] = useState(null);

  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [confirmOrder, setConfirmOrder] = useState(null);

  const normalizeStatus = (s) => String(s || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .trim();

  const selectedEmployee = useMemo(() => {
    const id = selectedEmployeeId ? parseInt(selectedEmployeeId, 10) : null;
    if (!Number.isFinite(id)) return null;
    return employees.find(e => parseInt(e.id, 10) === id) || null;
  }, [employees, selectedEmployeeId]);

  const ordersForPaymentSorted = useMemo(() => {
    const list = Array.isArray(ordersForPayment) ? ordersForPayment : [];
    return list
      .slice()
      .sort((a, b) => {
        const ad = new Date(a?.created_at || a?.updated_at);
        const bd = new Date(b?.created_at || b?.updated_at);
        const at = Number.isNaN(ad.getTime()) ? null : ad.getTime();
        const bt = Number.isNaN(bd.getTime()) ? null : bd.getTime();
        if (at != null && bt != null) return bt - at;
        if (at != null) return -1;
        if (bt != null) return 1;
        const aid = a?.id != null ? parseInt(a.id, 10) : 0;
        const bid = b?.id != null ? parseInt(b.id, 10) : 0;
        return bid - aid;
      });
  }, [ordersForPayment]);

  const fetchEmployees = async () => {
    const res = await api.users.getWaiters();
    const list = res?.data?.data?.users ?? res?.data?.users ?? res?.data?.waiters ?? [];
    const arr = Array.isArray(list) ? list : [];
    // Normalize id/full_name
    const normalized = arr.map(u => ({
      id: u.id,
      username: u.username,
      full_name: u.full_name || u.name || u.username,
      role: u.role,
      is_active: u.is_active !== false
    }));
    setEmployees(normalized);
  };

  const fetchEmployeeData = async (employeeId) => {
    const [ordersForPaymentResp, allOrdersResp] = await Promise.allSettled([
      api.orders.getOrdersForPayment({ employee_id: employeeId }),
      api.orders.getAll({ type: 'cafe', employee_id: employeeId })
    ]);

    const ordersForPaymentRaw = ordersForPaymentResp?.status === 'fulfilled'
      ? (ordersForPaymentResp.value?.data?.data?.orders ?? ordersForPaymentResp.value?.data?.orders ?? [])
      : [];
    setOrdersForPayment(Array.isArray(ordersForPaymentRaw) ? ordersForPaymentRaw : []);

    const allOrdersRaw = allOrdersResp?.status === 'fulfilled'
      ? (allOrdersResp.value?.data?.data?.orders ?? allOrdersResp.value?.data?.orders ?? [])
      : [];
    setEmployeeOrders(Array.isArray(allOrdersRaw) ? allOrdersRaw : []);
  };

  const getOrderItemsForRow = useCallback((order) => {
    if (!order) return [];
    const id = order?.id != null ? parseInt(order.id, 10) : null;
    const fromCache = Number.isFinite(id) ? orderDetailsById?.[id]?.items : null;
    const items = fromCache ?? order?.items;
    return Array.isArray(items) ? items : [];
  }, [orderDetailsById]);

  useEffect(() => {
    const list = Array.isArray(ordersForPayment) ? ordersForPayment : [];
    const missing = list
      .map((o) => (o?.id != null ? parseInt(o.id, 10) : null))
      .filter((id) => Number.isFinite(id))
      .filter((id) => {
        if (fetchedOrderIdsRef.current.has(id)) return false;
        if (loadingOrderIds.has(id)) return false;
        const existing = orderDetailsById?.[id];
        if (existing && Array.isArray(existing.items) && existing.items.length > 0) return false;
        const order = list.find((x) => parseInt(x?.id, 10) === id);
        const items = Array.isArray(order?.items) ? order.items : [];
        return items.length === 0;
      });

    if (missing.length === 0) return;

    missing.forEach((id) => {
      setLoadingOrderIds((prev) => {
        const next = new Set(prev || []);
        next.add(id);
        return next;
      });

      api.orders.getById(id)
        .then((resp) => {
          const order = resp?.data?.data?.order ?? resp?.data?.order;
          if (order?.id == null) return;
          const oid = parseInt(order.id, 10);
          if (!Number.isFinite(oid)) return;
          setOrderDetailsById((prev) => ({ ...(prev || {}), [oid]: order }));
          fetchedOrderIdsRef.current.add(oid);
        })
        .catch(() => {
          fetchedOrderIdsRef.current.add(id);
        })
        .finally(() => {
          setLoadingOrderIds((prev) => {
            const next = new Set(prev || []);
            next.delete(id);
            return next;
          });
        });
    });
  }, [ordersForPayment, loadingOrderIds, orderDetailsById]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        await fetchEmployees();
      } catch (e) {
        console.error('Cashier employees load error:', e);
        toast.error('Failed to load employees');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadEmployeeView = async () => {
      const id = selectedEmployeeId ? parseInt(selectedEmployeeId, 10) : null;
      if (!Number.isFinite(id)) {
        setOrdersForPayment([]);
        setEmployeeOrders([]);
        return;
      }

      try {
        setLoading(true);
        await fetchEmployeeData(id);
      } catch (e) {
        console.error('Cashier employee data error:', e);
        toast.error('Failed to load employee payments');
      } finally {
        setLoading(false);
      }
    };
    loadEmployeeView();
  }, [selectedEmployeeId]);

  useEffect(() => {
    const orders = Array.isArray(employeeOrders) ? employeeOrders : [];

    const now = new Date();
    let from = null;
    let to = null;

    if (statsRange === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (statsRange === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
      to = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
    } else if (statsRange === 'week') {
      from = new Date(now);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      to = new Date(now);
    } else if (statsRange === 'month') {
      from = new Date(now);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      to = new Date(now);
    }

    const rangeOrders = (from && to)
      ? orders.filter((o) => {
          const d = new Date(o.created_at);
          if (Number.isNaN(d.getTime())) return false;
          return d >= from && d <= to;
        })
      : orders;

    const served = rangeOrders.filter((o) => {
      const st = normalizeStatus(o.status);
      const pst = normalizeStatus(o.payment_status);
      return ['completed', 'paid'].includes(st) || pst === 'paid';
    });
    const revenue = served.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

    const pendingBalance = rangeOrders
      .filter((o) => {
        const st = normalizeStatus(o.status);
        const pst = normalizeStatus(o.payment_status);
        const isCanceled = st === 'deleted' || st === 'cancelled' || st === 'canceled';
        const isPaid = pst === 'paid' || st === 'paid' || st === 'completed';
        return !isCanceled && !isPaid;
      })
      .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

    setEmployeeStats({
      ordersCreated: rangeOrders.length,
      ordersServed: served.length,
      totalRevenue: revenue,
      pendingBalance
    });
  }, [statsRange, employeeOrders]);

  // Auto-refresh employee data to sync pending payments across dashboards
  useEffect(() => {
    const id = selectedEmployeeId ? parseInt(selectedEmployeeId, 10) : null;
    if (!Number.isFinite(id)) return;

    const refreshInterval = setInterval(() => {
      fetchEmployeeData(id).catch(err => {
        console.error('Auto-refresh error:', err);
      });
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(refreshInterval);
  }, [selectedEmployeeId]);

  const openProcessPaymentConfirm = (order) => {
    if (!order) return;
    if (processingOrders.has(order.id)) return;
    setConfirmProcessPaymentOrder(order);
    setShowProcessPaymentConfirmModal(true);
  };

  const handleProcessPaymentNo = () => {
    setShowProcessPaymentConfirmModal(false);
    setConfirmProcessPaymentOrder(null);
  };

  const handleProcessPaymentYes = async () => {
    const order = confirmProcessPaymentOrder;
    if (!order) return;

    setShowProcessPaymentConfirmModal(false);
    setConfirmProcessPaymentOrder(null);
    await handleProcessPayment(order);
  };

  const handleProcessPayment = async (order) => {
    // Prevent multiple clicks
    if (processingOrders.has(order.id)) return;
    
    try {
      // Mark order as being processed
      setProcessingOrders(prev => new Set(prev).add(order.id));
      
      // Optimistic update: immediately remove from orders ready for payment
      setOrdersForPayment(prev => prev.filter(o => o.id !== order.id));

      const paymentData = {
        order_id: order.id,
        amount: order.total_amount,
        payment_method: 'cash',
        status: 'pending',
        processed_by: user.id
      };

      const createResp = await api.payments.create(paymentData);
      const createdPayment = createResp?.data?.data?.payment;
      if (createdPayment?.id) {
        await api.payments.confirm(createdPayment.id, { processed_by: user.id });
      }

      toast.success('Payment confirmed');
      await fetchEmployeeData(parseInt(selectedEmployeeId, 10));
    } catch (e) {
      console.error('Create payment error:', e);
      
      // Check if payment already exists for this order
      if (e.response?.status === 400 && e.response?.data?.message?.includes('already exists')) {
        toast.error('Payment already created for this order');
        // Refresh to sync state
        await fetchEmployeeData(parseInt(selectedEmployeeId, 10));
      } else {
        toast.error('Failed to create payment record');
        // Revert optimistic update on other errors
        await fetchEmployeeData(parseInt(selectedEmployeeId, 10));
      }
    } finally {
      // Remove from processing set
      setProcessingOrders(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const openCancelConfirm = (order) => {
    if (!order) return;
    setConfirmOrder(order);
    setShowCancelConfirmModal(true);
  };

  const handleCancelNo = () => {
    setShowCancelConfirmModal(false);
    setConfirmOrder(null);
  };

  const handleCancelYes = async () => {
    const order = confirmOrder;
    if (!order) return;

    if (processingOrders.has(order.id)) return;

    try {
      setProcessingOrders(prev => new Set(prev).add(order.id));

      // Optimistic update: immediately remove from orders ready for payment
      setOrdersForPayment(prev => prev.filter(o => o.id !== order.id));

      await api.orders.updateStatus(order.id, { status: 'deleted' });
      await api.payments.create({
        order_id: order.id,
        amount: order.total_amount,
        payment_method: 'cash',
        status: 'deleted',
        processed_by: user.id
      });

      toast.success('Order cancelled');
      setShowCancelConfirmModal(false);
      setConfirmOrder(null);
      await fetchEmployeeData(parseInt(selectedEmployeeId, 10));
    } catch (e) {
      console.error('Cancel order error:', e);
      toast.error('Failed to cancel order');
      await fetchEmployeeData(parseInt(selectedEmployeeId, 10));
    } finally {
      setProcessingOrders(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  if (loading) return <LoadingSpinner text="Loading..." />;

  const formatOrderItemsPreview = (items) => {
    const arr = Array.isArray(items) ? items : [];
    if (arr.length === 0) return '';
    const parts = arr.slice(0, 3).map((it) => {
      const qty = parseInt(it.quantity, 10);
      const name = it.menu_item_name || it.name || '';
      if (!name) return null;
      return `${Number.isFinite(qty) ? qty : 1}x ${name}`;
    }).filter(Boolean);
    if (parts.length === 0) return '';
    const remaining = arr.length - 3;
    return remaining > 0 ? `${parts.join(', ')} +${remaining} more` : parts.join(', ');
  };

  // FIRST VIEW: only employees list
  if (!selectedEmployeeId) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-600 mt-1">Select an employee to view Orders Ready for Payment and Pending Payments</p>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">All Waiters / Employees</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="table-header text-left py-3 px-4">Name</th>
                  <th className="table-header text-left py-3 px-4">Username</th>
                  <th className="table-header text-left py-3 px-4">Role</th>
                  <th className="table-header text-left py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.length > 0 ? (
                  employees.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedEmployeeId(String(e.id))}
                    >
                      <td className="table-cell font-medium">{e.full_name}</td>
                      <td className="table-cell">{e.username}</td>
                      <td className="table-cell">{e.role}</td>
                      <td className="table-cell">
                        <span className={`badge ${e.is_active ? 'badge-success' : 'badge-error'}`}>
                          {e.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
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
      </div>
    );
  }

  // SECOND VIEW: selected employee -> show required cashier sections
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-600 mt-1">Employee: {selectedEmployee?.full_name || selectedEmployeeId}</p>
        </div>
        <button
          className="btn btn-outline"
          onClick={() => setSelectedEmployeeId('')}
        >
          Back to Employees
        </button>
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Table Service Operations</h2>
        <p className="text-gray-600">Manage your table service and café orders efficiently</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            title: 'Orders',
            value: employeeStats.ordersCreated,
            icon: FiClipboard,
            color: 'bg-blue-500'
          },
          {
            title: 'Orders Served',
            value: employeeStats.ordersServed,
            icon: FiCheckCircle,
            color: 'bg-green-500'
          },
          {
            title: 'Revenue',
            value: `${(parseFloat(employeeStats.totalRevenue) || 0).toFixed(2)} Birr`,
            icon: FiCoffee,
            color: 'bg-purple-500'
          },
          {
            title: 'Pending Balance',
            value: `${(parseFloat(employeeStats.pendingBalance) || 0).toFixed(2)} Birr`,
            icon: FiDollarSign,
            color: 'bg-orange-600'
          }
        ].map((card, idx) => {
          const Icon = card.icon;
          const isCredit = card.title === 'Pending Balance';
          return (
            <div key={idx} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium ${isCredit ? 'text-orange-700' : 'text-gray-600'}`}>
                    {card.title}
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${isCredit ? 'text-orange-700' : 'text-gray-900'}`}>
                    {card.value}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${card.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
          <button
            onClick={() => setStatsRange('today')}
            className={`px-3 py-2 text-sm font-medium ${statsRange === 'today' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Today
          </button>
          <button
            onClick={() => setStatsRange('yesterday')}
            className={`px-3 py-2 text-sm font-medium border-l border-gray-200 ${statsRange === 'yesterday' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Yesterday
          </button>
          <button
            onClick={() => setStatsRange('week')}
            className={`px-3 py-2 text-sm font-medium border-l border-gray-200 ${statsRange === 'week' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Week
          </button>
          <button
            onClick={() => setStatsRange('month')}
            className={`px-3 py-2 text-sm font-medium border-l border-gray-200 ${statsRange === 'month' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Month
          </button>
          <button
            onClick={() => setStatsRange('all')}
            className={`px-3 py-2 text-sm font-medium border-l border-gray-200 ${statsRange === 'all' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">My Recent Orders</h3>
          </div>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {(() => {
              const orders = Array.isArray(employeeOrders) ? employeeOrders : [];

              const now = new Date();
              let from = null;
              let to = null;

              if (statsRange === 'today') {
                from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
              } else if (statsRange === 'yesterday') {
                const y = new Date(now);
                y.setDate(y.getDate() - 1);
                from = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
                to = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
              } else if (statsRange === 'week') {
                from = new Date(now);
                from.setDate(from.getDate() - 6);
                from.setHours(0, 0, 0, 0);
                to = new Date(now);
              } else if (statsRange === 'month') {
                from = new Date(now);
                from.setDate(from.getDate() - 29);
                from.setHours(0, 0, 0, 0);
                to = new Date(now);
              }

              const rangeOrders = (from && to)
                ? orders.filter((o) => {
                    const d = new Date(o.created_at);
                    if (Number.isNaN(d.getTime())) return false;
                    return d >= from && d <= to;
                  })
                : orders;

              const list = rangeOrders
                .slice()
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

              if (list.length === 0) {
                return (
                  <p className="text-gray-500 text-center py-8">No recent orders</p>
                );
              }

              return list.map((order) => {
                const st = normalizeStatus(order.status);
                const pst = normalizeStatus(order.payment_status);
                const isCanceled = st === 'deleted' || st === 'cancelled' || st === 'canceled';
                const displayStatus = pst === 'paid' ? 'paid' : (st || order.status);
                const badgeClass = displayStatus === 'completed' || displayStatus === 'paid'
                  ? 'badge-success'
                  : displayStatus === 'ready'
                    ? 'badge-info'
                    : displayStatus === 'preparing'
                      ? 'badge-warning'
                      : 'badge';

                return (
                  <div
                    key={order.id}
                    className={`border border-gray-200 rounded-lg p-4 relative ${isCanceled ? 'text-red-700 line-through decoration-red-500 decoration-2' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FiMapPin className="w-4 h-4 text-gray-600" />
                          <span className="font-semibold text-gray-900">
                            {order.table_number ? `Table ${order.table_number}` : 'Take Away'}
                          </span>
                          <span className="text-sm text-gray-500">Order #{order.id}</span>
                          {isCanceled ? (
                            <span className="text-sm font-semibold text-red-600">Canceled</span>
                          ) : (
                            <span className={`badge ${badgeClass}`}>{displayStatus}</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {new Date(order.created_at).toLocaleString()} {Array.isArray(order.items) ? ` • ${order.items.length} items` : ''}
                        </div>
                        {Array.isArray(order.items) && order.items.length > 0 && (
                          <div className="text-sm text-gray-700 mt-1">{formatOrderItemsPreview(order.items)}</div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-bold text-gray-900">
                          {(parseFloat(order.total_amount) || 0).toFixed(2)} Birr
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">Orders Ready for Payment</h3>
            <span className="badge badge-info">{ordersForPaymentSorted.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="table-header text-left py-3 px-4">Order #</th>
                  <th className="table-header text-left py-3 px-4">Table</th>
                  <th className="table-header text-left py-3 px-4">Items</th>
                  <th className="table-header text-left py-3 px-4">Total</th>
                  <th className="table-header text-left py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {ordersForPaymentSorted.length > 0 ? (
                  ordersForPaymentSorted.map((o) => (
                    <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="table-cell font-medium">{o.id}</td>
                      <td className="table-cell">{o.table_number || '-'}</td>
                      <td className="table-cell">
                        {(() => {
                          const items = getOrderItemsForRow(o);
                          if (items.length > 0) {
                            return (
                              <div className="text-sm space-y-1">
                                {items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between">
                                    <span className="text-gray-700">
                                      {item.quantity}x {item.menu_item_name || item.name || 'Item'}
                                    </span>
                                    <span className="text-gray-600 ml-2">
                                      {(parseFloat(item.subtotal || item.total_price || 0) || 0).toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            );
                          }

                          const id = o?.id != null ? parseInt(o.id, 10) : null;
                          const isLoading = Number.isFinite(id) ? loadingOrderIds.has(id) : false;
                          return (
                            <span className="text-gray-400 text-sm">{isLoading ? 'Loading...' : 'No items'}</span>
                          );
                        })()}
                      </td>
                      <td className="table-cell">{(parseFloat(o.total_amount || 0) || 0).toFixed(2)}</td>
                      <td className="table-cell">
                        <div className="flex items-center space-x-2">
                          <button 
                            className={`btn btn-sm ${processingOrders.has(o.id) ? 'btn-disabled' : 'btn-primary'}`}
                            onClick={() => openProcessPaymentConfirm(o)}
                            disabled={processingOrders.has(o.id)}
                          >
                            {processingOrders.has(o.id) ? 'Processing...' : 'Process Payment'}
                          </button>
                          <button 
                            className={`btn btn-sm ${processingOrders.has(o.id) ? 'btn-disabled' : 'btn-danger'}`}
                            onClick={() => openCancelConfirm(o)}
                            disabled={processingOrders.has(o.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-gray-500">No orders waiting for payment</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showProcessPaymentConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Process Payment</h3>
              <button
                onClick={handleProcessPaymentNo}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900">Order #{confirmProcessPaymentOrder?.id}</h4>
                <p className="text-sm text-gray-600">
                  {confirmProcessPaymentOrder?.table_number ? `Table ${confirmProcessPaymentOrder.table_number}` : 'No table'}
                </p>
                <p className="text-lg font-bold text-green-600 mt-2">
                  ${(parseFloat(confirmProcessPaymentOrder?.total_amount || 0) || 0).toFixed(2)}
                </p>
              </div>

              <div className="text-sm text-gray-700">
                Are you sure?
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={handleProcessPaymentNo}
                  className="btn btn-outline"
                  disabled={processingOrders.has(confirmProcessPaymentOrder?.id)}
                >
                  No
                </button>
                <button
                  onClick={handleProcessPaymentYes}
                  className="btn btn-primary"
                  disabled={processingOrders.has(confirmProcessPaymentOrder?.id)}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCancelConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Cancel Order</h3>
              <button
                onClick={handleCancelNo}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900">Order #{confirmOrder?.id}</h4>
                <p className="text-sm text-gray-600">
                  {confirmOrder?.table_number ? `Table ${confirmOrder.table_number}` : 'No table'}
                </p>
                <p className="text-lg font-bold text-green-600 mt-2">
                  ${(parseFloat(confirmOrder?.total_amount || 0) || 0).toFixed(2)}
                </p>
              </div>

              <div className="text-sm text-gray-700">
                Are you sure?
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={handleCancelNo}
                  className="btn btn-outline"
                  disabled={processingOrders.has(confirmOrder?.id)}
                >
                  No
                </button>
                <button
                  onClick={handleCancelYes}
                  className="btn btn-danger"
                  disabled={processingOrders.has(confirmOrder?.id)}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashierEmployees;
