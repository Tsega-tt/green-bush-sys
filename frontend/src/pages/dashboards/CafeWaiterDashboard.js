import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import BranchBadge from '../../components/common/BranchBadge';
import {
  FiCoffee,
  FiClipboard,
  FiClock,
  FiCheckCircle,
  FiUser,
  FiLogOut,
  FiShoppingCart,
  FiList,
  FiMapPin,
  FiDollarSign,
  FiSend
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Café Waiter Dashboard Component
 * Focused on table service and café operations
 */
const CafeWaiterDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [attendanceStatus, setAttendanceStatus] = useState(null);
  const [statsRange, setStatsRange] = useState('today');
  const [dashboardData, setDashboardData] = useState({
    cafeMenu: [],
    myOrders: [],
    todayStats: {
      ordersCreated: 0,
      ordersServed: 0,
      totalRevenue: 0,
      pendingBalance: 0
    }
  });

  const normalizeStatus = (s) => String(s || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .trim();

  // Fetch dashboard data
  useEffect(() => {
    const MENU_CACHE_KEY = 'waiter_dashboard_menu_v1';
    const ORDERS_CACHE_KEY = `waiter_dashboard_orders_${user.id}_v1`;
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    const loadCache = (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Number.isFinite(parsed.ts)) return null;
        if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
        return parsed.data;
      } catch {
        return null;
      }
    };

    const saveCache = (key, data) => {
      try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
      } catch {
        // ignore
      }
    };

    const fetchData = async () => {
      try {
        // Load cached data first for instant display
        const cachedMenu = loadCache(MENU_CACHE_KEY);
        const cachedOrders = loadCache(ORDERS_CACHE_KEY);
        
        if (cachedMenu || cachedOrders) {
          setLoading(false);
          if (cachedMenu) {
            setDashboardData(prev => ({ ...prev, cafeMenu: cachedMenu }));
          }
          if (cachedOrders) {
            setDashboardData(prev => ({ ...prev, myOrders: cachedOrders }));
          }
        } else {
          setLoading(true);
        }
        
        const [
          menuResult,
          myOrdersResult,
          attendanceResult
        ] = await Promise.allSettled([
          api.menu.getCafeMenu(),
          api.orders.getAll({ type: 'cafe', employee_id: user.id }),
          api.attendance.getCurrentStatus(user.id)
        ]);

        // Calculate today's stats
        const ordersRaw = myOrdersResult?.status === 'fulfilled'
          ? ((myOrdersResult.value?.data?.data?.orders) ?? (myOrdersResult.value?.data?.orders) ?? [])
          : (cachedOrders || []);
        const orders = Array.isArray(ordersRaw) ? ordersRaw : [];

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const todayOrders = orders.filter((order) => {
          const d = new Date(order.created_at);
          if (Number.isNaN(d.getTime())) return false;
          return d >= startOfDay && d <= endOfDay;
        });

        const todayServed = todayOrders.filter((order) => {
          const st = normalizeStatus(order.status);
          const pst = normalizeStatus(order.payment_status);
          return ['completed', 'paid'].includes(st) || pst === 'paid';
        });
        const todayRevenue = todayServed.reduce((sum, order) => sum + (parseFloat(order.total_amount) || 0), 0);

        const menuItemsRaw = menuResult?.status === 'fulfilled'
          ? ((menuResult.value?.data?.data?.menuItems) ?? (menuResult.value?.data?.menuItems) ?? [])
          : (cachedMenu || []);
        const menuItems = Array.isArray(menuItemsRaw) ? menuItemsRaw : [];

        // Save to cache
        saveCache(MENU_CACHE_KEY, menuItems);
        saveCache(ORDERS_CACHE_KEY, orders);

        setDashboardData({
          cafeMenu: menuItems,
          myOrders: orders,
          todayStats: {
            ordersCreated: todayOrders.length,
            ordersServed: todayServed.length,
            totalRevenue: todayRevenue
          }
        });
        if (attendanceResult?.status === 'fulfilled') {
          setAttendanceStatus(attendanceResult.value?.data?.data?.currentStatus || null);
        }

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 10000);
    return () => clearInterval(intervalId);
  }, [user.id]);

  useEffect(() => {
    const orders = Array.isArray(dashboardData.myOrders) ? dashboardData.myOrders : [];

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

    setDashboardData((prev) => ({
      ...prev,
      todayStats: {
        ordersCreated: rangeOrders.length,
        ordersServed: served.length,
        totalRevenue: revenue,
        pendingBalance
      }
    }));
  }, [statsRange, dashboardData.myOrders]);

  // Handle attendance actions
  const handleClockIn = async () => {
    try {
      await api.attendance.clockIn({ user_id: user.id });
      toast.success('Clocked in successfully!');
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
      setAttendanceStatus(null);
    } catch (error) {
      console.error('Clock out error:', error);
    }
  };

  // Quick action handlers
  const handleNewOrder = () => {
    navigate('/waiter/create-order');
  };

  const handleViewMenu = () => {
    navigate('/waiter/create-order');
  };

  const handleOrderHistory = () => {
    navigate('/waiter/order-history');
  };

  const handleMyProfile = () => {
    navigate('/waiter/profile');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return <LoadingSpinner text="Loading café dashboard..." />;
  }

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

  const statsCards = [
    {
      title: 'Orders',
      value: dashboardData.todayStats.ordersCreated,
      icon: FiClipboard,
      color: 'bg-blue-500'
    },
    {
      title: 'Orders Served',
      value: dashboardData.todayStats.ordersServed,
      icon: FiCheckCircle,
      color: 'bg-green-500'
    },
    {
      title: 'Revenue',
      value: `${dashboardData.todayStats.totalRevenue.toFixed(2)} Birr`,
      icon: FiCoffee,
      color: 'bg-purple-500'
    },
    {
      title: 'Pending Balance',
      value: `${(parseFloat(dashboardData.todayStats.pendingBalance) || 0).toFixed(2)} Birr`,
      icon: FiDollarSign,
      color: 'bg-orange-600'
    }
  ];

  const filteredRecentOrders = (() => {
    const orders = Array.isArray(dashboardData.myOrders) ? dashboardData.myOrders : [];
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

    return rangeOrders;
  })();

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
                  Café Dashboard
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
            Table Service Operations
          </h2>
          <p className="text-gray-600">
            Manage your table service and café orders efficiently
          </p>
        </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {statsCards.map((card, index) => {
          const Icon = card.icon;
          const isCredit = card.title === 'Pending Balance';
          return (
            <div key={index} className="card">
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

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        {/* My Recent Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              My Recent Orders
            </h3>
          </div>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {filteredRecentOrders
              .slice()
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((order) => (
                <div
                  key={order.id}
                  className={`border border-gray-200 rounded-lg p-4 relative ${(() => {
                    const st = normalizeStatus(order.status);
                    const isCanceled = st === 'deleted' || st === 'cancelled' || st === 'canceled';
                    return isCanceled ? 'text-red-700 line-through decoration-red-500 decoration-2' : '';
                  })()}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FiMapPin className="w-4 h-4 text-gray-600" />
                        <span className="font-semibold text-gray-900">
                          {order.table_number ? `Table ${order.table_number}` : 'Take Away'}
                        </span>
                        <span className="text-sm text-gray-500">
                          Order #{order.id}
                        </span>
                        {(() => {
                          const st = normalizeStatus(order.status);
                          const pst = normalizeStatus(order.payment_status);
                          const isCanceled = st === 'deleted' || st === 'cancelled' || st === 'canceled';
                          if (isCanceled) {
                            return (
                              <span className="text-sm font-semibold text-red-600">
                                Canceled
                              </span>
                            );
                          }
                          const displayStatus = pst === 'paid' ? 'paid' : (st || order.status);
                          const badgeClass = displayStatus === 'completed' || displayStatus === 'paid'
                            ? 'badge-success'
                            : displayStatus === 'ready'
                              ? 'badge-info'
                              : displayStatus === 'preparing'
                                ? 'badge-warning'
                                : 'badge';
                          return (
                            <span className={`badge ${badgeClass}`}>
                              {displayStatus}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {new Date(order.created_at).toLocaleString()} {Array.isArray(order.items) ? ` • ${order.items.length} items` : ''}
                      </div>
                      {Array.isArray(order.items) && order.items.length > 0 && (
                        <div className="text-sm text-gray-700 mt-1">
                          {formatOrderItemsPreview(order.items)}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold text-gray-900">
                        {(parseFloat(order.total_amount) || 0).toFixed(2)} Birr
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            {filteredRecentOrders.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No recent orders
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <button 
            onClick={handleNewOrder}
            className="flex flex-col items-center justify-center space-y-2 p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            <FiShoppingCart className="w-8 h-8" />
            <span className="font-medium">Create Order</span>
          </button>
          <button 
            onClick={handleOrderHistory}
            className="flex flex-col items-center justify-center space-y-2 p-6 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            <FiList className="w-8 h-8" />
            <span className="font-medium">Order History</span>
          </button>
          <button 
            onClick={handleViewMenu}
            className="flex flex-col items-center justify-center space-y-2 p-6 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            <FiCoffee className="w-8 h-8" />
            <span className="font-medium">View Menu</span>
          </button>
          <button 
            onClick={handleMyProfile}
            className="flex flex-col items-center justify-center space-y-2 p-6 bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            <FiUser className="w-8 h-8" />
            <span className="font-medium">My Profile</span>
          </button>
          <button 
            onClick={() => navigate('/dashboard/item-requests')}
            className="flex flex-col items-center justify-center space-y-2 p-6 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl hover:from-indigo-600 hover:to-indigo-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            <FiSend className="w-8 h-8" />
            <span className="font-medium">Item Requests</span>
          </button>
        </div>
      </div>

    </div>
    </div>
  );
};

export default CafeWaiterDashboard;
