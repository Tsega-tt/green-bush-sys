import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  FiCreditCard,
  FiDollarSign,
  FiSquare,
  FiCheckCircle,
  FiSearch,
  FiEye,
  FiX
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Payment Management Page Component
 * Interface for cashiers and admins to manage payments
 */
const PaymentManagement = () => {
  useAuth();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [ordersForPayment, setOrdersForPayment] = useState([]);
  const [filteredPayments, setFilteredPayments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewPayment, setViewPayment] = useState(null);
  const [viewOrder, setViewOrder] = useState(null);

  // Fetch payments
  useEffect(() => {
    const fetchPayments = async () => {
      try {
        setLoading(true);
        const [paymentsResponse, ordersForPaymentResponse] = await Promise.all([
          api.payments.getAll(),
          api.orders.getOrdersForPayment()
        ]);

        const paymentsList = paymentsResponse?.data?.data?.payments ?? paymentsResponse?.data?.payments ?? [];
        const ordersList = ordersForPaymentResponse?.data?.data?.orders ?? ordersForPaymentResponse?.data?.orders ?? [];

        setPayments(Array.isArray(paymentsList) ? paymentsList : []);
        setOrdersForPayment(Array.isArray(ordersList) ? ordersList : []);
        setFilteredPayments(Array.isArray(paymentsList) ? paymentsList : []);
      } catch (error) {
        console.error('Error fetching payments:', error);
        toast.error('Failed to load payments');
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, []);

  // Filter payments
  useEffect(() => {
    const basePayments = Array.isArray(payments) ? payments : [];
    const baseOrders = Array.isArray(ordersForPayment) ? ordersForPayment : [];

    // When user selects "Pending", show orders waiting for payment (same as Cashier dashboard)
    if (filterStatus === 'pending') {
      let pendingRows = baseOrders.map((o) => ({
        __type: 'order_pending',
        id: `ORDER-${o.id}`,
        order_id: o.id,
        amount: o.total_amount,
        payment_method: null,
        status: 'pending',
        created_at: o.updated_at || o.created_at
      }));

      if (searchTerm) {
        pendingRows = pendingRows.filter((row) =>
          String(row.order_id || '').includes(searchTerm) ||
          String(row.id || '').includes(searchTerm)
        );
      }

      // method filter doesn't apply to unpaid orders; only show when "All Methods"
      if (filterMethod !== 'all') {
        pendingRows = [];
      }

      setFilteredPayments(pendingRows);
      return;
    }

    let filtered = basePayments;

    if (searchTerm) {
      filtered = filtered.filter(payment =>
        payment.id.toString().includes(searchTerm) ||
        payment.order_id.toString().includes(searchTerm)
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(payment => payment.status === filterStatus);
    }

    if (filterMethod !== 'all') {
      filtered = filtered.filter(payment => payment.payment_method === filterMethod);
    }

    setFilteredPayments(filtered);
  }, [payments, ordersForPayment, searchTerm, filterStatus, filterMethod]);

  // Get status badge
  const getStatusBadge = (status) => {
    const badges = {
      pending: 'badge badge-warning',
      paid: 'badge badge-success',
      failed: 'badge badge-error',
      refunded: 'badge badge-info',
      deleted: 'badge badge-neutral'
    };
    return badges[status] || 'badge';
  };

  const openViewPayment = async (payment) => {
    try {
      setShowViewModal(true);
      setViewLoading(true);
      setViewPayment(null);
      setViewOrder(null);

      const isPendingOrderRow = payment?.__type === 'order_pending';
      const paymentId = isPendingOrderRow ? null : payment?.id;
      const orderId = payment?.order_id;

      const [paymentResp, orderResp] = await Promise.all([
        paymentId ? api.payments.getById(paymentId).catch(() => null) : Promise.resolve(null),
        orderId ? api.orders.getById(orderId).catch(() => null) : Promise.resolve(null)
      ]);

      const fullPayment = isPendingOrderRow
        ? payment
        : (paymentResp?.data?.data?.payment ?? paymentResp?.data?.payment ?? payment ?? null);
      const fullOrder = orderResp?.data?.data?.order ?? orderResp?.data?.order ?? null;

      setViewPayment(fullPayment);
      setViewOrder(fullOrder);
    } catch (e) {
      toast.error('Failed to load payment details');
    } finally {
      setViewLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading payments..." />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payment Management</h1>
          <p className="text-gray-600 mt-1">
            Process payments and manage transactions
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{ordersForPayment.length}</span> pending payments
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">
                {ordersForPayment.length}
              </p>
            </div>
            <div className="p-3 rounded-full bg-yellow-500">
              <FiCreditCard className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Today's Revenue</p>
              <p className="text-2xl font-bold text-green-600">
                ${payments
                  .filter(p => p.status === 'paid' && p.created_at.startsWith(new Date().toISOString().split('T')[0]))
                  .reduce((sum, p) => sum + parseFloat(p.amount), 0)
                  .toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-full bg-green-500">
              <FiDollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">QR Payments</p>
              <p className="text-2xl font-bold text-purple-600">
                {payments.filter(p => p.payment_method === 'qr_code' && p.status === 'paid').length}
              </p>
            </div>
            <div className="p-3 rounded-full bg-purple-500">
              <FiSquare className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-blue-600">
                {payments.filter(p => p.status === 'paid').length}
              </p>
            </div>
            <div className="p-3 rounded-full bg-blue-500">
              <FiCheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Pending Payments Section */}
      {ordersForPayment.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Pending Payments
            </h3>
            <span className="badge badge-warning">
              {ordersForPayment.length}
            </span>
          </div>
          <div className="space-y-4">
            {ordersForPayment.map((order) => (
              <div key={order.id} className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-2">
                      <span className="font-semibold text-gray-900">
                        Order #{order.id}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {order.type} • {order.table_number && `Table ${order.table_number} • `}
                      {new Date(order.updated_at || order.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-xl font-bold text-green-600">
                      ${parseFloat(order.total_amount || 0).toFixed(2)}
                    </span>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => toast('Open this order in Cashier Dashboard to process payment')}
                        className="btn-outline text-xs py-1 px-2"
                      >
                        <FiEye className="w-3 h-3 mr-1" />
                        View
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search payments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="deleted">Deleted</option>
          </select>

          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="input-field"
          >
            <option value="all">All Methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="qr_code">QR Code</option>
            <option value="mobile_payment">Mobile Payment</option>
          </select>

          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>Total: {filteredPayments.length}</span>
          </div>
        </div>
      </div>

      {/* Payments List */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">
            Payment History
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header text-left py-3 px-4">Payment ID</th>
                <th className="table-header text-left py-3 px-4">Order ID</th>
                <th className="table-header text-left py-3 px-4">Amount</th>
                <th className="table-header text-left py-3 px-4">Method</th>
                <th className="table-header text-left py-3 px-4">Status</th>
                <th className="table-header text-left py-3 px-4">Date</th>
                <th className="table-header text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="table-cell">#{payment.id}</td>
                  <td className="table-cell">#{payment.order_id}</td>
                  <td className="table-cell font-semibold">
                    ${parseFloat(payment.amount).toFixed(2)}
                  </td>
                  <td className="table-cell capitalize">
                    {payment.payment_method?.replace('_', ' ') || '-'}
                  </td>
                  <td className="table-cell">
                    <span className={getStatusBadge(payment.status)}>
                      {payment.status}
                    </span>
                  </td>
                  <td className="table-cell text-gray-600">
                    {new Date(payment.created_at).toLocaleString()}
                  </td>
                  <td className="table-cell">
                    {payment?.__type === 'order_pending' ? (
                      <button
                        className="btn-outline text-xs py-1 px-2"
                        onClick={() => openViewPayment(payment)}
                      >
                        <FiEye className="w-3 h-3 mr-1" />
                        View
                      </button>
                    ) : (
                      <button
                        className="btn-outline text-xs py-1 px-2"
                        onClick={() => openViewPayment(payment)}
                      >
                        <FiEye className="w-3 h-3 mr-1" />
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredPayments.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No payments found
          </div>
        )}
      </div>

      {showViewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Payment Details</h3>
              <button
                onClick={() => setShowViewModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {viewLoading ? (
              <div className="py-10">
                <LoadingSpinner text="Loading details..." />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">Payment #{viewPayment?.id ?? ''}</div>
                      <div className="text-sm text-gray-600">Order #{viewPayment?.order_id ?? ''}</div>
                      <div className="text-sm text-gray-600 capitalize">{viewPayment?.payment_method?.replace('_', ' ')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">${(parseFloat(viewPayment?.amount) || 0).toFixed(2)}</div>
                      <div className="text-sm text-gray-500">{viewPayment?.created_at ? new Date(viewPayment.created_at).toLocaleString() : ''}</div>
                    </div>
                  </div>
                </div>

                {Array.isArray(viewOrder?.items) && viewOrder.items.length > 0 && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="font-semibold text-gray-900 mb-2">Order Items</div>
                    <div className="space-y-1">
                      {viewOrder.items.map((it, idx) => (
                        <div key={idx} className="text-sm text-gray-700 flex items-center justify-between">
                          <div className="min-w-0">
                            <span className="font-medium">{parseInt(it.quantity, 10) || 1}x</span>{' '}
                            <span className="truncate">{it.menu_item_name || it.name}</span>
                          </div>
                          <div className="text-gray-600">${(parseFloat(it.subtotal) || 0).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!viewOrder || !Array.isArray(viewOrder.items) || viewOrder.items.length === 0) && (
                  <div className="text-sm text-gray-500">No order items available</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentManagement;
