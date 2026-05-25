import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import BranchBadge from '../../components/common/BranchBadge';
import { 
  FiClock, 
  FiCheckCircle, 
  FiAlertCircle, 
  FiPlus, 
  FiPackage,
  FiDollarSign,
  FiCalendar,
  FiClipboard,
  FiHome,
  FiShoppingCart
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Bakery Order History Page
 * Shows orders created by the current bakery employee
 */
const BakeryOrderHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);

  // Fetch bakery employee's orders
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const response = await api.orders.getAll({ 
          employee_id: user.id,
          type: 'bakery'
        });
        setOrders(response.data.data.orders || []);
      } catch (error) {
        console.error('Error fetching orders:', error);
        toast.error('Failed to load order history');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [user.id]);

  // Get status icon and color
  const getStatusDisplay = (status) => {
    const statusConfig = {
      pending: {
        icon: FiClock,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        label: 'Pending'
      },
      preparing: {
        icon: FiClock,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        label: 'Preparing'
      },
      ready: {
        icon: FiCheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        label: 'Ready'
      },
      completed: {
        icon: FiCheckCircle,
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
        label: 'Completed'
      },
      cancelled: {
        icon: FiAlertCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        label: 'Cancelled'
      }
    };

    return statusConfig[status] || statusConfig.pending;
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (loading) {
    return <LoadingSpinner text="Loading order history..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* Simple Navigation Bar */}
      <div className="bg-white shadow-sm border-b border-gray-200 mb-6">
        <div className="flex items-center justify-between h-12 px-6">
          <div className="flex items-center space-x-2">
            <img
              src="/assets/logo.png"
              alt="Logo"
              className="w-8 h-8 object-contain"
            />
            <h1 className="text-lg font-semibold text-gray-900">Bakery Order History</h1>
            <BranchBadge />
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/bakery/create-order')}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors duration-200"
            >
              <FiShoppingCart className="w-4 h-4" />
              <span>Create Order</span>
            </button>
            <button
              onClick={() => navigate('/bakery/dashboard')}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
            >
              <FiHome className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Your Bakery Orders</h2>
            <p className="text-gray-600 mt-2">
              View all your bakery orders ({orders.length} total)
            </p>
          </div>
          <button
            onClick={() => navigate('/bakery/create-order')}
            className="btn-primary flex items-center space-x-2"
          >
            <FiPlus className="w-4 h-4" />
            <span>New Order</span>
          </button>
        </div>

        {/* Orders List */}
        {orders.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <FiClipboard className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No orders yet
            </h3>
            <p className="text-gray-600 mb-6">
              You haven't created any bakery orders yet. Start by creating your first order.
            </p>
            <button
              onClick={() => navigate('/bakery/create-order')}
              className="btn-primary flex items-center space-x-2 mx-auto"
            >
              <FiPlus className="w-4 h-4" />
              <span>Create First Order</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {orders.map((order) => {
              const statusDisplay = getStatusDisplay(order.status);
              const StatusIcon = statusDisplay.icon;

              return (
                <div key={order.id} className="card hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-full ${statusDisplay.bgColor}`}>
                        <StatusIcon className={`w-5 h-5 ${statusDisplay.color}`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Order #{order.id}
                        </h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <div className="flex items-center">
                            <FiCalendar className="w-4 h-4 mr-1" />
                            {formatDate(order.created_at)}
                          </div>
                          <div className="flex items-center">
                            <FiPackage className="w-4 h-4 mr-1" />
                            Customer: {order.customer_name || 'Walk-in'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                        {statusDisplay.label}
                      </div>
                      <div className="flex items-center mt-1 text-lg font-bold text-gray-900">
                        <FiDollarSign className="w-4 h-4" />
                        {parseFloat(order.total_amount).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Order Items */}
                  {order.items && order.items.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Order Items:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {order.items.map((item, index) => (
                          <div key={index} className="text-sm text-gray-600 bg-gray-50 rounded px-2 py-1">
                            <span className="font-medium">{item.quantity}x</span> {item.menu_item_name}
                            <span className="float-right">${parseFloat(item.subtotal).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {order.notes && (
                    <div className="border-t pt-4 mt-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-1">Notes:</h4>
                      <p className="text-sm text-gray-600">{order.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BakeryOrderHistory;
