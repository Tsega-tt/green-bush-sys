import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useDashboardFilters } from '../../context/DashboardFilterContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import BranchBadge from '../../components/common/BranchBadge';
import {
  FiTrendingUp,
  FiTrendingDown,
  FiDollarSign,
  FiShoppingBag,
  FiUsers,
  FiCoffee,
  FiCalendar,
  FiArrowRight,
  FiRefreshCw,
  FiDownload,
  FiEye,
  FiStar,
  FiFilter,
  FiCheckCircle,
} from 'react-icons/fi';

import {
  FiClipboard,
  FiClock,
  FiCreditCard,
  FiActivity,
  FiLayers,
  FiSettings,
  FiBarChart2
} from "react-icons/fi";

const ADMIN_DASHBOARD_CACHE_KEY = 'admin_dashboard_v1';
const ADMIN_DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Admin Dashboard Component
 * Comprehensive overview for administrators
 */
const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { businessUnit, selectedMenuItemId } = useDashboardFilters();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('today');
  const [customMode, setCustomMode] = useState('single');
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dashboardData, setDashboardData] = useState({
    stats: {
      totalUsers: 0,
      totalMenuItems: 0,
      todayOrders: 0,
      todayRevenue: 0,
      allTimeRevenue: 0,
      ordersTotal: 0,
      paidTotal: 0,
      unpaidTotal: 0,
      paidDeletedOrdersTotal: 0,
      activeEmployees: 0,
      totalTables: 0,
      occupiedTables: 0
    },
    menuItems: [],
    allOrders: [],
    allPayments: [],
    recentOrders: [],
    recentPayments: [],
    todayAttendance: [],
    inventoryItems: []
  });

  // Fetch dashboard data
  useEffect(() => {
    const loadCache = () => {
      try {
        const raw = localStorage.getItem(ADMIN_DASHBOARD_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Number.isFinite(parsed.ts)) return null;
        if (Date.now() - parsed.ts > ADMIN_DASHBOARD_CACHE_TTL_MS) return null;
        return parsed.data || null;
      } catch {
        return null;
      }
    };

    const saveCache = (data) => {
      try {
        localStorage.setItem(ADMIN_DASHBOARD_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      } catch {
        // ignore cache write failures
      }
    };

    const getPayloadArray = (result, field) => {
      if (result?.status !== 'fulfilled') return null;
      const data = result.value?.data?.data?.[field] ?? result.value?.data?.[field];
      return Array.isArray(data) ? data : [];
    };

    const fetchDashboardData = async () => {
      try {
        const cached = loadCache();
        if (cached) {
          setDashboardData(cached);
          setLoading(false);
        } else {
          setLoading(true);
        }

        // Fetch all required data in parallel (partial success allowed)
        const [
          usersResult,
          menuResult,
          ordersResult,
          paymentsResult,
          attendanceResult,
          tablesResult,
          inventoryResult
        ] = await Promise.allSettled([
          api.users.getAll(),
          api.menu.getAll(),
          api.orders.getAll(),
          api.payments.getAll(),
          api.attendance.getTodayAttendance(),
          api.tables.getAll(),
          api.inventory.getAll()
        ]);

        const usersData = getPayloadArray(usersResult, 'users');
        const menuData = getPayloadArray(menuResult, 'menuItems');
        const ordersData = getPayloadArray(ordersResult, 'orders');
        const paymentsData = getPayloadArray(paymentsResult, 'payments');
        const attendanceData = getPayloadArray(attendanceResult, 'attendance');
        const tablesData = getPayloadArray(tablesResult, 'tables');
        const inventoryData = getPayloadArray(inventoryResult, 'inventory') || getPayloadArray(inventoryResult, 'items');

        setDashboardData((prev) => {
          const normalizeId = (v) => (v == null ? null : String(v));
          const isVoidedOrderStatus = (s) => {
            const st = String(s || '').trim().toLowerCase();
            return ['deleted', 'canceled', 'cancelled', 'void', 'voided'].includes(st);
          };

          const isPaidPaymentStatus = (s) => String(s || '').trim().toLowerCase() === 'paid';
          const dedupePaidPaymentsByOrder = (payments) => {
            const list = Array.isArray(payments) ? payments : [];
            const byOrder = new Map();
            const standalone = [];

            for (const p of list) {
              const orderKey = normalizeId(p?.order_id);
              if (!orderKey) {
                standalone.push(p);
                continue;
              }

              const prevP = byOrder.get(orderKey);
              if (!prevP) {
                byOrder.set(orderKey, p);
                continue;
              }

              const prevTs = new Date(prevP?.created_at || prevP?.updated_at || 0).getTime();
              const nextTs = new Date(p?.created_at || p?.updated_at || 0).getTime();
              if (nextTs >= prevTs) byOrder.set(orderKey, p);
            }

            return [...byOrder.values(), ...standalone];
          };

          const today = new Date().toISOString().split('T')[0];

          const allOrdersSafe = Array.isArray(ordersData) ? ordersData : null;
          const allPaymentsSafe = Array.isArray(paymentsData) ? paymentsData : null;

          const validOrders = Array.isArray(allOrdersSafe)
            ? allOrdersSafe.filter((o) => !isVoidedOrderStatus(o?.status))
            : null;

          const invalidOrderIdSet = Array.isArray(allOrdersSafe)
            ? new Set(allOrdersSafe.filter((o) => isVoidedOrderStatus(o?.status)).map((o) => normalizeId(o?.id)).filter(Boolean))
            : new Set();

          const paidPayments = Array.isArray(allPaymentsSafe)
            ? allPaymentsSafe
                .filter((p) => isPaidPaymentStatus(p?.status))
                .filter((p) => {
                  const oid = normalizeId(p?.order_id);
                  if (!oid) return true;
                  return !invalidOrderIdSet.has(oid);
                })
            : null;

          const paidPaymentsDeduped = Array.isArray(paidPayments)
            ? dedupePaidPaymentsByOrder(paidPayments)
            : null;

          const todayOrders = Array.isArray(validOrders)
            ? validOrders.filter((order) => String(order?.created_at || '').startsWith(today))
            : null;

          const todayPaidPayments = Array.isArray(paidPaymentsDeduped)
            ? paidPaymentsDeduped.filter((p) => String(p?.created_at || '').startsWith(today))
            : null;

          const todayRevenue = Array.isArray(todayPaidPayments)
            ? todayPaidPayments.reduce((sum, payment) => sum + (parseFloat(payment?.amount || 0) || 0), 0)
            : prev.stats.todayRevenue;

          const ordersTotal = Array.isArray(validOrders)
            ? validOrders.reduce((sum, order) => sum + (parseFloat(order?.total_amount || 0) || 0), 0)
            : prev.stats.ordersTotal;

          const paidTotal = Array.isArray(paidPaymentsDeduped)
            ? paidPaymentsDeduped.reduce((sum, payment) => sum + (parseFloat(payment?.amount || 0) || 0), 0)
            : prev.stats.paidTotal;

          const paidOrderIdSet = Array.isArray(paidPaymentsDeduped)
            ? new Set(paidPaymentsDeduped.map((p) => normalizeId(p?.order_id)).filter(Boolean))
            : new Set();

          const paidDeletedOrdersTotal = Array.isArray(allOrdersSafe)
            ? allOrdersSafe
                .filter((o) => {
                  const oid = normalizeId(o?.id);
                  const status = String(o?.status || '').trim().toLowerCase();
                  const paymentStatus = String(o?.payment_status || '').trim().toLowerCase();
                  if (isVoidedOrderStatus(status)) return true;
                  if (status === 'paid' || paymentStatus === 'paid') return true;
                  if (oid && paidOrderIdSet.has(oid)) return true;
                  return false;
                })
                .reduce((sum, order) => sum + (parseFloat(order?.total_amount || 0) || 0), 0)
            : prev.stats.paidDeletedOrdersTotal;

          const unpaidTotal = Array.isArray(validOrders)
            ? validOrders
                .filter((o) => {
                  const status = String(o?.status || '').trim().toLowerCase();
                  const paymentStatus = String(o?.payment_status || '').trim().toLowerCase();
                  if (status === 'paid' || paymentStatus === 'paid') return false;
                  return !paidOrderIdSet.has(normalizeId(o?.id));
                })
                .reduce((sum, order) => sum + (parseFloat(order?.total_amount || 0) || 0), 0)
            : prev.stats.unpaidTotal;

          const allTimeRevenue = paidTotal;

          const recentOrders = Array.isArray(validOrders)
            ? validOrders
              .slice()
              .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))
              .slice(0, 5)
            : prev.recentOrders;

          const recentPayments = Array.isArray(paidPayments)
            ? (Array.isArray(paidPaymentsDeduped) ? paidPaymentsDeduped : paidPayments)
              .slice()
              .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))
              .slice(0, 5)
            : prev.recentPayments;

          const next = {
            stats: {
              totalUsers: Array.isArray(usersData) ? usersData.length : prev.stats.totalUsers,
              totalMenuItems: Array.isArray(menuData) ? menuData.length : prev.stats.totalMenuItems,
              todayOrders: Array.isArray(todayOrders) ? todayOrders.length : prev.stats.todayOrders,
              todayRevenue,
              allTimeRevenue,
              ordersTotal,
              paidTotal,
              unpaidTotal,
              paidDeletedOrdersTotal,
              activeEmployees: Array.isArray(attendanceData) ? attendanceData.length : prev.stats.activeEmployees,
              totalTables: Array.isArray(tablesData) ? tablesData.length : prev.stats.totalTables,
              occupiedTables: Array.isArray(tablesData)
                ? tablesData.filter(t => t.status === 'occupied').length
                : prev.stats.occupiedTables
            },
            menuItems: Array.isArray(menuData) ? menuData : prev.menuItems,
            allOrders: Array.isArray(ordersData) ? ordersData : prev.allOrders,
            allPayments: Array.isArray(paymentsData) ? paymentsData : prev.allPayments,
            recentOrders,
            recentPayments,
            todayAttendance: Array.isArray(attendanceData) ? attendanceData : prev.todayAttendance,
            inventoryItems: Array.isArray(inventoryData) ? inventoryData : prev.inventoryItems
          };

          saveCache(next);
          return next;
        });

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return <LoadingSpinner text="Loading dashboard..." />;
  }

  const formatCurrency = (value) => {
    const n = parseFloat(value);
    const safe = Number.isFinite(n) ? n : 0;
    return `$${safe.toFixed(2)}`;
  };

  const timeRangeLabel = (() => {
    switch (timeRange) {
      case 'today':
        return 'Today';
      case 'week':
        return 'Week';
      case 'month':
        return 'Month';
      case 'custom':
        return 'Custom';
      case 'all':
      default:
        return 'All';
    }
  })();

  const getDateRangeForFilter = () => {
    if (timeRange === 'all') return { from: null, to: null };

    const now = new Date();
    const todayFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (timeRange === 'today') return { from: todayFrom, to: todayTo };

    if (timeRange === 'week') {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      return { from, to: now };
    }

    if (timeRange === 'month') {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      return { from, to: now };
    }

    if (timeRange === 'custom') {
      const parseYmd = (ymd) => {
        if (!ymd || typeof ymd !== 'string') return null;
        const parts = ymd.split('-');
        if (parts.length !== 3) return null;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
        return { y, m, d };
      };

      const startOfDay = (ymd) => {
        const p = parseYmd(ymd);
        if (!p) return null;
        return new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0);
      };

      const endOfDay = (ymd) => {
        const p = parseYmd(ymd);
        if (!p) return null;
        return new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999);
      };

      if (customMode === 'single') {
        const from = startOfDay(customDate);
        const to = endOfDay(customDate);
        return from && to ? { from, to } : { from: null, to: null };
      }

      const selectedFrom = startOfDay(customStartDate);
      const selectedTo = endOfDay(customEndDate);
      if (!selectedFrom || !selectedTo) return { from: null, to: null };

      // Ensure from is before to
      const from = selectedFrom <= selectedTo ? selectedFrom : selectedTo;
      const to = selectedFrom <= selectedTo ? selectedTo : selectedFrom;

      return { from, to };
    }

    return { from: null, to: null };
  };

  const customRangeText = (() => {
    if (timeRange !== 'custom') return '';
    const parseYmdAsLocalDate = (ymd) => {
      if (!ymd || typeof ymd !== 'string') return null;
      const parts = ymd.split('-');
      if (parts.length !== 3) return null;
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
      return new Date(y, m - 1, d);
    };
    if (customMode === 'single') {
      const d = parseYmdAsLocalDate(customDate);
      if (!d || Number.isNaN(d.getTime())) return '';
      const today = new Date();
      const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (d0.getTime() === today0.getTime()) return 'Today';
      return d.toLocaleDateString();
    }

    const dStart = parseYmdAsLocalDate(customStartDate);
    const dEnd = parseYmdAsLocalDate(customEndDate);

    if (!dStart || Number.isNaN(dStart.getTime()) || !dEnd || Number.isNaN(dEnd.getTime())) return '';

    const startObj = dStart <= dEnd ? dStart : dEnd;
    const endObj = dStart <= dEnd ? dEnd : dStart;

    if (startObj.getTime() === endObj.getTime()) {
      const today = new Date();
      const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const start0 = new Date(startObj.getFullYear(), startObj.getMonth(), startObj.getDate());
      if (start0.getTime() === today0.getTime()) return 'Today';
      return startObj.toLocaleDateString();
    }

    return `${startObj.toLocaleDateString()} → ${endObj.toLocaleDateString()}`;
  })();

  const withinRange = (createdAt) => {
    if (timeRange === 'all') return true;
    const date = createdAt ? new Date(createdAt) : null;
    if (!date || Number.isNaN(date.getTime())) return false;

    const { from, to } = getDateRangeForFilter();
    if (from && to) return date >= from && date <= to;
    return false;
  };

  const normalizeId = (v) => (v == null ? null : String(v));
  const isVoidedOrderStatus = (s) => {
    const st = String(s || '').trim().toLowerCase();
    return ['deleted', 'canceled', 'cancelled', 'void', 'voided'].includes(st);
  };
  const isPaidPaymentStatus = (s) => String(s || '').trim().toLowerCase() === 'paid';

  const menuItemsSafe = Array.isArray(dashboardData.menuItems) ? dashboardData.menuItems : [];
  const menuMainCategoryById = (() => {
    const next = {};
    for (const it of menuItemsSafe) {
      const id = it?.id != null ? parseInt(it.id, 10) : null;
      if (!Number.isFinite(id)) continue;
      const main = String(it?.main_category || '').trim().toLowerCase();
      if (!main) continue;
      next[id] = main;
    }
    return next;
  })();

  const getItemSubtotalBirr = (item) => {
    const qty = parseInt(item?.quantity, 10) || 0;
    const subtotal = parseFloat(item?.subtotal);
    if (Number.isFinite(subtotal)) return subtotal;
    const unitPrice = parseFloat(item?.unit_price);
    if (Number.isFinite(unitPrice) && qty > 0) return unitPrice * qty;
    const price = parseFloat(item?.price);
    if (Number.isFinite(price) && qty > 0) return price * qty;
    return 0;
  };

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

  const getOrderSubtotalForUnit = (order, unit) => {
    if (!order) return 0;
    if (!unit || unit === 'all') {
      const total = parseFloat(order?.total_amount);
      return Number.isFinite(total) ? total : 0;
    }
    const itemsRaw = Array.isArray(order?.items) ? order.items : [];
    const orderFallback = String(order?.type || '').trim().toLowerCase();
    const fallbackDept = orderFallback === 'bakery' ? 'cafe' : (orderFallback || null);
    let subtotal = 0;
    for (const it of itemsRaw) {
      const dept = getItemDepartment(it) || fallbackDept;
      if (dept !== unit) continue;
      subtotal += getItemSubtotalBirr(it);
    }
    return subtotal;
  };

  const getOrderSubtotalForUnitAndMenuItem = (order, unit, menuItemId) => {
    if (!order) return 0;

    const targetMenuItemId = (menuItemId && menuItemId !== 'all') ? parseInt(menuItemId, 10) : null;

    const itemsRaw = Array.isArray(order?.items) ? order.items : [];
    const orderFallback = String(order?.type || '').trim().toLowerCase();
    const fallbackDept = orderFallback === 'bakery' ? 'cafe' : (orderFallback || null);

    let subtotal = 0;
    for (const it of itemsRaw) {
      const dept = getItemDepartment(it) || fallbackDept;
      if (unit && unit !== 'all' && dept !== unit) continue;
      if (Number.isFinite(targetMenuItemId)) {
        const mid = it?.menu_item_id != null ? parseInt(it.menu_item_id, 10) : null;
        if (!Number.isFinite(mid) || mid !== targetMenuItemId) continue;
      }
      subtotal += getItemSubtotalBirr(it);
    }

    if ((!unit || unit === 'all') && (!Number.isFinite(targetMenuItemId))) {
      const total = parseFloat(order?.total_amount);
      return Number.isFinite(total) ? total : subtotal;
    }

    return subtotal;
  };

  const getPaymentAmountForUnit = (payment, unit, orderByIdMap) => {
    if (!payment) return 0;
    if (!unit || unit === 'all') {
      const amt = parseFloat(payment?.amount);
      return Number.isFinite(amt) ? amt : 0;
    }
    const oid = payment?.order_id != null ? parseInt(payment.order_id, 10) : null;
    if (!Number.isFinite(oid)) return 0;
    const order = orderByIdMap.get(String(oid)) || null;
    if (!order) return 0;
    return getOrderSubtotalForUnit(order, unit);
  };

  const getPaymentAmountForSelection = (payment, unit, menuItemId, orderByIdMap) => {
    if (!payment) return 0;
    if (!menuItemId || menuItemId === 'all') return getPaymentAmountForUnit(payment, unit, orderByIdMap);

    const oid = payment?.order_id != null ? parseInt(payment.order_id, 10) : null;
    if (!Number.isFinite(oid)) return 0;
    const order = orderByIdMap.get(String(oid)) || null;
    if (!order) return 0;

    const normalizedUnit = unit === 'all' ? null : unit;
    return getOrderSubtotalForUnitAndMenuItem(order, normalizedUnit, menuItemId);
  };

  const allOrdersSafe = Array.isArray(dashboardData.allOrders) ? dashboardData.allOrders : [];
  const allPaymentsSafe = Array.isArray(dashboardData.allPayments) ? dashboardData.allPayments : [];

  const orderById = (() => {
    const map = new Map();
    for (const o of allOrdersSafe) {
      if (!o?.id) continue;
      map.set(String(o.id), o);
    }
    return map;
  })();

  const invalidOrderIdSet = new Set(
    allOrdersSafe
      .filter((o) => isVoidedOrderStatus(o?.status))
      .map((o) => normalizeId(o?.id))
      .filter(Boolean)
  );

  const ordersInRangeRaw = allOrdersSafe.filter(
    (o) => withinRange(o?.created_at) && !isVoidedOrderStatus(o?.status)
  );

  const orderMatchesBusinessUnit = (order) => {
    if (businessUnit === 'all' && selectedMenuItemId === 'all') return true;
    if (selectedMenuItemId !== 'all') {
      return getOrderSubtotalForUnitAndMenuItem(order, businessUnit, selectedMenuItemId) > 0;
    }
    if (businessUnit === 'all') return true;
    return getOrderSubtotalForUnit(order, businessUnit) > 0;
  };

  const ordersInRange = ordersInRangeRaw.filter(orderMatchesBusinessUnit);

  const ordersInRangeAllStatuses = allOrdersSafe
    .filter((o) => withinRange(o?.created_at))
    .filter(orderMatchesBusinessUnit);

  const paymentsInRange = allPaymentsSafe.filter((p) => {
    if (!withinRange(p?.created_at)) return false;
    if (!isPaidPaymentStatus(p?.status)) return false;
    const oid = normalizeId(p?.order_id);
    if (!oid) return true;
    return !invalidOrderIdSet.has(oid);
  });

  const dedupePaidPaymentsByOrder = (payments) => {
    const list = Array.isArray(payments) ? payments : [];
    const byOrder = new Map();
    const standalone = [];

    for (const p of list) {
      const orderKey = normalizeId(p?.order_id);
      if (!orderKey) {
        standalone.push(p);
        continue;
      }

      const prevP = byOrder.get(orderKey);
      if (!prevP) {
        byOrder.set(orderKey, p);
        continue;
      }

      const prevTs = new Date(prevP?.created_at || prevP?.updated_at || 0).getTime();
      const nextTs = new Date(p?.created_at || p?.updated_at || 0).getTime();
      if (nextTs >= prevTs) byOrder.set(orderKey, p);
    }

    return [...byOrder.values(), ...standalone];
  };

  const paymentsInRangeDeduped = dedupePaidPaymentsByOrder(paymentsInRange);

  const paymentsInRangeDedupedFiltered = paymentsInRangeDeduped
    .filter((p) => getPaymentAmountForSelection(p, businessUnit, selectedMenuItemId, orderById) > 0);

  const recentOrdersInRange = ordersInRange
    .slice()
    .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))
    .slice(0, 5);

  const recentPaymentsInRange = paymentsInRangeDedupedFiltered
    .slice()
    .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))
    .slice(0, 5);

  const rangeOrdersTotal = ordersInRange.reduce((sum, order) => sum + getOrderSubtotalForUnitAndMenuItem(order, businessUnit, selectedMenuItemId), 0);
  const rangePaidTotal = paymentsInRangeDedupedFiltered.reduce((sum, payment) => sum + getPaymentAmountForSelection(payment, businessUnit, selectedMenuItemId, orderById), 0);
  const rangePaidOrderIdSet = new Set(paymentsInRangeDeduped.map((p) => normalizeId(p?.order_id)).filter(Boolean));
  const rangeUnpaidTotal = ordersInRange
    .filter((o) => {
      const status = String(o?.status || '').trim().toLowerCase();
      const paymentStatus = String(o?.payment_status || '').trim().toLowerCase();
      if (status === 'paid' || paymentStatus === 'paid') return false;
      const oid = normalizeId(o?.id);
      if (!oid) return true;
      return !rangePaidOrderIdSet.has(oid);
    })
    .reduce((sum, order) => sum + getOrderSubtotalForUnitAndMenuItem(order, businessUnit, selectedMenuItemId), 0);

  const rangePaidDeletedOrdersTotal = ordersInRangeAllStatuses
    .filter((o) => {
      const oid = normalizeId(o?.id);
      const status = String(o?.status || '').trim().toLowerCase();
      const paymentStatus = String(o?.payment_status || '').trim().toLowerCase();
      if (isVoidedOrderStatus(status)) return true;
      if (status === 'paid' || paymentStatus === 'paid') return true;
      if (oid && rangePaidOrderIdSet.has(oid)) return true;
      return false;
    })
    .reduce((sum, order) => sum + getOrderSubtotalForUnitAndMenuItem(order, businessUnit, selectedMenuItemId), 0);

  const useGlobalTotals = businessUnit === 'all' && selectedMenuItemId === 'all';

  // Stats cards data
  const statsCards = [
    {
      title: 'Total Users',
      value: dashboardData.stats.totalUsers,
      icon: FiUsers,
      color: 'bg-blue-500',
      textColor: 'text-blue-600'
    },
    {
      title: 'Menu Items',
      value: dashboardData.stats.totalMenuItems,
      icon: FiShoppingBag,
      color: 'bg-green-500',
      textColor: 'text-green-600'
    },
    {
      title: timeRange === 'today' ? "Today's Orders" : timeRange === 'all' ? 'Total Orders' : `${timeRangeLabel} Orders`,
      value: ordersInRange.length,
      icon: FiClipboard,
      color: 'bg-orange-500',
      textColor: 'text-orange-600'
    },
    {
      title: timeRange === 'today'
        ? "Today's Revenue"
        : timeRange === 'all'
          ? 'Total Revenue'
          : `${timeRangeLabel} Revenue`,
      value: timeRange === 'today'
        ? formatCurrency(useGlobalTotals ? dashboardData.stats.todayRevenue : rangePaidTotal)
        : timeRange === 'all'
          ? formatCurrency(dashboardData.stats.allTimeRevenue)
          : formatCurrency(rangePaidTotal),
      icon: FiDollarSign,
      color: 'bg-purple-500',
      textColor: 'text-purple-600'
    },
    {
      title: 'Active Employees',
      value: dashboardData.stats.activeEmployees,
      icon: FiClock,
      color: 'bg-red-500',
      textColor: 'text-red-600'
    },
    {
      title: 'All Time Revenue',
      value: formatCurrency(useGlobalTotals ? dashboardData.stats.allTimeRevenue : (timeRange === 'all' ? rangePaidTotal : dashboardData.stats.allTimeRevenue)),
      icon: FiTrendingUp,
      color: 'bg-indigo-500',
      textColor: 'text-indigo-600'
    },
    {
      title: 'Orders Total',
      value: formatCurrency(timeRange === 'all' && useGlobalTotals ? dashboardData.stats.ordersTotal : rangeOrdersTotal),
      icon: FiClipboard,
      color: 'bg-gray-700',
      textColor: 'text-gray-800'
    },
    {
      title: 'Paid Total',
      value: formatCurrency(timeRange === 'all' && useGlobalTotals ? dashboardData.stats.paidTotal : rangePaidTotal),
      icon: FiCreditCard,
      color: 'bg-emerald-500',
      textColor: 'text-emerald-600'
    },
    {
      title: 'Unpaid Total',
      value: formatCurrency(timeRange === 'all' && useGlobalTotals ? dashboardData.stats.unpaidTotal : rangeUnpaidTotal),
      icon: FiActivity,
      color: 'bg-rose-500',
      textColor: 'text-rose-600'
    },
    {
      title: 'Paid + Deleted Total',
      value: formatCurrency(timeRange === 'all' && useGlobalTotals ? dashboardData.stats.paidDeletedOrdersTotal : rangePaidDeletedOrdersTotal),
      icon: FiLayers,
      color: 'bg-teal-500',
      textColor: 'text-teal-600'
    }
  ];

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // Navigation handlers for management pages
  const handleUserManagement = () => {
    navigate('/dashboard/users');
  };

  const handleMenuManagement = () => {
    navigate('/dashboard/menu');
  };

  const handleOrderManagement = () => {
    navigate('/dashboard/orders');
  };

  const handlePaymentManagement = () => {
    navigate('/dashboard/payments');
  };

  const handleAttendanceManagement = () => {
    navigate('/dashboard/attendance');
  };

  const handleReports = () => {
    navigate('/dashboard/reports');
  };

  const handleProfile = () => {
    navigate('/dashboard/profile');
  };

  const handleTableManagement = () => {
    navigate('/dashboard/tables');
  };

  const handleInventory = () => {
    navigate('/dashboard/inventory');
  };

  const handleEmployeeManagement = () => {
    navigate('/dashboard/employees');
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 bg-gray-50/50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-2xl shadow-soft border border-gray-100/50">
        <div className="flex items-center space-x-3 md:space-x-4">
          <div className="bg-primary-50 p-2 md:p-3 rounded-2xl shadow-sm">
            <img
              src="/assets/logo.png"
              alt="Logo"
              className="w-10 h-10 md:w-12 md:h-12 object-contain"
            />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-gray-900 tracking-tight">
                Welcome back, <span className="text-primary-600">{user?.full_name}</span>!
              </h1>
              <BranchBadge />
            </div>
            <p className="text-xs md:text-sm lg:text-base text-gray-500 font-medium flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Here's what's happening at your business today.
            </p>
          </div>
        </div>
        <div className="flex items-center px-3 md:px-4 py-2 bg-gray-50 rounded-xl border border-gray-100 text-xs md:text-sm font-semibold text-gray-600 shadow-sm transition-all hover:shadow-md self-start md:self-auto">
          <FiCalendar className="w-3 md:w-4 h-3 md:h-4 mr-2 text-primary-500" />
          <span className="hidden sm:inline">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span className="sm:hidden">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6">
        {statsCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div key={index} className="bg-white p-4 md:p-6 rounded-2xl shadow-soft border border-gray-100/50 hover:border-primary-200 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 bg-primary-50/30 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                    {card.title}
                  </p>
                  <p className="text-xl md:text-2xl font-bold text-gray-900 group-hover:text-primary-600 transition-colors">
                    {card.value}
                  </p>
                </div>
                <div className={`p-3 md:p-4 rounded-2xl ${card.color} shadow-lg shadow-${card.color.split('-')[1]}-200/50`}>
                  <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end items-center sticky top-0 z-30 py-4 -mt-4 bg-gray-50/80 backdrop-blur-md px-2 rounded-xl">
        <div className="flex flex-col md:flex-row items-end md:items-center gap-4 w-full md:w-auto">
          <div className="flex flex-wrap items-center bg-white p-1.5 rounded-2xl shadow-soft border border-gray-100 gap-1 w-full md:w-auto">
            {[
              { key: 'all', label: 'All', icon: FiLayers },
              { key: 'today', label: 'Today', icon: FiStar },
              { key: 'week', label: 'Week', icon: FiCalendar },
              { key: 'month', label: 'Month', icon: FiFilter },
              { key: 'custom', label: 'Custom', icon: FiSettings }
            ].map((opt) => {
              const OptIcon = opt.icon;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTimeRange(opt.key)}
                  className={`flex items-center px-3 md:px-5 py-2 md:py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all flex-1 md:flex-none justify-center ${timeRange === opt.key
                    ? 'bg-primary-500 text-white shadow-lg shadow-primary-200'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  <OptIcon className={`w-3 md:w-4 h-3 md:h-4 mr-1 md:mr-2 ${timeRange === opt.key ? 'text-white' : 'text-gray-400'}`} />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {timeRange === 'custom' && (
            <div className="bg-white/70 backdrop-blur-xl border border-white/50 shadow-soft p-4 rounded-2xl animate-slide-up ring-1 ring-black/5">
              <div className="flex flex-col gap-4">
                <div className="flex bg-gray-100/50 p-1 rounded-xl border border-gray-200/50">
                  <button
                    type="button"
                    onClick={() => setCustomMode('single')}
                    className={`flex-1 flex items-center justify-center px-4 py-2 text-xs font-bold rounded-lg transition-all ${customMode === 'single'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    <FiCalendar className="w-3.5 h-3.5 mr-1.5" />
                    Specific Date
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomMode('date_range')}
                    className={`flex-1 flex items-center justify-center px-4 py-2 text-xs font-bold rounded-lg transition-all ${customMode === 'date_range'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    <FiTrendingUp className="w-3.5 h-3.5 mr-1.5" />
                    Date Range
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {customMode === 'single' ? (
                    <div className="relative flex-1">
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none transition-all"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 relative">
                      <div className="flex flex-col flex-1">
                        <span className="text-[10px] uppercase tracking-tighter font-black text-gray-400 absolute -top-5 left-1">Start Date</span>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none transition-all"
                        />
                      </div>
                      <span className="text-gray-400 font-bold px-1 mt-4">→</span>
                      <div className="flex flex-col flex-1">
                        <span className="text-[10px] uppercase tracking-tighter font-black text-gray-400 absolute -top-5 right-10">End Date</span>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {customRangeText && (
                  <div className="flex items-center text-xs font-bold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-100">
                    <FiCheckCircle className="w-3.5 h-3.5 mr-2" />
                    <span>Viewing: {customRangeText}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Management Actions */}
      <div className="bg-white rounded-2xl md:rounded-3xl shadow-soft border border-gray-100/50 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-white p-4 md:p-6 border-b border-gray-100">
          <h3 className="text-lg md:text-xl font-display font-bold text-gray-900 flex items-center">
            <div className="bg-primary-100 p-2 rounded-lg mr-2 md:mr-3">
              <FiSettings className="w-4 md:w-5 h-4 md:h-5 text-primary-600" />
            </div>
            Management Center
          </h3>
          <p className="text-xs md:text-sm text-gray-500 font-medium ml-8 md:ml-11 mt-1">Quick access to all core administrative functions</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 p-4 md:p-6 gap-3 md:gap-4">
          {[ 
            { label: 'Employees', desc: 'Staff performance', icon: FiUsers, action: handleEmployeeManagement, color: 'blue' },
            { label: 'Users', desc: 'Access control', icon: FiUsers, action: handleUserManagement, color: 'indigo' },
            { label: 'Menu', desc: 'Item management', icon: FiShoppingBag, action: handleMenuManagement, color: 'green' },
            { label: 'Orders', desc: 'Active & history', icon: FiClipboard, action: handleOrderManagement, color: 'orange' },
            { label: 'Payments', desc: 'Financial records', icon: FiCreditCard, action: handlePaymentManagement, color: 'purple' },
            { label: 'Attendance', desc: 'Shift tracking', icon: FiClock, action: handleAttendanceManagement, color: 'red' },
            { label: 'Reports', desc: 'Analytics export', icon: FiBarChart2, action: handleReports, color: 'indigo' },
            { label: 'Tables', desc: 'Floor layout', icon: FiActivity, action: handleTableManagement, color: 'yellow' },
            { label: 'Inventory', desc: 'Stock levels', icon: FiShoppingBag, action: handleInventory, color: 'emerald' },
            { label: 'Profile', desc: 'Account settings', icon: FiUsers, action: handleProfile, color: 'gray' }
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                onClick={item.action}
                className="flex items-center p-3 md:p-4 bg-gray-50 hover:bg-white hover:shadow-lg hover:shadow-gray-200/50 border border-transparent hover:border-gray-200 rounded-2xl transition-all duration-300 group text-left"
              >
                <div className={`p-2 md:p-3 rounded-xl bg-white shadow-sm group-hover:bg-${item.color}-500 transition-colors mr-3 md:mr-4`}>
                  <Icon className={`w-4 md:w-5 h-4 md:h-5 text-${item.color}-500 group-hover:text-white`} />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs md:text-sm font-bold text-gray-900 group-hover:text-primary-600 transition-colors truncate">
                    {item.label}
                  </span>
                  <span className="block text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-tighter truncate">
                    {item.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Storage (Inventory) Report */}
      <div className="bg-white rounded-2xl md:rounded-3xl shadow-soft border border-gray-100/50 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-white p-4 md:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg md:text-xl font-display font-bold text-gray-900 flex items-center">
              <div className="bg-emerald-100 p-2 rounded-lg mr-2 md:mr-3">
                <FiShoppingBag className="w-4 md:w-5 h-4 md:h-5 text-emerald-600" />
              </div>
              Inventory Status
            </h3>
            <p className="text-xs md:text-sm text-gray-500 font-medium ml-8 md:ml-11 mt-1">Current stock levels and replenishment needs</p>
          </div>
          <button
            onClick={handleInventory}
            className="px-3 md:px-4 py-2 bg-emerald-50 text-emerald-700 text-[10px] md:text-xs font-bold rounded-xl border border-emerald-100 hover:bg-emerald-500 hover:text-white transition-all shadow-sm self-start sm:self-auto"
          >
            Manage Inventory
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Item Details</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Stock Level</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Unit Type</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Threshold</th>
                <th className="px-6 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Action Required</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dashboardData.inventoryItems.length > 0 ? (
                dashboardData.inventoryItems.map((item) => {
                  const isLow = item.quantity <= item.min_quantity;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-gray-900 group-hover:text-primary-600 transition-colors">{item.name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className={`w-2 h-2 rounded-full mr-2 ${isLow ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                          <span className={`text-sm font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                            {item.quantity}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-black uppercase rounded-md">{item.unit}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-500">{item.min_quantity}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${isLow
                          ? 'bg-red-50 text-red-600 border border-red-100'
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          }`}>
                          {isLow ? 'Restock ASAP' : 'Sufficient'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-12">
                    <div className="flex flex-col items-center">
                      <FiShoppingBag className="w-12 h-12 text-gray-200 mb-2" />
                      <p className="text-gray-400 font-bold">No inventory data available</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {/* Recent Orders */}
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-soft border border-gray-100/50 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-gray-50 to-white p-4 md:p-6 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-display font-bold text-gray-900 flex items-center">
              <div className="bg-orange-100 p-2 rounded-lg mr-2 md:mr-3">
                <FiClipboard className="w-4 md:w-5 h-4 md:h-5 text-orange-600" />
              </div>
              Live Orders
            </h3>
            <button className="text-primary-600 hover:text-primary-700 text-[10px] md:text-xs font-black uppercase tracking-widest">
              View All
            </button>
          </div>
          <div className="p-4 md:p-6 space-y-3 md:space-y-4 flex-1">
            {recentOrdersInRange.length > 0 ? (
              recentOrdersInRange.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl border border-transparent hover:border-orange-100 hover:bg-white hover:shadow-md transition-all group">
                  <div className="flex items-center space-x-4">
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">
                      <FiLayers className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-gray-900">
                          #{order.id}
                        </span>
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tighter shadow-sm ${order.status === 'completed' || order.status === 'paid' ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'
                          }`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-gray-400 mt-0.5">
                        {order.type === 'cafe' && order.table_number && `Table ${order.table_number} • `}
                        {formatDate(order.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-gray-900">
                      ${getOrderSubtotalForUnitAndMenuItem(order, businessUnit, selectedMenuItemId).toFixed(2)}
                    </p>
                    <p className="text-[9px] font-black text-primary-500 uppercase tracking-widest mt-0.5">
                      {order.type}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 opacity-30">
                <FiClipboard className="w-12 h-12 mb-2" />
                <p className="font-bold">No active orders</p>
              </div>
            )}
          </div>
        </div>

        {/* Today's Attendance */}
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-soft border border-gray-100/50 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-gray-50 to-white p-4 md:p-6 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-display font-bold text-gray-900 flex items-center">
              <div className="bg-red-100 p-2 rounded-lg mr-2 md:mr-3">
                <FiActivity className="w-4 md:w-5 h-4 md:h-5 text-red-600" />
              </div>
              On-Duty Staff
            </h3>
            <span className="px-2 md:px-3 py-1 bg-red-50 text-red-600 text-[9px] md:text-[10px] font-black rounded-full border border-red-100 shadow-sm">
              {dashboardData.todayAttendance.length} ACTIVE
            </span>
          </div>
          <div className="p-4 md:p-6 space-y-3 md:space-y-4 flex-1">
            {dashboardData.todayAttendance.length > 0 ? (
              dashboardData.todayAttendance.map((attendance) => (
                <div key={attendance.id} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl border border-transparent hover:border-red-100 hover:bg-white hover:shadow-md transition-all group">
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <div className="w-12 h-12 bg-white p-1 rounded-2xl shadow-sm border border-gray-100 group-hover:scale-110 transition-transform flex items-center justify-center">
                        <div className="w-full h-full bg-red-500 rounded-xl flex items-center justify-center uppercase font-black text-white text-lg">
                          {attendance.full_name?.charAt(0)}
                        </div>
                      </div>
                      {!attendance.clock_out_time && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 group-hover:text-red-600 transition-colors">
                        {attendance.full_name}
                      </p>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                        {attendance.role?.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-gray-900 flex items-center justify-end">
                      <FiClock className="w-3 h-3 mr-1.5 text-red-400" />
                      {new Date(attendance.clock_in_time).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${attendance.clock_out_time ? 'text-gray-400' : 'text-green-500'}`}>
                      {attendance.clock_out_time ? 'Shift Ended' : 'Shift Live'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 opacity-30">
                <FiUsers className="w-12 h-12 mb-2" />
                <p className="font-bold">Team not clocked in</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Payments Section */}
      <div className="bg-white rounded-2xl md:rounded-3xl shadow-soft border border-gray-100/50 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-white p-4 md:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg md:text-xl font-display font-bold text-gray-900 flex items-center">
              <div className="bg-indigo-100 p-2 rounded-lg mr-2 md:mr-3">
                <FiTrendingUp className="w-4 md:w-5 h-4 md:h-5 text-indigo-600" />
              </div>
              Revenue History
            </h3>
            <p className="text-xs md:text-sm text-gray-500 font-medium ml-8 md:ml-11 mt-1">Recent financial transactions and settlement status</p>
          </div>
          <button className="px-3 md:px-4 py-2 bg-indigo-50 text-indigo-700 text-[10px] md:text-xs font-black uppercase tracking-widest rounded-xl border border-indigo-100 hover:bg-indigo-500 hover:text-white transition-all shadow-sm self-start sm:self-auto">
            Full Audit
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Ref ID</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Order</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Settlement</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Channel</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Timeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentPaymentsInRange.length > 0 ? (
                recentPaymentsInRange.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="text-xs font-black text-gray-500 tracking-tighter">P-{payment.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900">#{payment.order_id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                        ${getPaymentAmountForSelection(payment, businessUnit, selectedMenuItemId, orderById).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-tighter">Gateway</span>
                        <span className="text-xs font-bold text-gray-700 uppercase">{payment.payment_method?.replace('_', ' ')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-right md:text-left">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter shadow-sm mb-1 px-2 py-0.5 bg-gray-100 rounded self-start">
                          {payment.status}
                        </span>
                        <span className="text-[11px] font-semibold text-gray-600">{formatDate(payment.created_at)}</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-12">
                    <div className="flex flex-col items-center opacity-20">
                      <FiTrendingUp className="w-12 h-12 mb-2" />
                      <p className="font-bold">No recent payouts</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
