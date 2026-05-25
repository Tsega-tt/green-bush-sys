import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import BranchBadge from '../../components/common/BranchBadge';
import {
  FiPackage,
  FiClipboard,
  FiClock,
  FiCheckCircle,
  FiPlus,
  FiUser,
  FiLogOut
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const BAKERY_DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Bakery Employee Dashboard Component
 * Focused on bakery operations and order management
 */
const BakeryEmployeeDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [attendanceStatus, setAttendanceStatus] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    bakeryMenu: [],
    pendingOrders: [],
    readyOrders: [],
    todayStats: {
      ordersCreated: 0,
      ordersCompleted: 0,
      totalRevenue: 0
    }
  });

  // Fetch dashboard data
  useEffect(() => {
    const CACHE_KEY = `bakery_dashboard_${user.id}_v1`;

    const loadCache = () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Number.isFinite(parsed.ts)) return null;
        if (Date.now() - parsed.ts > BAKERY_DASHBOARD_CACHE_TTL_MS) return null;
        return parsed.data || null;
      } catch {
        return null;
      }
    };

    const saveCache = (data) => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      } catch {
        // ignore cache write failures
      }
    };

    const fetchData = async () => {
      try {
        const cached = loadCache();
        if (cached) {
          setDashboardData(prev => ({
            ...prev,
            bakeryMenu: Array.isArray(cached.bakeryMenu) ? cached.bakeryMenu : [],
            pendingOrders: Array.isArray(cached.pendingOrders) ? cached.pendingOrders : [],
            readyOrders: Array.isArray(cached.readyOrders) ? cached.readyOrders : [],
            todayStats: cached.todayStats || prev.todayStats
          }));
          setAttendanceStatus(cached.attendanceStatus || null);
          setLoading(false);
        } else {
          setLoading(true);
        }

        const [
          menuResult,
          pendingResult,
          readyResult,
          allOrdersResult,
          attendanceResult
        ] = await Promise.allSettled([
          api.menu.getBakeryMenu(),
          api.orders.getPending({ type: 'bakery' }),
          api.orders.getReady({ type: 'bakery' }),
          api.orders.getAll({ type: 'bakery', employee_id: user.id }),
          api.attendance.getCurrentStatus(user.id)
        ]);

        let nextCachePayload = null;
        setDashboardData(prev => {
          const bakeryMenuRaw = menuResult?.status === 'fulfilled'
            ? (menuResult.value?.data?.data?.menuItems ?? menuResult.value?.data?.menuItems ?? [])
            : prev.bakeryMenu;

          const pendingOrdersRaw = pendingResult?.status === 'fulfilled'
            ? (pendingResult.value?.data?.data?.orders ?? pendingResult.value?.data?.orders ?? [])
            : prev.pendingOrders;

          const readyOrdersRaw = readyResult?.status === 'fulfilled'
            ? (readyResult.value?.data?.data?.orders ?? readyResult.value?.data?.orders ?? [])
            : prev.readyOrders;

          const allOrdersRaw = allOrdersResult?.status === 'fulfilled'
            ? (allOrdersResult.value?.data?.data?.orders ?? allOrdersResult.value?.data?.orders ?? [])
            : prev.pendingOrders.concat(prev.readyOrders);

          const bakeryMenu = Array.isArray(bakeryMenuRaw) ? bakeryMenuRaw : [];
          const pendingOrders = Array.isArray(pendingOrdersRaw) ? pendingOrdersRaw : [];
          const readyOrders = Array.isArray(readyOrdersRaw) ? readyOrdersRaw : [];
          const allOrders = Array.isArray(allOrdersRaw) ? allOrdersRaw : [];

          const today = new Date().toISOString().split('T')[0];
          const todayOrders = allOrders.filter(order => String(order?.created_at || '').startsWith(today));
          const todayCompleted = todayOrders.filter(order => order.status === 'completed');
          const todayRevenue = todayCompleted.reduce((sum, order) => sum + parseFloat(order?.total_amount || 0), 0);

          const next = {
            ...prev,
            bakeryMenu,
            pendingOrders,
            readyOrders,
            todayStats: {
              ordersCreated: todayOrders.length,
              ordersCompleted: todayCompleted.length,
              totalRevenue: todayRevenue
            }
          };

          nextCachePayload = {
            bakeryMenu: next.bakeryMenu,
            pendingOrders: next.pendingOrders,
            readyOrders: next.readyOrders,
            todayStats: next.todayStats,
            attendanceStatus: null
          };

          return next;
        });

        if (attendanceResult?.status === 'fulfilled') {
          const nextStatus = attendanceResult.value?.data?.data?.currentStatus || null;
          setAttendanceStatus(nextStatus);
          if (nextCachePayload) {
            nextCachePayload.attendanceStatus = nextStatus;
          }
        }

        if (nextCachePayload) {
          saveCache(nextCachePayload);
        }

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user.id]);

  // Handle attendance actions
  const handleClockIn = async () => {
    try {
      await api.attendance.clockIn({ user_id: user.id });
      toast.success('Clocked in successfully!');
      // Refresh attendance status
      const response = await api.attendance.getCurrentStatus(user.id);
      setAttendanceStatus(response.data.data.currentStatus);
    } catch (error) {
      console.error('Clock in error:', error);
    }
  };

  const handleClockOut = async () => {
    try {
      await api.attendance.clockOut({ user_id: user.id });
      toast.success('Clocked out successfully!');
      
      // Refresh data
      const [pendingResult, readyResult] = await Promise.allSettled([
        api.orders.getPending({ type: 'bakery' }),
        api.orders.getReady({ type: 'bakery' })
      ]);
      
      setDashboardData(prev => ({
        ...prev,
        pendingOrders: pendingResult?.status === 'fulfilled'
          ? (pendingResult.value?.data?.data?.orders ?? pendingResult.value?.data?.orders ?? prev.pendingOrders)
          : prev.pendingOrders,
        readyOrders: readyResult?.status === 'fulfilled'
          ? (readyResult.value?.data?.data?.orders ?? readyResult.value?.data?.orders ?? prev.readyOrders)
          : prev.readyOrders
      }));
    } catch (error) {
      console.error('Clock out error:', error);
    }
  };

  // Complete order and send to cashier
  const completeOrder = async (orderId) => {
    try {
      await api.orders.complete(orderId, { completed_by: user.id });
      toast.success('Order completed and sent to cashier for payment!');
      
      // Refresh data
      const [pendingResult, readyResult] = await Promise.allSettled([
        api.orders.getPending({ type: 'bakery' }),
        api.orders.getReady({ type: 'bakery' })
      ]);
      
      setDashboardData(prev => ({
        ...prev,
        pendingOrders: pendingResult?.status === 'fulfilled'
          ? (pendingResult.value?.data?.data?.orders ?? pendingResult.value?.data?.orders ?? prev.pendingOrders)
          : prev.pendingOrders,
        readyOrders: readyResult?.status === 'fulfilled'
          ? (readyResult.value?.data?.data?.orders ?? readyResult.value?.data?.orders ?? prev.readyOrders)
          : prev.readyOrders
      }));
    } catch (error) {
      console.error('Error completing order:', error);
      toast.error('Failed to complete order. Please try again.');
    }
  };

  // Mark order as ready
  const markOrderReady = async (orderId) => {
    try {
      await api.orders.markReady(orderId, { updated_by: user.id });
      toast.success('Order marked as ready!');
      
      // Refresh data
      const [pendingResult, readyResult] = await Promise.allSettled([
        api.orders.getPending({ type: 'bakery' }),
        api.orders.getReady({ type: 'bakery' })
      ]);
      
      setDashboardData(prev => ({
        ...prev,
        pendingOrders: pendingResult?.status === 'fulfilled'
          ? (pendingResult.value?.data?.data?.orders ?? pendingResult.value?.data?.orders ?? prev.pendingOrders)
          : prev.pendingOrders,
        readyOrders: readyResult?.status === 'fulfilled'
          ? (readyResult.value?.data?.data?.orders ?? readyResult.value?.data?.orders ?? prev.readyOrders)
          : prev.readyOrders
      }));
    } catch (error) {
      console.error('Error marking order ready:', error);
      toast.error('Failed to mark order ready. Please try again.');
    }
  };

  // Quick action handlers
  const handleCreateNewOrder = () => {
    navigate('/bakery/create-order');
  };

  const handleOrderHistory = () => {
    navigate('/bakery/order-history');
  };

  const handleMyProfile = () => {
    navigate('/bakery/profile');
  };

  // Handle logout
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return <LoadingSpinner text="Loading bakery dashboard..." />;
  }

  const statsCards = [
    {
      title: "Today's Orders",
      value: dashboardData.todayStats.ordersCreated,
      icon: FiClipboard,
      color: 'bg-blue-500'
    },
    {
      title: 'Completed Today',
      value: dashboardData.todayStats.ordersCompleted,
      icon: FiCheckCircle,
      color: 'bg-green-500'
    },
    {
      title: "Today's Revenue",
      value: `$${dashboardData.todayStats.totalRevenue.toFixed(2)}`,
      icon: FiPackage,
      color: 'bg-orange-500'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between h-16 px-6">
          <div className="flex items-center space-x-3">
            <img
              src="/assets/logo.png"
              alt="Logo"
              className="w-10 h-10 object-contain"
            />
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-semibold text-gray-900">
                  Bakery Dashboard
                </h1>
                <BranchBadge />
              </div>
              <p className="text-xs text-gray-500">
                Welcome, {user?.full_name}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Attendance Controls */}
            {attendanceStatus ? (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 bg-green-100 text-green-800 px-3 py-2 rounded-lg">
                  <FiClock className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Clocked in at {new Date(attendanceStatus.clock_in_time).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <button
                  onClick={handleClockOut}
                  className="btn-outline text-red-600 border-red-300 hover:bg-red-50"
                >
                  Clock Out
                </button>
              </div>
            ) : (
              <button
                onClick={handleClockIn}
                className="btn-primary flex items-center space-x-2"
              >
                <FiClock className="w-4 h-4" />
                <span>Clock In</span>
              </button>
            )}
            
            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
            >
              <FiLogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Welcome Section */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Bakery Operations
          </h2>
          <p className="text-gray-600">
            Manage your bakery orders and operations efficiently
          </p>
        </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statsCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div key={index} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
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

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Pending Orders
            </h3>
            <span className="badge badge-warning">
              {dashboardData.pendingOrders.length}
            </span>
          </div>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {dashboardData.pendingOrders.map((order) => (
              <div key={order.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-gray-900">
                      Order #{order.id}
                    </span>
                    <span className="text-sm text-gray-500">
                      Customer: {order.customer_id?.slice(0, 8)}...
                    </span>
                  </div>
                  <span className="text-lg font-bold text-green-600">
                    ${parseFloat(order.total_amount).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                  <button
                    onClick={() => markOrderReady(order.id)}
                    className="btn-primary text-sm py-1 px-3"
                  >
                    Mark Ready
                  </button>
                </div>
              </div>
            ))}
            {dashboardData.pendingOrders.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No pending orders
              </p>
            )}
          </div>
        </div>

        {/* Ready Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Ready for Pickup
            </h3>
            <span className="badge badge-success">
              {dashboardData.readyOrders.length}
            </span>
          </div>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {dashboardData.readyOrders.map((order) => (
              <div key={order.id} className="border border-gray-200 rounded-lg p-4 bg-green-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-gray-900">
                      Order #{order.id}
                    </span>
                    <span className="text-sm text-gray-500">
                      Customer: {order.customer_id?.slice(0, 8)}...
                    </span>
                  </div>
                  <span className="text-lg font-bold text-green-600">
                    ${parseFloat(order.total_amount).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Ready since: {new Date(order.updated_at).toLocaleString()}
                  </span>
                  <button
                    onClick={() => completeOrder(order.id)}
                    className="bg-green-500 hover:bg-green-600 text-white font-medium py-1 px-3 rounded-lg transition-colors duration-200 text-sm"
                  >
                    Complete & Send to Cashier
                  </button>
                </div>
              </div>
            ))}
            {dashboardData.readyOrders.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No orders ready for pickup
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">
            Quick Actions
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={handleCreateNewOrder}
            className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-colors"
          >
            <FiPlus className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">Create New Bakery Order</span>
          </button>
          <button 
            onClick={handleOrderHistory}
            className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-colors"
          >
            <FiClipboard className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">Order History</span>
          </button>
          <button 
            onClick={handleMyProfile}
            className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-colors"
          >
            <FiUser className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">My Profile</span>
          </button>
        </div>
      </div>
    </div>
    </div>
  );
};

export default BakeryEmployeeDashboard;
