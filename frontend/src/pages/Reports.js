import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  FiBarChart2,
  FiTrendingUp,
  FiDollarSign,
  FiUsers,
  FiCalendar,
  FiDownload,
  FiPieChart
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Reports Page Component
 * Admin interface for viewing business analytics and reports
 */
const Reports = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [businessUnit, setBusinessUnit] = useState('all');
  const [sourceData, setSourceData] = useState({
    orders: [],
    payments: [],
    menuItems: []
  });
  const [reportData, setReportData] = useState({
    dailyStats: {
      totalOrders: 0,
      paidOrders: 0,
      pendingOrders: 0,
      voidedOrders: 0,
      paidRevenue: 0,
      cafeOrders: 0,
      restaurantOrders: 0,
      baristaOrders: 0
    },
    weeklyStats: {
      totalOrders: 0,
      paidOrders: 0,
      pendingOrders: 0,
      voidedOrders: 0,
      paidRevenue: 0,
      avgPaidOrderValue: 0
    },
    monthlyStats: {
      totalOrders: 0,
      paidOrders: 0,
      pendingOrders: 0,
      voidedOrders: 0,
      paidRevenue: 0,
      growth: 0
    },
    topItems: [],
    recentOrders: [],
    paymentMethods: {}
  });

  const calculateReportData = useCallback((ordersRaw, paymentsRaw, menuItemsRaw, unitRaw) => {
    const unit = String(unitRaw || 'all').trim().toLowerCase() || 'all';
    const orders = Array.isArray(ordersRaw) ? ordersRaw : [];
    const payments = Array.isArray(paymentsRaw) ? paymentsRaw : [];
    const menuItems = Array.isArray(menuItemsRaw) ? menuItemsRaw : [];

    const normalizeStatus = (s) => String(s || '').trim().toLowerCase();
    const isVoidedOrderStatus = (s) => {
      const st = normalizeStatus(s);
      return ['deleted', 'canceled', 'cancelled', 'void', 'voided'].includes(st);
    };

    const menuMainCategoryById = {};
    menuItems.forEach((it) => {
      const id = it?.id != null ? parseInt(it.id, 10) : null;
      if (!Number.isFinite(id)) return;
      const main = String(it?.main_category || '').trim().toLowerCase();
      if (!main) return;
      menuMainCategoryById[id] = main;
    });

    const getItemDepartment = (item) => {
      const explicitType = String(item?.item_type || '').trim().toLowerCase();
      if (explicitType === 'beverage') return 'barista';

      const explicitMain = String(item?.main_category || '').trim().toLowerCase();
      if (explicitMain.includes('ጾም')) return 'restaurant';
      if (explicitMain === 'bakery') return 'cafe';
      if (explicitMain === 'cafe' || explicitMain === 'restaurant' || explicitMain === 'barista') return explicitMain;

      const menuId = item?.menu_item_id != null ? parseInt(item.menu_item_id, 10) : null;
      const mapped = Number.isFinite(menuId) ? String(menuMainCategoryById?.[menuId] || '').trim().toLowerCase() : '';
      if (mapped.includes('ጾም')) return 'restaurant';
      if (mapped === 'bakery') return 'cafe';
      if (mapped === 'cafe' || mapped === 'restaurant' || mapped === 'barista') return mapped;

      const cat = String(item?.category || item?.sub_category || '').trim().toLowerCase();
      const name = String(item?.menu_item_name || item?.name || '').trim().toLowerCase();
      if (cat.includes('ጾም') || name.includes('ጾም')) return 'restaurant';
      const beverageKeys = ['beverages', 'drinks', 'coffee', 'tea', 'juice', 'smoothie', 'water', 'soda', 'espresso', 'cappuccino', 'latte', 'americano'];
      if (beverageKeys.some((k) => cat.includes(k) || name.includes(k))) return 'barista';

      return null;
    };

    const getItemSubtotal = (it) => {
      const qty = parseInt(it?.quantity, 10) || 0;
      const subtotal = parseFloat(it?.subtotal);
      if (Number.isFinite(subtotal)) return subtotal;
      const unitPrice = parseFloat(it?.unit_price);
      if (Number.isFinite(unitPrice) && qty > 0) return unitPrice * qty;
      const price = parseFloat(it?.price);
      if (Number.isFinite(price) && qty > 0) return price * qty;
      return 0;
    };

    const getOrderSubtotalForUnit = (order, targetUnit) => {
      if (!order) return 0;
      const items = Array.isArray(order?.items) ? order.items : [];
      const orderFallback = String(order?.type || '').trim().toLowerCase();
      const fallbackDept = orderFallback === 'bakery' ? 'cafe' : (orderFallback || null);
      let subtotal = 0;
      for (const it of items) {
        const dept = getItemDepartment(it) || fallbackDept;
        if (targetUnit && targetUnit !== 'all' && dept !== targetUnit) continue;
        subtotal += getItemSubtotal(it);
      }
      if (!targetUnit || targetUnit === 'all') {
        const total = parseFloat(order?.total_amount);
        return Number.isFinite(total) ? total : subtotal;
      }
      return subtotal;
    };

    const normalizeId = (v) => (v == null ? null : String(v));
    const paidPayments = payments.filter((p) => normalizeStatus(p?.status) === 'paid');
    const paidOrderIdSet = new Set(paidPayments.map((p) => normalizeId(p?.order_id)).filter(Boolean));

    const isPaidOrder = (order) => {
      const oid = normalizeId(order?.id);
      if (oid && paidOrderIdSet.has(oid)) return true;
      const st = normalizeStatus(order?.status);
      const pst = normalizeStatus(order?.payment_status);
      return st === 'paid' || st === 'completed' || pst === 'paid';
    };

    const getDerivedStatus = (order) => {
      if (isVoidedOrderStatus(order?.status)) return 'voided';
      if (isPaidOrder(order)) return 'paid';
      return 'pending';
    };

    const orderMatchesUnit = (order) => {
      if (unit === 'all') return true;
      return getOrderSubtotalForUnit(order, unit) > 0;
    };

    const getOrderTotalForSelectedUnit = (order) => {
      if (!unit || unit === 'all') return getOrderSubtotalForUnit(order, 'all');
      return getOrderSubtotalForUnit(order, unit);
    };

    const now = new Date();
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    const within = (iso, from, to) => {
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) return false;
      return dt >= from && dt <= to;
    };

    const todayFrom = startOfDay(now);
    const todayTo = endOfDay(now);
    const weekFrom = new Date(todayFrom);
    weekFrom.setDate(weekFrom.getDate() - 6);
    const monthFrom = new Date(todayFrom);
    monthFrom.setDate(monthFrom.getDate() - 29);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const ordersToday = orders.filter((o) => within(o?.created_at, todayFrom, todayTo));
    const ordersWeek = orders.filter((o) => within(o?.created_at, weekFrom, todayTo));
    const ordersMonth = orders.filter((o) => within(o?.created_at, monthFrom, todayTo));

    const summarize = (list) => {
      const counts = { paid: 0, pending: 0, voided: 0 };
      const unitCounts = { cafe: 0, restaurant: 0, barista: 0 };
      let paidRevenue = 0;

      let considered = 0;
      for (const o of list) {
        if (!orderMatchesUnit(o)) continue;
        considered += 1;

        const status = getDerivedStatus(o);
        counts[status] = (counts[status] || 0) + 1;

        if (unit === 'all') {
          const cafeAmt = getOrderSubtotalForUnit(o, 'cafe');
          const restAmt = getOrderSubtotalForUnit(o, 'restaurant');
          const barAmt = getOrderSubtotalForUnit(o, 'barista');
          if (cafeAmt > 0) unitCounts.cafe += 1;
          if (restAmt > 0) unitCounts.restaurant += 1;
          if (barAmt > 0) unitCounts.barista += 1;
        }

        if (status === 'paid') {
          paidRevenue += getOrderTotalForSelectedUnit(o);
        }
      }

      if (unit !== 'all') {
        unitCounts.cafe = unit === 'cafe' ? considered : 0;
        unitCounts.restaurant = unit === 'restaurant' ? considered : 0;
        unitCounts.barista = unit === 'barista' ? considered : 0;
      }

      const nonVoidedTotal = considered - (counts.voided || 0);
      return {
        totalOrders: nonVoidedTotal,
        paidOrders: counts.paid || 0,
        pendingOrders: counts.pending || 0,
        voidedOrders: counts.voided || 0,
        paidRevenue,
        cafeOrders: unitCounts.cafe,
        restaurantOrders: unitCounts.restaurant,
        baristaOrders: unitCounts.barista
      };
    };

    const dailySummary = summarize(ordersToday);
    const weeklySummary = summarize(ordersWeek);
    const monthlySummary = summarize(ordersMonth);

    const avgPaidOrderValue = weeklySummary.paidOrders > 0
      ? weeklySummary.paidRevenue / weeklySummary.paidOrders
      : 0;

    const revenuePrevMonth = orders
      .filter((o) => within(o?.created_at, prevMonthStart, prevMonthEnd))
      .filter((o) => orderMatchesUnit(o))
      .filter((o) => getDerivedStatus(o) === 'paid')
      .reduce((sum, o) => sum + getOrderTotalForSelectedUnit(o), 0);

    const revenueThisMonth = orders
      .filter((o) => within(o?.created_at, monthStart, todayTo))
      .filter((o) => orderMatchesUnit(o))
      .filter((o) => getDerivedStatus(o) === 'paid')
      .reduce((sum, o) => sum + getOrderTotalForSelectedUnit(o), 0);

    const growthPct = revenuePrevMonth > 0
      ? ((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100
      : 0;

    const paymentMethods = paidPayments
      .filter((p) => {
        const oid = normalizeId(p?.order_id);
        if (!oid) return unit === 'all';
        const order = orders.find((o) => normalizeId(o?.id) === oid);
        if (!order) return unit === 'all';
        if (isVoidedOrderStatus(order?.status)) return false;
        return orderMatchesUnit(order);
      })
      .reduce((acc, payment) => {
        const method = String(payment?.payment_method || 'unknown').trim().toLowerCase();
        acc[method] = (acc[method] || 0) + 1;
        return acc;
      }, {});

    const topItemMap = new Map();
    orders
      .filter((o) => within(o?.created_at, weekFrom, todayTo))
      .filter((o) => orderMatchesUnit(o))
      .filter((o) => getDerivedStatus(o) === 'paid')
      .forEach((o) => {
        const items = Array.isArray(o?.items) ? o.items : [];
        items.forEach((it) => {
          if (unit !== 'all') {
            const dept = getItemDepartment(it) || null;
            if (dept && dept !== unit) return;
          }
          const name = String(it?.menu_item_name || it?.name || '').trim();
          if (!name) return;
          const qty = parseInt(it?.quantity, 10) || 0;
          const prev = topItemMap.get(name) || 0;
          topItemMap.set(name, prev + qty);
        });
      });
    const topItems = Array.from(topItemMap.entries())
      .map(([name, sold]) => ({ name, sold }))
      .sort((a, b) => (b.sold || 0) - (a.sold || 0))
      .slice(0, 5);

    const recentOrders = orders
      .slice()
      .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))
      .filter((o) => orderMatchesUnit(o))
      .slice(0, 10)
      .map((o) => ({
        ...o,
        derived_status: getDerivedStatus(o)
      }));

    return {
      dailyStats: dailySummary,
      weeklyStats: {
        ...weeklySummary,
        avgPaidOrderValue
      },
      monthlyStats: {
        ...monthlySummary,
        paidRevenue: monthlySummary.paidRevenue,
        growth: growthPct
      },
      topItems,
      recentOrders,
      paymentMethods
    };
  }, []);

  // Fetch report data
  useEffect(() => {
    const fetchReportData = async () => {
      try {
        setLoading(true);
        
        const [
          ordersResponse,
          paymentsResponse,
          menuResponse
        ] = await Promise.all([
          api.orders.getAll(),
          api.payments.getAll(),
          api.menu.getAll()
        ]);

        const orders = ordersResponse?.data?.data?.orders ?? ordersResponse?.data?.orders ?? [];
        const payments = paymentsResponse?.data?.data?.payments ?? paymentsResponse?.data?.payments ?? [];
        const menuItems = menuResponse?.data?.data?.menuItems ?? menuResponse?.data?.menuItems ?? [];

        setSourceData({
          orders: Array.isArray(orders) ? orders : [],
          payments: Array.isArray(payments) ? payments : [],
          menuItems: Array.isArray(menuItems) ? menuItems : []
        });

      } catch (error) {
        console.error('Error fetching report data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, []);

  useEffect(() => {
    setReportData(calculateReportData(sourceData.orders, sourceData.payments, sourceData.menuItems, businessUnit));
  }, [sourceData.orders, sourceData.payments, sourceData.menuItems, businessUnit, calculateReportData]);

  // Export report functionality
  const handleExportReport = () => {
    try {
      // Create CSV content
      const csvContent = generateCSVReport();
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `business-report-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Report exported successfully!');
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Failed to export report');
    }
  };

  // Generate CSV report content
  const generateCSVReport = () => {
    const headers = ['Metric', 'Value', 'Period'];
    const rows = [
      ['Total Orders Today', reportData.dailyStats.totalOrders, 'Daily'],
      ['Paid Revenue Today', `$${(reportData.dailyStats.paidRevenue || 0).toFixed(2)}`, 'Daily'],
      ['Paid Orders Today', reportData.dailyStats.paidOrders, 'Daily'],
      ['Pending Orders Today', reportData.dailyStats.pendingOrders, 'Daily'],
      ['Voided Orders Today', reportData.dailyStats.voidedOrders, 'Daily'],
      ['Cafe Orders Today', reportData.dailyStats.cafeOrders, 'Daily'],
      ['Restaurant Orders Today', reportData.dailyStats.restaurantOrders, 'Daily'],
      ['Barista Orders Today', reportData.dailyStats.baristaOrders, 'Daily'],
      ['Weekly Orders', reportData.weeklyStats.totalOrders, 'Weekly'],
      ['Weekly Paid Revenue', `$${(reportData.weeklyStats.paidRevenue || 0).toFixed(2)}`, 'Weekly'],
      ['Weekly Paid Orders', reportData.weeklyStats.paidOrders, 'Weekly'],
      ['Weekly Pending Orders', reportData.weeklyStats.pendingOrders, 'Weekly'],
      ['Weekly Avg Paid Order', `$${(reportData.weeklyStats.avgPaidOrderValue || 0).toFixed(2)}`, 'Weekly'],
      ['Monthly Orders', reportData.monthlyStats.totalOrders, 'Monthly'],
      ['Monthly Paid Revenue', `$${(reportData.monthlyStats.paidRevenue || 0).toFixed(2)}`, 'Monthly'],
      ['Monthly Growth', `${reportData.monthlyStats.growth}%`, 'Monthly']
    ];

    // Add payment methods data
    Object.entries(reportData.paymentMethods).forEach(([method, count]) => {
      rows.push([`Payment Method: ${method.replace('_', ' ')}`, count, 'All Time']);
    });

    // Convert to CSV format
    const csvRows = [headers, ...rows];
    return csvRows.map(row => row.map(field => `"${field}"`).join(',')).join('\n');
  };

  // Navigation handlers for report cards
  const handleInventoryReports = () => {
    navigate('/dashboard/inventory');
  };

  const handleCustomerAnalytics = () => {
    // Placeholder for future customer analytics page
    toast.info('Customer Analytics feature coming soon!');
  };

  const handlePerformanceMetrics = () => {
    navigate('/dashboard/performance');
  };

  // Generate new report
  const handleGenerateReport = async () => {
    try {
      toast.loading('Generating fresh report...');
      
      // Refetch all data
      const [
        ordersResponse,
        paymentsResponse,
        menuResponse
      ] = await Promise.all([
        api.orders.getAll(),
        api.payments.getAll(),
        api.menu.getAll()
      ]);

      const orders = ordersResponse?.data?.data?.orders ?? ordersResponse?.data?.orders ?? [];
      const payments = paymentsResponse?.data?.data?.payments ?? paymentsResponse?.data?.payments ?? [];
      const menuItems = menuResponse?.data?.data?.menuItems ?? menuResponse?.data?.menuItems ?? [];

      setSourceData({
        orders: Array.isArray(orders) ? orders : [],
        payments: Array.isArray(payments) ? payments : [],
        menuItems: Array.isArray(menuItems) ? menuItems : []
      });

      toast.dismiss();
      toast.success('Report generated successfully!');
    } catch (error) {
      console.error('Error generating report:', error);
      toast.dismiss();
      toast.error('Failed to generate report');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading reports..." />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Business Reports</h1>
          <p className="text-gray-600 mt-1">
            Analytics and insights for your business
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={businessUnit}
            onChange={(e) => setBusinessUnit(e.target.value)}
            className="input-field text-sm"
          >
            <option value="all">All</option>
            <option value="cafe">Cafe</option>
            <option value="restaurant">Restaurant</option>
            <option value="barista">Barista</option>
          </select>
          <button 
            onClick={handleExportReport}
            className="btn-outline flex items-center space-x-2"
          >
            <FiDownload className="w-4 h-4" />
            <span>Export Report</span>
          </button>
          <button 
            onClick={handleGenerateReport}
            className="btn-primary flex items-center space-x-2"
          >
            <FiBarChart2 className="w-4 h-4" />
            <span>Generate Report</span>
          </button>
        </div>
      </div>
      {/* Daily Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Today's Orders</p>
              <p className="text-2xl font-bold text-blue-600">
                {reportData.dailyStats.totalOrders}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Cafe: {reportData.dailyStats.cafeOrders} | Restaurant: {reportData.dailyStats.restaurantOrders} | Barista: {reportData.dailyStats.baristaOrders}
              </p>
            </div>
            <div className="p-3 rounded-full bg-blue-500">
              <FiBarChart2 className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Today's Revenue</p>
              <p className="text-2xl font-bold text-green-600">
                ${(reportData.dailyStats.paidRevenue || 0).toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Paid orders only</p>
            </div>
            <div className="p-3 rounded-full bg-green-500">
              <FiDollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Weekly Orders</p>
              <p className="text-2xl font-bold text-purple-600">
                {reportData.weeklyStats.totalOrders}
              </p>
              <p className="text-xs text-purple-500 mt-1">
                Avg paid: ${(reportData.weeklyStats.avgPaidOrderValue || 0).toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-full bg-purple-500">
              <FiTrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Monthly Growth</p>
              <p className="text-2xl font-bold text-orange-600">
                {`${(reportData.monthlyStats.growth || 0) >= 0 ? '+' : ''}${(reportData.monthlyStats.growth || 0).toFixed(1)}%`}
              </p>
              <p className="text-xs text-orange-500 mt-1">
                ${(reportData.monthlyStats.paidRevenue || 0).toFixed(2)} paid
              </p>
            </div>
            <div className="p-3 rounded-full bg-orange-500">
              <FiCalendar className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart Placeholder */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Revenue Trend
            </h3>
            <select className="input-field text-sm">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 3 months</option>
            </select>
          </div>
          <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-500">
              <FiBarChart2 className="w-12 h-12 mx-auto mb-2" />
              <p>Revenue Chart</p>
              <p className="text-sm">Chart visualization would go here</p>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Payment Methods
            </h3>
          </div>
          <div className="space-y-4">
            {Object.entries(reportData.paymentMethods).map(([method, count]) => (
              <div key={method} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-primary-500 rounded-full"></div>
                  <span className="text-sm font-medium text-gray-900 capitalize">
                    {method.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">{count}</span>
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-primary-500 h-2 rounded-full"
                      style={{ 
                        width: `${(count / Math.max(...Object.values(reportData.paymentMethods))) * 100}%` 
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders & Top Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Recent Orders
            </h3>
            <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              View All
            </button>
          </div>
          <div className="space-y-4">
            {reportData.recentOrders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900">
                      Order #{order.id}
                    </span>
                    <span className="badge badge-info">
                      {String(order.type || '').trim().toLowerCase() === 'bakery' ? 'cafe' : order.type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Waiter: {String(order?.employee_name || order?.waiter_name || '').trim() || (order?.employee_id != null ? `#${order.employee_id}` : '—')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    ${parseFloat(order.total_amount).toFixed(2)}
                  </p>
                  <span className={`badge ${
                    String(order?.derived_status || '').trim().toLowerCase() === 'paid' ? 'badge-success' :
                    String(order?.derived_status || '').trim().toLowerCase() === 'voided' ? 'badge-error' :
                    'badge-warning'
                  }`}>
                    {order.derived_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Menu Items */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Popular Menu Items
            </h3>
            <select className="input-field text-sm">
              <option>This week</option>
              <option>This month</option>
              <option>All time</option>
            </select>
          </div>
          <div className="space-y-4">
            {reportData.topItems.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">
                      {index + 1}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-600">Top selling item</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">
                    {item.sold} sold
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card text-center">
          <div className="p-6">
            <FiUsers className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Customer Analytics
            </h3>
            <p className="text-gray-600 text-sm">
              Track customer behavior and preferences
            </p>
            <button onClick={handleCustomerAnalytics} className="btn-outline mt-4">
              View Details
            </button>
          </div>
        </div>

        <div className="card text-center">
          <div className="p-6">
            <FiPieChart className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Inventory Reports
            </h3>
            <p className="text-gray-600 text-sm">
              Monitor stock levels and ingredient usage
            </p>
            <button onClick={handleInventoryReports} className="btn-outline mt-4">
              View Details
            </button>
          </div>
        </div>

        <div className="card text-center">
          <div className="p-6">
            <FiTrendingUp className="w-12 h-12 text-purple-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Performance Metrics
            </h3>
            <p className="text-gray-600 text-sm">
              Analyze business performance indicators
            </p>
            <button onClick={handlePerformanceMetrics} className="btn-outline mt-4">
              View Details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
