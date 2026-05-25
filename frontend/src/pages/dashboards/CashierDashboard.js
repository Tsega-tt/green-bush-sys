import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flushSync, createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api, { API_BASE_URL } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useDashboardFilters } from '../../context/DashboardFilterContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import BranchBadge from '../../components/common/BranchBadge';
import {
  FiDollarSign,
  FiCreditCard,
  FiClipboard,
  FiClock,
  FiSquare,
  FiUser,
  FiTrendingUp,
  FiX,
  FiBarChart2,
  FiMail,
  FiPhone,
  FiMapPin,
  FiPrinter
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { qzPrintEscPosBase64 } from '../../utils/qzTray';
import { runQzDiagnostics, formatDiagnosticResults } from '../../utils/qzDiagnostics';

const CASHIER_DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Cashier Dashboard Component
 * Focused on payment processing and financial operations
 */
 const CashierDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { businessUnit, selectedMenuItemId } = useDashboardFilters();
  const [loading, setLoading] = useState(true);
  const [attendanceStatus, setAttendanceStatus] = useState(null);
  const [statsRange, setStatsRange] = useState('today');
  const [customStatsDate, setCustomStatsDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [orderDetailsById, setOrderDetailsById] = useState({});
  const [menuMainCategoryById, setMenuMainCategoryById] = useState({});
  const [menuItems, setMenuItems] = useState([]);
  const [expandedRecentPaymentIds, setExpandedRecentPaymentIds] = useState(() => new Set());
  const [loadingRecentPaymentOrderIds, setLoadingRecentPaymentOrderIds] = useState(() => new Set());
  const [processingOrders, setProcessingOrders] = useState(new Set());
  const processingOrdersRef = useRef(new Set());
  const [dashboardData, setDashboardData] = useState({
    pendingPayments: [],
    recentPayments: [],
    ordersForPayment: [],
    paymentsAll: [],
    todayStats: {
      paymentsProcessed: 0,
      totalRevenue: 0,
      qrPayments: 0,
      cashPayments: 0
    }
  });

  const confirmPaymentOnly = async (paymentId) => {
    const resp = await api.payments.confirm(paymentId, { processed_by: user.id });
    return resp;
  };

  const handleConfirmProcessPaymentYes = async (orderArg) => {
    const order = orderArg || confirmOrder;
    if (!order) return;

    if (processingOrders.has(order.id) || processingOrdersRef.current.has(order.id)) return;

    processingOrdersRef.current.add(order.id);

    flushSync(() => setIsBlockingPaymentUi(true));

    try {
      setProcessingOrders(prev => new Set(prev).add(order.id));

      setDashboardData(prev => ({
        ...prev,
        ordersForPayment: prev.ordersForPayment.filter(o => o.id !== order.id)
      }));

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
        const confirmResp = await confirmPaymentOnly(createdPayment.id);
        const confirmedPayment =
          confirmResp?.data?.data?.payment ??
          confirmResp?.data?.payment ??
          null;

        if (confirmedPayment?.id) {
          setDashboardData((prev) => {
            const nextRecent = [confirmedPayment, ...(prev.recentPayments || [])]
              .filter((p) => p && p.id != null)
              .slice(0, 10);
            const nextAll = [confirmedPayment, ...(prev.paymentsAll || [])]
              .filter((p) => p && p.id != null);
            return { ...prev, recentPayments: nextRecent, paymentsAll: nextAll };
          });
        }
      }

      toast.success('Payment confirmed successfully!');
      setShowProcessPaymentConfirmModal(false);
      setConfirmOrder(null);
      refreshDashboardData();
    } catch (error) {
      console.error('Error confirming payment:', error);

      if (error.response?.status === 400 && error.response?.data?.message?.includes('already exists')) {
        toast.error('Payment already created for this order');
      } else {
        toast.error('Failed to confirm payment');
      }

      refreshDashboardData();
    } finally {
      setIsBlockingPaymentUi(false);
      processingOrdersRef.current.delete(order.id);
      setProcessingOrders(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const handleConfirmProcessPaymentNo = async (orderArg) => {
    const order = orderArg || confirmOrder;
    if (!order) return;

    if (processingOrders.has(order.id) || processingOrdersRef.current.has(order.id)) return;

    processingOrdersRef.current.add(order.id);

    flushSync(() => setIsBlockingPaymentUi(true));

    try {
      setProcessingOrders(prev => new Set(prev).add(order.id));

      setDashboardData(prev => ({
        ...prev,
        ordersForPayment: prev.ordersForPayment.filter(o => o.id !== order.id)
      }));

      await api.orders.updateStatus(order.id, { status: 'cancelled' });
      const deletedResp = await api.payments.create({
        order_id: order.id,
        amount: order.total_amount,
        payment_method: 'cash',
        status: 'deleted',
        processed_by: user.id
      });

      const deletedPayment =
        deletedResp?.data?.data?.payment ??
        deletedResp?.data?.payment ??
        null;

      if (deletedPayment?.id) {
        setDashboardData((prev) => {
          const nextRecent = [deletedPayment, ...(prev.recentPayments || [])]
            .filter((p) => p && p.id != null)
            .slice(0, 10);
          const nextAll = [deletedPayment, ...(prev.paymentsAll || [])]
            .filter((p) => p && p.id != null);
          return { ...prev, recentPayments: nextRecent, paymentsAll: nextAll };
        });
      }

      toast.success('Order cancelled');
      setShowProcessPaymentConfirmModal(false);
      setConfirmOrder(null);
      refreshDashboardData();
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('Failed to cancel order');
      refreshDashboardData();
    } finally {
      setIsBlockingPaymentUi(false);
      processingOrdersRef.current.delete(order.id);
      setProcessingOrders(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const openCancelOrderConfirm = (order) => {
    if (!order) return;
    setConfirmOrder(order);
    setShowProcessPaymentConfirmModal(true);
  };

  // Reusable function to refresh dashboard data without loading spinner
  const refreshDashboardData = useCallback(async () => {
    try {
      const [
        pendingResult,
        paymentsResult,
        ordersForPaymentResult
      ] = await Promise.allSettled([
        api.payments.getPending(),
        api.payments.getAll(),
        api.orders.getOrdersForPayment()
      ]);

      setDashboardData(prev => {
        const pendingPaymentsRaw = pendingResult?.status === 'fulfilled'
          ? (pendingResult.value?.data?.data?.payments ?? pendingResult.value?.data?.payments ?? [])
          : prev.pendingPayments;

        const paymentsAllRaw = paymentsResult?.status === 'fulfilled'
          ? (paymentsResult.value?.data?.data?.payments ?? paymentsResult.value?.data?.payments ?? [])
          : prev.paymentsAll;

        const ordersForPaymentRaw = ordersForPaymentResult?.status === 'fulfilled'
          ? (ordersForPaymentResult.value?.data?.data?.orders ?? ordersForPaymentResult.value?.data?.orders ?? [])
          : prev.ordersForPayment;

        const paymentsAll = Array.isArray(paymentsAllRaw) ? paymentsAllRaw : [];

        return {
          ...prev,
          pendingPayments: Array.isArray(pendingPaymentsRaw) ? pendingPaymentsRaw : [],
          recentPayments: paymentsAll.slice(0, 10),
          ordersForPayment: Array.isArray(ordersForPaymentRaw) ? ordersForPaymentRaw : [],
          paymentsAll
        };
      });
    } catch (err) {
      // Silently ignore refresh errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const resp = await api.menu.getAll();
        const items = resp?.data?.data?.menuItems ?? resp?.data?.menuItems ?? [];
        if (!Array.isArray(items) || items.length === 0) {
          if (cancelled) return;
          setMenuItems([]);
          setMenuMainCategoryById({});
          return;
        }
        if (cancelled) return;

        setMenuItems(items);

        const next = {};
        for (const it of items) {
          const id = it?.id != null ? parseInt(it.id, 10) : null;
          if (!Number.isFinite(id)) continue;
          const main = String(it?.main_category || '').trim().toLowerCase();
          if (!main) continue;
          next[id] = main;
        }
        setMenuMainCategoryById(next);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const orders = Array.isArray(dashboardData.ordersForPayment) ? dashboardData.ordersForPayment : [];
    const missing = orders.filter((o) => {
      const existing = orderDetailsById?.[o?.id];
      const hasItems = Array.isArray(o?.items) && o.items.length > 0;
      const existingHasItems = Array.isArray(existing?.items) && existing.items.length > 0;
      return o?.id && !hasItems && !existingHasItems;
    });

    if (missing.length === 0) return;

    let cancelled = false;

    (async () => {
      const results = await Promise.allSettled(
        missing.map((o) => api.orders.getById(o.id))
      );

      if (cancelled) return;

      setOrderDetailsById((prev) => {
        const next = { ...(prev || {}) };
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          const order = r.value?.data?.data?.order ?? r.value?.data?.order;
          if (!order?.id) continue;
          next[order.id] = order;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboardData.ordersForPayment, orderDetailsById]);

  const getDateBoundsForStatsRange = useCallback(() => {
    const now = new Date();
    let from = null;
    let to = null;

    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    const parseYmdAsLocalDate = (ymd) => {
      if (!ymd || typeof ymd !== 'string') return null;
      const parts = ymd.split('-');
      if (parts.length !== 3) return null;
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
      const dt = new Date(y, m - 1, d);
      if (Number.isNaN(dt.getTime())) return null;
      return dt;
    };

    if (statsRange === 'today') {
      from = startOfDay(now);
      to = endOfDay(now);
    } else if (statsRange === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = startOfDay(y);
      to = endOfDay(y);
    } else if (statsRange === 'week') {
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;
      const monday = new Date(now);
      monday.setDate(monday.getDate() - diffToMonday);
      from = startOfDay(monday);
      to = endOfDay(now);
    } else if (statsRange === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      from = startOfDay(first);
      to = endOfDay(now);
    } else if (statsRange === 'custom') {
      const d = parseYmdAsLocalDate(customStatsDate);
      if (!d) return { from: null, to: null };
      from = startOfDay(d);
      to = endOfDay(d);
    }

    return { from, to };
  }, [statsRange, customStatsDate]);

  const getItemDepartment = useCallback((item) => {
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
  }, [menuMainCategoryById]);

  const getMenuItemDepartment = useCallback((menuItem) => {
    const explicitMain = String(menuItem?.main_category || '').trim().toLowerCase();
    if (explicitMain.includes('ጾም')) return 'restaurant';
    if (explicitMain === 'bakery') return 'cafe';
    if (explicitMain === 'cafe' || explicitMain === 'restaurant' || explicitMain === 'barista') return explicitMain;

    const cat = String(menuItem?.category || menuItem?.sub_category || '').trim().toLowerCase();
    const name = String(menuItem?.name || '').trim().toLowerCase();
    if (cat.includes('ጾም') || name.includes('ጾም')) return 'restaurant';
    const beverageKeys = ['beverages', 'drinks', 'coffee', 'tea', 'juice', 'smoothie', 'water', 'soda', 'espresso', 'cappuccino', 'latte', 'americano'];
    if (beverageKeys.some((k) => cat.includes(k) || name.includes(k))) return 'barista';

    return null;
  }, []);

  const getItemSubtotalBirr = useCallback((item) => {
    const qty = parseInt(item?.quantity, 10) || 0;
    const subtotal = parseFloat(item?.subtotal);
    if (Number.isFinite(subtotal)) return subtotal;

    const unitPrice = parseFloat(item?.unit_price);
    if (Number.isFinite(unitPrice) && qty > 0) return unitPrice * qty;

    const price = parseFloat(item?.price);
    if (Number.isFinite(price) && qty > 0) return price * qty;

    return 0;
  }, []);

  const getOrderUnitBreakdown = useCallback((order, unit) => {
    if (!order) return { items: [], subtotal: 0 };

    const details = order?.id ? (orderDetailsById?.[order.id] || null) : null;
    const itemsRaw = (details?.items && Array.isArray(details.items) && details.items.length > 0)
      ? details.items
      : (Array.isArray(order?.items) ? order.items : []);

    const orderFallback = String(order?.type || '').trim().toLowerCase();
    const fallbackDept = orderFallback === 'bakery' ? 'cafe' : (orderFallback || null);

    const items = [];
    let subtotal = 0;

    for (const it of itemsRaw) {
      const dept = getItemDepartment(it) || fallbackDept;
      if (unit && dept !== unit) continue;
      const line = getItemSubtotalBirr(it);
      if (line > 0) subtotal += line;
      items.push(it);
    }

    return { items, subtotal };
  }, [getItemDepartment, getItemSubtotalBirr, orderDetailsById]);

  const getOrderSubtotalForUnit = useCallback((order, unit) => {
    if (!order) return 0;
    if (!unit || unit === 'all') {
      const total = parseFloat(order?.total_amount);
      if (Number.isFinite(total)) return total;
      const breakdown = getOrderUnitBreakdown(order, null);
      return breakdown.subtotal;
    }
    return getOrderUnitBreakdown(order, unit).subtotal;
  }, [getOrderUnitBreakdown]);

  const getOrderSubtotalForUnitAndMenuItem = useCallback((order, unit, menuItemId) => {
    if (!order) return 0;

    const details = order?.id ? (orderDetailsById?.[order.id] || null) : null;
    const itemsRaw = (details?.items && Array.isArray(details.items) && details.items.length > 0)
      ? details.items
      : (Array.isArray(order?.items) ? order.items : []);

    const orderFallback = String(order?.type || '').trim().toLowerCase();
    const fallbackDept = orderFallback === 'bakery' ? 'cafe' : (orderFallback || null);

    const targetMenuItemId = (menuItemId && menuItemId !== 'all') ? parseInt(menuItemId, 10) : null;

    let subtotal = 0;
    for (const it of itemsRaw) {
      const dept = getItemDepartment(it) || fallbackDept;
      if (unit && unit !== 'all' && dept !== unit) continue;
      if (Number.isFinite(targetMenuItemId)) {
        const mid = it?.menu_item_id != null ? parseInt(it.menu_item_id, 10) : null;
        if (!Number.isFinite(mid) || mid !== targetMenuItemId) continue;
      }
      const line = getItemSubtotalBirr(it);
      if (line > 0) subtotal += line;
    }

    if ((!unit || unit === 'all') && (!Number.isFinite(targetMenuItemId))) {
      const total = parseFloat(order?.total_amount);
      if (Number.isFinite(total)) return total;
    }

    return subtotal;
  }, [getItemDepartment, getItemSubtotalBirr, orderDetailsById]);

  const getPaymentAmountForUnit = useCallback((payment, unit) => {
    if (!payment) return 0;
    if (!unit || unit === 'all') {
      const amt = parseFloat(payment?.amount);
      return Number.isFinite(amt) ? amt : 0;
    }

    const orderId = payment?.order_id != null ? parseInt(payment.order_id, 10) : null;
    if (!Number.isFinite(orderId)) return 0;
    const order = orderDetailsById?.[orderId] || null;
    if (!order) return 0;

    return getOrderSubtotalForUnit(order, unit);
  }, [getOrderSubtotalForUnit, orderDetailsById]);

  const getPaymentAmountForSelection = useCallback((payment, unit, menuItemId) => {
    if (!payment) return 0;
    if ((!menuItemId || menuItemId === 'all')) return getPaymentAmountForUnit(payment, unit);

    const orderId = payment?.order_id != null ? parseInt(payment.order_id, 10) : null;
    if (!Number.isFinite(orderId)) return 0;
    const order = orderDetailsById?.[orderId] || null;
    if (!order) return 0;

    const normalizedUnit = unit === 'all' ? null : unit;
    return getOrderSubtotalForUnitAndMenuItem(order, normalizedUnit, menuItemId);
  }, [getOrderSubtotalForUnitAndMenuItem, getPaymentAmountForUnit, orderDetailsById]);

  const orderMatchesBusinessUnit = useCallback((order) => {
    if (businessUnit === 'all' && selectedMenuItemId === 'all') return true;
    if (selectedMenuItemId !== 'all') {
      return getOrderSubtotalForUnitAndMenuItem(order, businessUnit, selectedMenuItemId) > 0;
    }
    if (businessUnit === 'all') return true;
    return getOrderSubtotalForUnit(order, businessUnit) > 0;
  }, [businessUnit, getOrderSubtotalForUnit, getOrderSubtotalForUnitAndMenuItem, selectedMenuItemId]);

  useEffect(() => {
    if (businessUnit === 'all') return;

    const all = Array.isArray(dashboardData.paymentsAll) ? dashboardData.paymentsAll : [];
    if (all.length === 0) return;

    const hasProcessedBy = all.some((p) => p && p.processed_by != null);
    const byUser = hasProcessedBy
      ? all.filter((p) => parseInt(p.processed_by, 10) === parseInt(user.id, 10))
      : all;

    const { from, to } = getDateBoundsForStatsRange();
    const rangePayments = (from && to)
      ? byUser.filter((p) => {
          const d = new Date(p.created_at);
          if (Number.isNaN(d.getTime())) return false;
          return d >= from && d <= to;
        })
      : byUser;

    const candidateOrderIds = Array.from(new Set(
      rangePayments
        .map((p) => (p?.order_id != null ? parseInt(p.order_id, 10) : null))
        .filter((id) => Number.isFinite(id))
    ));

    const missing = candidateOrderIds.filter((id) => {
      const existing = orderDetailsById?.[id];
      const existingHasItems = Array.isArray(existing?.items) && existing.items.length > 0;
      return !existingHasItems;
    }).slice(0, 40);

    if (missing.length === 0) return;

    let cancelled = false;

    (async () => {
      const results = await Promise.allSettled(missing.map((id) => api.orders.getById(id)));
      if (cancelled) return;
      setOrderDetailsById((prev) => {
        const next = { ...(prev || {}) };
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          const order = r.value?.data?.data?.order ?? r.value?.data?.order;
          if (!order?.id) continue;
          next[order.id] = order;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [businessUnit, dashboardData.paymentsAll, getDateBoundsForStatsRange, orderDetailsById, user.id]);

  // Auto-print polling for new orders from waiters
  const printingRef = useRef(new Set());
  const pollIntervalRef = useRef(null);
  const orderStreamRef = useRef(null);
  const isPollingUnprintedRef = useRef(false);
  const qzPollDelayMsRef = useRef(2000);
  const lastQzPollErrorLogAtRef = useRef(0);
  const printLeaderIdRef = useRef(`${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const recentlyPrintedRef = useRef(new Map());
  const RECENTLY_PRINTED_KEY = 'kidist_recently_printed_v1';

  const qzPrinterName = String(process.env.REACT_APP_QZ_PRINTER_NAME || '').trim();
  const lastQzErrorToastAtRef = useRef(0);

  const tryAcquirePrintLeadership = useCallback(() => {
    if (typeof window === 'undefined') return true;
    const key = 'kidist_print_leader_v1';
    const now = Date.now();
    const ttlMs = 8000;
    const myId = printLeaderIdRef.current;

    try {
      const raw = window.localStorage?.getItem(key);
      const cur = raw ? JSON.parse(raw) : null;
      const curId = cur && typeof cur.id === 'string' ? cur.id : '';
      const curExp = cur && typeof cur.exp === 'number' ? cur.exp : 0;

      const canTake = !curId || curExp <= now || curId === myId;
      if (!canTake) return false;

      const next = { id: myId, exp: now + ttlMs };
      window.localStorage?.setItem(key, JSON.stringify(next));

      const verifyRaw = window.localStorage?.getItem(key);
      const verify = verifyRaw ? JSON.parse(verifyRaw) : null;
      return verify?.id === myId;
    } catch (e) {
      return true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const renew = () => {
      tryAcquirePrintLeadership();
    };
    renew();
    const t = setInterval(renew, 4000);

    const onUnload = () => {
      try {
        const key = 'kidist_print_leader_v1';
        const raw = window.localStorage?.getItem(key);
        const cur = raw ? JSON.parse(raw) : null;
        if (cur?.id === printLeaderIdRef.current) {
          window.localStorage?.removeItem(key);
        }
      } catch (e) {
      }
    };

    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(t);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [tryAcquirePrintLeadership]);

  const maybeToastQzError = useCallback((err) => {
    const now = Date.now();
    if (now - lastQzErrorToastAtRef.current < 30000) return;
    lastQzErrorToastAtRef.current = now;
    const msg = err?.message ? String(err.message) : '';
    const detail = msg ? ` (${msg})` : '';
    console.error('QZ Tray Error Details:', err);
    toast.error(`QZ Tray printing failed. Start QZ Tray and click Allow/Remember when prompted${detail}`, { duration: 6000 });
    setQzStatus({ connected: false, error: msg });
  }, []);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const ttlMs = 10 * 60 * 1000;
      const now = Date.now();
      const raw = window.localStorage?.getItem(RECENTLY_PRINTED_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const entries = Array.isArray(parsed) ? parsed : [];
      for (const ent of entries) {
        const id = parseInt(ent?.id, 10);
        const ts = typeof ent?.ts === 'number' ? ent.ts : null;
        if (!Number.isFinite(id) || ts == null) continue;
        if (now - ts > ttlMs) continue;
        recentlyPrintedRef.current.set(id, ts);
      }
    } catch (e) {
    }
  }, []);

  const wasRecentlyPrinted = useCallback((orderId) => {
    const ttlMs = 10 * 60 * 1000;
    const now = Date.now();
    const t = recentlyPrintedRef.current.get(orderId);
    if (typeof t !== 'number') return false;
    if (now - t > ttlMs) {
      recentlyPrintedRef.current.delete(orderId);
      return false;
    }
    return true;
  }, []);

  const rememberRecentlyPrinted = useCallback((orderId) => {
    const ttlMs = 10 * 60 * 1000;
    const now = Date.now();
    recentlyPrintedRef.current.set(orderId, now);
    try {
      if (typeof window === 'undefined') return;
      const entries = [];
      for (const [id, ts] of recentlyPrintedRef.current.entries()) {
        if (typeof ts !== 'number') continue;
        if (now - ts > ttlMs) continue;
        entries.push({ id, ts });
      }
      window.localStorage?.setItem(RECENTLY_PRINTED_KEY, JSON.stringify(entries));
    } catch (e) {
    }
  }, []);

  const markPrintedWithRetry = useCallback(async (orderId) => {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await api.orders.markPrinted(orderId);
        return true;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    console.error('[QZ Print] Failed to mark printed after retries:', orderId, lastErr);
    return false;
  }, []);

  const pollUnprintedOrders = useCallback(async () => {
    if (!tryAcquirePrintLeadership()) return;
    if (isPollingUnprintedRef.current) return;
    isPollingUnprintedRef.current = true;
    try {
      const resp = await api.orders.getUnprinted({ timeout: 30000 });
      const orders = resp?.data?.data?.orders ?? resp?.data?.orders ?? [];
      let printed = false;
      for (const order of orders) {
        if (wasRecentlyPrinted(order.id)) {
          try {
            await markPrintedWithRetry(order.id);
          } catch (e) {
          }
          continue;
        }
        if (printingRef.current.has(order.id)) continue;
        printingRef.current.add(order.id);
        try {
          console.log(`[QZ Print] Attempting to print order #${order.id}`);
          const payloadResp = await api.orders.getTicketPayload(order.id);
          const payloadBase64 =
            payloadResp?.data?.payloadBase64 ??
            payloadResp?.data?.data?.payloadBase64 ??
            '';

          if (!payloadBase64) {
            throw new Error('EMPTY_TICKET_PAYLOAD');
          }

          console.log(`[QZ Print] Payload received, length: ${payloadBase64.length}, printer: ${qzPrinterName || 'default'}`);
          await qzPrintEscPosBase64(payloadBase64, qzPrinterName);
          console.log(`[QZ Print] Print command sent successfully for order #${order.id}`);
          setQzStatus({ connected: true, error: null });

          rememberRecentlyPrinted(order.id);
          await markPrintedWithRetry(order.id);

          const tablePart = order.table_number ? ` (Table ${order.table_number})` : '';
          toast.success(
            `🖨️ Order #${order.id}${tablePart} printed successfully`,
            { duration: 3000 }
          );
          printed = true;
        } catch (err) {
          console.error('[QZ Print] Auto-print failed for order', order.id, err);
          maybeToastQzError(err);
        } finally {
          printingRef.current.delete(order.id);
        }
      }
      // Refresh dashboard data if any new orders were printed
      if (printed) {
        await refreshDashboardData();
      }

      qzPollDelayMsRef.current = 2000;
    } catch (err) {
      const now = Date.now();
      if (now - lastQzPollErrorLogAtRef.current > 10000) {
        lastQzPollErrorLogAtRef.current = now;
        console.error('[QZ Print] Polling error:', err);
      }
      qzPollDelayMsRef.current = Math.min(Math.max(qzPollDelayMsRef.current * 2, 4000), 30000);
    } finally {
      isPollingUnprintedRef.current = false;
    }
  }, [maybeToastQzError, qzPrinterName, refreshDashboardData, tryAcquirePrintLeadership]);

  useEffect(() => {
    // Start polling frequently (SSE handles fast-path updates, polling is the fallback)
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        await pollUnprintedOrders();
      } finally {
        if (cancelled) return;
        const delay = qzPollDelayMsRef.current;
        pollIntervalRef.current = setTimeout(tick, delay);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current);
    };
  }, [pollUnprintedOrders]);

  useEffect(() => {
    const t = setInterval(() => {
      try {
        refreshDashboardData();
      } catch (e) {
        // ignore
      }
    }, 3000);

    return () => {
      clearInterval(t);
    };
  }, [refreshDashboardData]);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const base = String(API_BASE_URL || '').trim();
      const streamUrl = `${base.replace(/\/+$/, '')}/orders/stream`;
      const src = new EventSource(streamUrl);
      orderStreamRef.current = src;

      src.addEventListener('connected', () => {
        // no-op
      });

      src.addEventListener('new_order', async () => {
        try {
          refreshDashboardData();
          await pollUnprintedOrders();
        } catch (e) {
          // ignore
        }
      });

      src.onerror = () => {
        // If SSE fails (proxy/server), polling will still work.
      };

      return () => {
        try {
          src.close();
        } catch (e) {
          // ignore
        }
        orderStreamRef.current = null;
      };
    } catch (e) {
      // ignore
    }
  }, [pollUnprintedOrders, refreshDashboardData]);

  // Modal states
  const [showProcessPaymentModal, setShowProcessPaymentModal] = useState(false);
  const [showGenerateQRModal, setShowGenerateQRModal] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isBlockingPaymentUi, setIsBlockingPaymentUi] = useState(false);
  const [showConfirmProcessPaymentModal, setShowConfirmProcessPaymentModal] = useState(false);
  const [showProcessPaymentConfirmModal, setShowProcessPaymentConfirmModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [confirmOrder, setConfirmOrder] = useState(null);
  const [confirmProcessPaymentOrder, setConfirmProcessPaymentOrder] = useState(null);
  const [qzStatus, setQzStatus] = useState({ connected: false, error: null });
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [qrCode, setQrCode] = useState(null);
  const [profileData, setProfileData] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: '',
    address: ''
  });

  // Fetch dashboard data
  useEffect(() => {
    const CACHE_KEY = `cashier_dashboard_${user.id}_v1`;

    const loadCache = () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Number.isFinite(parsed.ts)) return null;
        if (Date.now() - parsed.ts > CASHIER_DASHBOARD_CACHE_TTL_MS) return null;
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
        let attendanceForCache = cached?.attendanceStatus ?? null;

        if (cached) {
          setDashboardData(prev => ({
            ...prev,
            pendingPayments: Array.isArray(cached.pendingPayments) ? cached.pendingPayments : [],
            recentPayments: Array.isArray(cached.recentPayments) ? cached.recentPayments : [],
            ordersForPayment: Array.isArray(cached.ordersForPayment) ? cached.ordersForPayment : [],
            paymentsAll: Array.isArray(cached.paymentsAll) ? cached.paymentsAll : []
          }));
          setAttendanceStatus(cached.attendanceStatus || null);
          setLoading(false);
        } else {
          setLoading(true);
        }

        const [
          pendingResult,
          paymentsResult,
          ordersForPaymentResult,
          attendanceResult
        ] = await Promise.allSettled([
          api.payments.getPending(),
          api.payments.getAll(),
          api.orders.getOrdersForPayment(),
          api.attendance.getCurrentStatus(user.id)
        ]);

        let nextCachePayload = null;
        setDashboardData(prev => {
          const pendingPaymentsRaw = pendingResult?.status === 'fulfilled'
            ? (pendingResult.value?.data?.data?.payments ?? pendingResult.value?.data?.payments ?? [])
            : prev.pendingPayments;

          const paymentsAllRaw = paymentsResult?.status === 'fulfilled'
            ? (paymentsResult.value?.data?.data?.payments ?? paymentsResult.value?.data?.payments ?? [])
            : prev.paymentsAll;

          const ordersForPaymentRaw = ordersForPaymentResult?.status === 'fulfilled'
            ? (ordersForPaymentResult.value?.data?.data?.orders ?? ordersForPaymentResult.value?.data?.orders ?? [])
            : prev.ordersForPayment;

          const paymentsAll = Array.isArray(paymentsAllRaw) ? paymentsAllRaw : [];

          const next = {
            ...prev,
            pendingPayments: Array.isArray(pendingPaymentsRaw) ? pendingPaymentsRaw : [],
            recentPayments: paymentsAll.slice(0, 10),
            ordersForPayment: Array.isArray(ordersForPaymentRaw) ? ordersForPaymentRaw : [],
            paymentsAll
          };

          nextCachePayload = {
            pendingPayments: next.pendingPayments,
            recentPayments: next.recentPayments,
            ordersForPayment: next.ordersForPayment,
            paymentsAll: next.paymentsAll,
            attendanceStatus: attendanceForCache
          };

          return next;
        });

        if (attendanceResult?.status === 'fulfilled') {
          attendanceForCache = attendanceResult.value?.data?.data?.currentStatus || null;
          setAttendanceStatus(attendanceForCache);
          if (nextCachePayload) {
            nextCachePayload.attendanceStatus = attendanceForCache;
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

  useEffect(() => {
    const all = Array.isArray(dashboardData.paymentsAll) ? dashboardData.paymentsAll : [];
    if (all.length === 0) {
      setDashboardData((prev) => ({
        ...prev,
        todayStats: {
          paymentsProcessed: 0,
          totalRevenue: 0,
          qrPayments: 0,
          cashPayments: 0
        }
      }));
      return;
    }

    const hasProcessedBy = all.some((p) => p && p.processed_by != null);
    const byUser = hasProcessedBy ? all.filter((p) => parseInt(p.processed_by, 10) === parseInt(user.id, 10)) : all;

    const { from, to } = getDateBoundsForStatsRange();

    const rangePayments = (from && to)
      ? byUser.filter((p) => {
          const d = new Date(p.created_at);
          if (Number.isNaN(d.getTime())) return false;
          return d >= from && d <= to;
        })
      : byUser;

    const paidEligible = rangePayments
      .filter((p) => p?.status === 'paid')
      .map((p) => ({ payment: p, amount: getPaymentAmountForSelection(p, businessUnit, selectedMenuItemId) }))
      .filter((x) => x.amount > 0);

    const totalRevenue = paidEligible.reduce((sum, x) => sum + x.amount, 0);
    const paymentsProcessed = paidEligible.length;
    const qrPayments = paidEligible.filter((x) => x.payment?.payment_method === 'qr_code').length;
    const cashPayments = paidEligible.filter((x) => x.payment?.payment_method === 'cash').length;

    setDashboardData((prev) => ({
      ...prev,
      todayStats: {
        paymentsProcessed,
        totalRevenue,
        qrPayments,
        cashPayments,
      }
    }));
  }, [statsRange, dashboardData.paymentsAll, user.id, businessUnit, getDateBoundsForStatsRange, orderDetailsById, orderMatchesBusinessUnit, getPaymentAmountForSelection, selectedMenuItemId]);

  // Auto-refresh pending payments to sync across dashboards
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      refreshDashboardData();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(refreshInterval);
  }, [refreshDashboardData]);

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

  // Quick Actions handlers
  const handleQuickProcessPayment = () => {
    const visible = ordersForPaymentSorted
      .filter((o) => orderMatchesBusinessUnit(o));

    if (visible.length === 0) {
      toast.error('No orders available for payment');
      return;
    }
    setSelectedOrder(visible[0]);
    setShowProcessPaymentModal(true);
  };

  const handleQuickGenerateQR = () => {
    setShowGenerateQRModal(true);
  };

  const handleViewReports = () => {
    setShowReportsModal(true);
  };

  const handleMyProfile = () => {
    setShowProfileModal(true);
  };

  const pendingOrdersTotalBirr = (Array.isArray(dashboardData.ordersForPayment) ? dashboardData.ordersForPayment : [])
    .filter((o) => orderMatchesBusinessUnit(o))
    .reduce((sum, o) => sum + getOrderSubtotalForUnitAndMenuItem(o, businessUnit, selectedMenuItemId), 0);

  const ordersForPaymentSorted = useMemo(() => {
    const list = Array.isArray(dashboardData.ordersForPayment) ? dashboardData.ordersForPayment : [];
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
  }, [dashboardData.ordersForPayment]);

  const openProcessPaymentConfirm = (order) => {
    if (!order) return;
    if (isBlockingPaymentUi) return;
    if (processingOrders.has(order.id) || processingOrdersRef.current.has(order.id)) return;
    setConfirmProcessPaymentOrder(order);
    setShowConfirmProcessPaymentModal(true);
  };

  const toggleRecentPaymentDetails = async (payment) => {
    const paymentId = payment?.id;
    if (!paymentId) return;

    const orderIdRaw = payment?.order_id;
    const orderId = orderIdRaw != null ? parseInt(orderIdRaw, 10) : null;

    setExpandedRecentPaymentIds((prev) => {
      const next = new Set(prev || []);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });

    if (!Number.isFinite(orderId)) return;
    const existing = orderDetailsById?.[orderId];
    if (existing) return;

    if (loadingRecentPaymentOrderIds.has(orderId)) return;

    setLoadingRecentPaymentOrderIds((prev) => {
      const next = new Set(prev || []);
      next.add(orderId);
      return next;
    });

    try {
      const resp = await api.orders.getById(orderId);
      const order = resp?.data?.data?.order ?? resp?.data?.order;
      if (order?.id) {
        setOrderDetailsById((prev) => ({ ...(prev || {}), [order.id]: order }));
      }
    } catch (e) {
      // ignore (global network handler will toast if needed)
    } finally {
      setLoadingRecentPaymentOrderIds((prev) => {
        const next = new Set(prev || []);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Process payment with selected method
  const processPaymentWithMethod = async () => {
    if (!selectedOrder) return;

    try {
      const paymentData = {
        order_id: selectedOrder.id,
        amount: selectedOrder.total_amount,
        payment_method: paymentMethod,
        status: paymentMethod === 'cash' ? 'paid' : 'pending',
        processed_by: user.id
      };

      if (paymentMethod === 'qr_code') {
        const response = await api.payments.createWithQR(paymentData);
        setQrCode(response.data.data.qr_code);
        toast.success('QR payment created! Show QR code to customer.');
      } else {
        const createResp = await api.payments.create(paymentData);
        const createdPayment = createResp?.data?.data?.payment;
        if (createdPayment?.id) {
          await confirmPaymentOnly(createdPayment.id);
        }
        toast.success('Cash payment processed successfully!');
        setShowProcessPaymentModal(false);
      }

      // Refresh data
      await refreshDashboardData();

    } catch (error) {
      console.error('Error processing payment:', error);
      toast.error('Failed to process payment. Please try again.');
    }
  };

  // Generate standalone QR code
  const generateStandaloneQR = async (amount) => {
    try {
      const paymentData = {
        amount: amount,
        payment_method: 'qr_code',
        status: 'pending',
        processed_by: user.id,
        description: 'Direct QR Payment'
      };

      const response = await api.payments.createWithQR(paymentData);
      setQrCode(response.data.data.qr_code);
      toast.success('QR code generated successfully!');
    } catch (error) {
      console.error('Error generating QR code:', error);
      toast.error('Failed to generate QR code.');
    }
  };

  // Update profile
  const updateProfile = async () => {
    try {
      await api.auth.updateProfile(user.id, profileData);
      toast.success('Profile updated successfully!');
      setShowProfileModal(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile.');
    }
  };

  // Test QZ Tray printing
  const testQzPrint = async () => {
    try {
      console.log('[QZ Test] Running diagnostics...');
      const diagnostics = await runQzDiagnostics();
      console.log('[QZ Test] Diagnostics:', diagnostics);
      console.log(formatDiagnosticResults(diagnostics));
      
      if (!diagnostics.connected) {
        toast.error('QZ Tray is not running! Please start QZ Tray application.', { duration: 5000 });
        alert(formatDiagnosticResults(diagnostics));
        return;
      }

      toast.loading('Testing printer...', { id: 'qz-test' });
      
      // Get a test order to print
      const resp = await api.orders.getUnprinted({ params: { claim: 0 } });
      const orders = resp?.data?.data?.orders ?? resp?.data?.orders ?? [];
      
      if (orders.length === 0) {
        toast.error('No unprinted orders to test with', { id: 'qz-test' });
        return;
      }

      const testOrder = orders[0];
      console.log('[QZ Test] Testing with order:', testOrder.id);
      
      const payloadResp = await api.orders.getTicketPayload(testOrder.id);
      const payloadBase64 = payloadResp?.data?.payloadBase64 ?? payloadResp?.data?.data?.payloadBase64 ?? '';
      
      if (!payloadBase64) {
        toast.error('Failed to get print payload', { id: 'qz-test' });
        return;
      }

      console.log('[QZ Test] Payload length:', payloadBase64.length);
      console.log('[QZ Test] Printer name:', qzPrinterName || 'default');
      
      await qzPrintEscPosBase64(payloadBase64, qzPrinterName);
      
      toast.success(`Test print sent to ${qzPrinterName || 'default printer'}!`, { id: 'qz-test' });
      setQzStatus({ connected: true, error: null });
    } catch (err) {
      console.error('[QZ Test] Error:', err);
      toast.error(`Test print failed: ${err.message}`, { id: 'qz-test', duration: 5000 });
      setQzStatus({ connected: false, error: err.message });
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading cashier dashboard..." />;
  }

  const statsRangeLabel = statsRange === 'today'
    ? "Today's"
    : statsRange === 'yesterday'
    ? "Yesterday's"
    : statsRange === 'week'
    ? "This Week's"
    : statsRange === 'month'
    ? "This Month's"
    : statsRange === 'custom'
    ? (() => {
        if (!customStatsDate) return 'Custom';
        const parts = String(customStatsDate).split('-');
        if (parts.length !== 3) return 'Custom';
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 'Custom';
        const dt = new Date(y, m - 1, d);
        if (Number.isNaN(dt.getTime())) return 'Custom';
        return `On ${dt.toLocaleDateString()}`;
      })()
    : 'All Time';

  const filteredRecentPayments = (() => {
    const all = Array.isArray(dashboardData.paymentsAll) ? dashboardData.paymentsAll : [];
    if (all.length === 0) return [];

    const hasProcessedBy = all.some((p) => p && p.processed_by != null);
    const byUser = hasProcessedBy
      ? all.filter((p) => parseInt(p.processed_by, 10) === parseInt(user.id, 10))
      : all;

    const { from, to } = getDateBoundsForStatsRange();

    const rangePayments = (from && to)
      ? byUser.filter((p) => {
          const d = new Date(p.created_at);
          if (Number.isNaN(d.getTime())) return false;
          return d >= from && d <= to;
        })
      : byUser;

    const filteredByUnit = rangePayments
      .filter((p) => getPaymentAmountForSelection(p, businessUnit, selectedMenuItemId) > 0);

    return filteredByUnit
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  })();

  const statsCards = [
    {
      title: `${statsRangeLabel} Payments`,
      value: dashboardData.todayStats.paymentsProcessed,
      icon: FiCreditCard,
      color: 'bg-blue-500'
    },
    {
      title: `${statsRangeLabel} Revenue`,
      value: `${dashboardData.todayStats.totalRevenue.toFixed(2)} Birr`,
      icon: FiDollarSign,
      color: 'bg-green-500'
    },
    {
      title: 'Pending Order',
      value: `${(pendingOrdersTotalBirr || 0).toFixed(2)} Birr`,
      icon: FiClipboard,
      color: 'bg-indigo-500'
    },
    {
      title: 'QR Payments',
      value: dashboardData.todayStats.qrPayments,
      icon: FiSquare,
      color: 'bg-purple-500'
    },
    {
      title: 'Cash Payments',
      value: dashboardData.todayStats.cashPayments,
      icon: FiDollarSign,
      color: 'bg-orange-500'
    }
  ];

  return (
    <div className="p-6 space-y-6">
      {isBlockingPaymentUi && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center"
          style={{ zIndex: 2147483647 }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-sm mx-4 flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-primary-500 rounded-full animate-spin"></div>
            <p className="text-gray-700 font-medium">Processing payment...</p>
          </div>
        </div>,
        document.body
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img
            src="/assets/logo.png"
            alt="Logo"
            className="w-10 h-10 object-contain"
          />
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-3xl font-bold text-gray-900">
                Cashier Dashboard
              </h1>
              <BranchBadge />
            </div>
            <p className="text-gray-600 mt-1 flex items-center space-x-2">
              <span>Process payments and manage financial transactions</span>
              <span className="inline-flex items-center space-x-1 bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                <FiPrinter className="w-3 h-3" />
                <span>Auto-Print ON</span>
              </span>
              {qzStatus.connected ? (
                <span className="inline-flex items-center space-x-1 bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                  <span>QZ Tray Connected</span>
                </span>
              ) : qzStatus.error ? (
                <span className="inline-flex items-center space-x-1 bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  <span>QZ Tray Error</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                  <span>QZ Tray Waiting...</span>
                </span>
              )}
            </p>
          </div>
        </div>
        
        {/* Attendance Controls */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/dashboard/cashier/employees')}
            className="btn-outline text-gray-700 border-gray-300 hover:bg-gray-50 flex items-center space-x-2"
          >
            <FiUser className="w-4 h-4" />
            <span>Waiters Dashboard</span>
          </button>
          <button
            onClick={testQzPrint}
            className="btn-outline text-blue-600 border-blue-300 hover:bg-blue-50 flex items-center space-x-2"
            title="Test QZ Tray printer connection"
          >
            <FiPrinter className="w-4 h-4" />
            <span>Test Print</span>
          </button>
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
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
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

      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
          <button
            onClick={() => setStatsRange('all')}
            className={`px-3 py-2 text-sm font-medium ${statsRange === 'all' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            All
          </button>
          <button
            onClick={() => setStatsRange('today')}
            className={`px-3 py-2 text-sm font-medium border-l border-gray-200 ${statsRange === 'today' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
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
            onClick={() => setStatsRange('custom')}
            className={`px-3 py-2 text-sm font-medium border-l border-gray-200 ${statsRange === 'custom' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Custom
          </button>
        </div>
      </div>

      {statsRange === 'custom' && (
        <div className="flex items-center justify-center">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <input
              type="date"
              value={customStatsDate}
              onChange={(e) => setCustomStatsDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-white"
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completed Orders Waiting for Payment */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Orders Ready for Payment
            </h3>
            <span className="badge badge-info">
              {(Array.isArray(dashboardData.ordersForPayment) ? dashboardData.ordersForPayment : []).filter((o) => orderMatchesBusinessUnit(o)).length}
            </span>
          </div>

          <div className="space-y-4">
            {ordersForPaymentSorted
              .filter((o) => orderMatchesBusinessUnit(o))
              .map((order) => (
                <div key={order.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-semibold text-gray-900">
                        Order #{order.id}
                        {order.table_number && ` • Table ${order.table_number}`}
                      </span>
                    <p className="text-xs text-gray-500">
                      Served by: {order.employee_name || 'Staff'}
                    </p>
                  </div>
                  {(() => {
                    const unitSubtotal = getOrderSubtotalForUnitAndMenuItem(order, businessUnit, selectedMenuItemId);
                    const full = parseFloat(order.total_amount) || 0;
                    const showFull = businessUnit !== 'all' && Number.isFinite(full) && Math.abs(full - unitSubtotal) > 0.01;
                    return (
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">
                          ${Number.isFinite(unitSubtotal) ? unitSubtotal.toFixed(2) : '0.00'}
                        </div>
                        {showFull && (
                          <div className="text-xs text-gray-500">
                            of ${full.toFixed(2)}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {(() => {
                  const unit = businessUnit === 'all' ? null : businessUnit;
                  const breakdown = getOrderUnitBreakdown(order, unit);
                  const itemsRaw = Array.isArray(breakdown?.items) ? breakdown.items : [];
                  const targetMenuItemId = selectedMenuItemId !== 'all' ? parseInt(selectedMenuItemId, 10) : null;
                  const items = Number.isFinite(targetMenuItemId)
                    ? itemsRaw.filter((it) => parseInt(it?.menu_item_id, 10) === targetMenuItemId)
                    : itemsRaw;
                  if (!Array.isArray(items) || items.length === 0) return null;
                  return (
                  <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                    <div className="space-y-1">
                      {items.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <span className="font-medium text-gray-900">
                              {parseInt(it.quantity, 10) || 1}x
                            </span>{' '}
                            <span className="text-gray-700">
                              {it.menu_item_name || it.name || 'Item'}
                            </span>
                          </div>
                          <div className="text-gray-600">
                            ${(getItemSubtotalBirr(it) || 0).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })()}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Completed: {new Date(order.updated_at).toLocaleString()}
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => openProcessPaymentConfirm(order)}
                      disabled={isBlockingPaymentUi || processingOrders.has(order.id)}
                      className={`font-medium py-1 px-3 rounded-lg transition-colors duration-200 text-sm ${
                        (isBlockingPaymentUi || processingOrders.has(order.id))
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                    >
                      {processingOrders.has(order.id) ? 'Processing...' : 'Process Payment'}
                    </button>
                    <button
                      onClick={() => openCancelOrderConfirm(order)}
                      disabled={isBlockingPaymentUi || processingOrders.has(order.id)}
                      className={`font-medium py-1 px-3 rounded-lg transition-colors duration-200 text-sm ${
                        (isBlockingPaymentUi || processingOrders.has(order.id))
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-red-500 hover:bg-red-600 text-white'
                      }`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {(Array.isArray(dashboardData.ordersForPayment) ? dashboardData.ordersForPayment : []).filter((o) => orderMatchesBusinessUnit(o)).length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No orders waiting for payment
              </p>
            )}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Recent Payments
            </h3>
          </div>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {filteredRecentPayments.map((payment) => (
              <div key={payment.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-gray-900">
                      Payment #{payment.id}
                    </span>
                    <span className={`ml-2 badge ${
                      payment.status === 'paid' ? 'badge-success' :
                      payment.status === 'pending' ? 'badge-warning' :
                      'badge-error'
                    }`}>
                      {payment.status}
                    </span>
                  </div>
                  {(() => {
                    const unitAmount = getPaymentAmountForSelection(payment, businessUnit, selectedMenuItemId);
                    const orderId = payment?.order_id != null ? parseInt(payment.order_id, 10) : null;
                    const needsDetails = !(businessUnit === 'all' && selectedMenuItemId === 'all');
                    const hasDetails = !needsDetails || (!Number.isFinite(orderId) ? false : !!orderDetailsById?.[orderId]);
                    const display = (needsDetails && !hasDetails) ? null : unitAmount;
                    return (
                      <span className="text-lg font-bold text-gray-900">
                        {display == null ? '...' : `$${(display || 0).toFixed(2)}`}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 capitalize">
                    {payment.payment_method?.replace('_', ' ')}
                  </span>
                  <span className="text-sm text-gray-500">
                    {new Date(payment.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => toggleRecentPaymentDetails(payment)}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {expandedRecentPaymentIds.has(payment.id) ? 'Hide details' : 'Show details'}
                  </button>
                </div>

                {expandedRecentPaymentIds.has(payment.id) && (
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                    {(() => {
                      const orderIdRaw = payment?.order_id;
                      const orderId = orderIdRaw != null ? parseInt(orderIdRaw, 10) : null;
                      if (!Number.isFinite(orderId)) {
                        return <div className="text-sm text-gray-500">No order details</div>;
                      }

                      if (loadingRecentPaymentOrderIds.has(orderId)) {
                        return <div className="text-sm text-gray-500">Loading...</div>;
                      }

                      const order = orderDetailsById?.[orderId] || null;
                      if (!order) {
                        return <div className="text-sm text-gray-500">Details unavailable</div>;
                      }

                      const unit = businessUnit === 'all' ? null : businessUnit;
                      const breakdown = getOrderUnitBreakdown(order, unit);
                      const itemsRaw = Array.isArray(breakdown.items) ? breakdown.items : [];
                      const targetMenuItemId = selectedMenuItemId !== 'all' ? parseInt(selectedMenuItemId, 10) : null;
                      const items = Number.isFinite(targetMenuItemId)
                        ? itemsRaw.filter((it) => parseInt(it?.menu_item_id, 10) === targetMenuItemId)
                        : itemsRaw;

                      return (
                        <>
                          {order.employee_name && (
                            <div className="text-sm text-gray-700">
                              <span className="font-medium">Waiter:</span> {order.employee_name}
                            </div>
                          )}

                          {items.length > 0 && (
                            <div className="text-sm text-gray-700">
                              <div className="font-medium text-gray-900 mb-1">Order Items</div>
                              <div className="space-y-1">
                                {items.map((it) => (
                                  <div key={it.id || `${it.menu_item_id}-${it.quantity}`} className="flex items-center justify-between">
                                    <div className="text-gray-800">
                                      {(parseInt(it.quantity, 10) || 0)} x {it.menu_item_name || it.name || 'Item'}
                                    </div>
                                    <div className="text-gray-600">
                                      ${(getItemSubtotalBirr(it) || 0).toFixed(2)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
            {filteredRecentPayments.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No recent payments
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button 
            onClick={handleQuickProcessPayment}
            className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <FiCreditCard className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">Process Payment</span>
          </button>
          <button 
            onClick={handleQuickGenerateQR}
            className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <FiSquare className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">Generate QR</span>
          </button>
          <button 
            onClick={handleViewReports}
            className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <FiTrendingUp className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">View Reports</span>
          </button>
          <button 
            onClick={handleMyProfile}
            className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <FiUser className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">My Profile</span>
          </button>
        </div>
      </div>

      {/* Process Payment Modal */}
      {showProcessPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Process Payment</h3>
              <button
                onClick={() => setShowProcessPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            
            {selectedOrder && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900">Order #{selectedOrder.id}</h4>
                  <p className="text-sm text-gray-600">
                    {selectedOrder.type === 'cafe' ? 'Café' : 'Bakery'} Order
                    {selectedOrder.table_number && ` • Table ${selectedOrder.table_number}`}
                  </p>
                  <p className="text-lg font-bold text-green-600 mt-2">
                    ${parseFloat(selectedOrder.total_amount).toFixed(2)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Method
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="cash"
                        checked={paymentMethod === 'cash'}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700 flex items-center">
                        <FiDollarSign className="w-4 h-4 mr-1" />
                        Cash Payment
                      </span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="qr_code"
                        checked={paymentMethod === 'qr_code'}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700 flex items-center">
                        <FiSquare className="w-4 h-4 mr-1" />
                        QR Code Payment
                      </span>
                    </label>
                  </div>
                </div>

                {qrCode && paymentMethod === 'qr_code' && (
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <div className="bg-white p-4 rounded-lg inline-block">
                      <div className="w-32 h-32 bg-gray-200 flex items-center justify-center rounded">
                        <span className="text-xs text-gray-500">QR Code</span>
                      </div>
                    </div>
                    <p className="text-sm text-blue-600 mt-2">Show this QR code to customer</p>
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => setShowProcessPaymentModal(false)}
                    className="btn-outline"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={processPaymentWithMethod}
                    className="btn-primary"
                  >
                    {paymentMethod === 'cash' ? 'Process Cash Payment' : 'Generate QR Code'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showConfirmProcessPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Process Payment</h3>
              <button
                onClick={() => {
                  setShowConfirmProcessPaymentModal(false);
                  setConfirmProcessPaymentOrder(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900">Order #{confirmProcessPaymentOrder?.id}</h4>
                <p className="text-sm text-gray-600">
                  {confirmProcessPaymentOrder?.type === 'cafe' ? 'Café' : 'Bakery'} Order
                  {confirmProcessPaymentOrder?.table_number && ` • Table ${confirmProcessPaymentOrder.table_number}`}
                </p>
                <p className="text-lg font-bold text-green-600 mt-2">
                  ${parseFloat(confirmProcessPaymentOrder?.total_amount || 0).toFixed(2)}
                </p>
              </div>

              <div className="text-sm text-gray-700">
                Are you sure?
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowConfirmProcessPaymentModal(false);
                    setConfirmProcessPaymentOrder(null);
                  }}
                  className="btn btn-outline"
                  disabled={isBlockingPaymentUi || processingOrders.has(confirmProcessPaymentOrder?.id)}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const order = confirmProcessPaymentOrder;
                    if (!order) return;
                    if (isBlockingPaymentUi) return;
                    if (processingOrders.has(order.id) || processingOrdersRef.current.has(order.id)) return;

                    flushSync(() => setIsBlockingPaymentUi(true));
                    setShowConfirmProcessPaymentModal(false);
                    setConfirmProcessPaymentOrder(null);
                    handleConfirmProcessPaymentYes(order);
                  }}
                  className="btn btn-primary"
                  disabled={isBlockingPaymentUi || processingOrders.has(confirmProcessPaymentOrder?.id)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProcessPaymentConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Cancel Order</h3>
              <button
                onClick={() => {
                  setShowProcessPaymentConfirmModal(false);
                  setConfirmOrder(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900">Order #{confirmOrder?.id}</h4>
                <p className="text-sm text-gray-600">
                  {confirmOrder?.type === 'cafe' ? 'Café' : 'Bakery'} Order
                  {confirmOrder?.table_number && ` • Table ${confirmOrder.table_number}`}
                </p>
                <p className="text-lg font-bold text-green-600 mt-2">
                  ${parseFloat(confirmOrder?.total_amount || 0).toFixed(2)}
                </p>
              </div>

              <div className="text-sm text-gray-700">
                Are you sure?
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowProcessPaymentConfirmModal(false);
                    setConfirmOrder(null);
                  }}
                  className="btn btn-outline"
                  disabled={processingOrders.has(confirmOrder?.id)}
                >
                  No
                </button>
                <button
                  onClick={() => handleConfirmProcessPaymentNo()}
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

      {/* Generate QR Modal */}
      {showGenerateQRModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Generate QR Code</h3>
              <button
                onClick={() => {
                  setShowGenerateQRModal(false);
                  setQrCode(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter amount"
                  className="input-field"
                  id="qr-amount"
                />
              </div>

              {qrCode && (
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <div className="bg-white p-4 rounded-lg inline-block">
                    <div className="w-32 h-32 bg-gray-200 flex items-center justify-center rounded">
                      <span className="text-xs text-gray-500">QR Code</span>
                    </div>
                  </div>
                  <p className="text-sm text-blue-600 mt-2">Customer can scan this QR code to pay</p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => {
                    setShowGenerateQRModal(false);
                    setQrCode(null);
                  }}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const amount = document.getElementById('qr-amount').value;
                    if (amount && parseFloat(amount) > 0) {
                      generateStandaloneQR(parseFloat(amount));
                    } else {
                      toast.error('Please enter a valid amount');
                    }
                  }}
                  className="btn-primary"
                >
                  Generate QR Code
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reports Modal */}
      {showReportsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Payment Reports</h3>
              <button
                onClick={() => setShowReportsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Today's Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-600">Total Payments</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {dashboardData.todayStats.paymentsProcessed}
                      </p>
                    </div>
                    <FiBarChart2 className="w-8 h-8 text-blue-500" />
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-600">Total Revenue</p>
                      <p className="text-2xl font-bold text-green-900">
                        ${dashboardData.todayStats.totalRevenue.toFixed(2)}
                      </p>
                    </div>
                    <FiDollarSign className="w-8 h-8 text-green-500" />
                  </div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-600">QR Payments</p>
                      <p className="text-2xl font-bold text-purple-900">
                        {dashboardData.todayStats.qrPayments}
                      </p>
                    </div>
                    <FiSquare className="w-8 h-8 text-purple-500" />
                  </div>
                </div>
              </div>

              {/* Payment Method Breakdown */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Payment Methods Today</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Cash Payments</span>
                    <span className="font-medium">{dashboardData.todayStats.cashPayments}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">QR Code Payments</span>
                    <span className="font-medium">{dashboardData.todayStats.qrPayments}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowReportsModal(false)}
                  className="btn-primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">My Profile</h3>
              <button
                onClick={() => setShowProfileModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-20 h-20 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl font-bold text-white">
                    {user?.full_name?.charAt(0)?.toUpperCase()}
                  </span>
                </div>
                <h4 className="text-lg font-semibold text-gray-900">{user?.full_name}</h4>
                <p className="text-sm text-gray-600 capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FiUser className="w-4 h-4 inline mr-1" />
                  Full Name
                </label>
                <input
                  type="text"
                  value={profileData.full_name}
                  onChange={(e) => setProfileData(prev => ({ ...prev, full_name: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FiMail className="w-4 h-4 inline mr-1" />
                  Email
                </label>
                <input
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FiPhone className="w-4 h-4 inline mr-1" />
                  Phone
                </label>
                <input
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                  className="input-field"
                  placeholder="Enter phone number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FiMapPin className="w-4 h-4 inline mr-1" />
                  Address
                </label>
                <textarea
                  value={profileData.address}
                  onChange={(e) => setProfileData(prev => ({ ...prev, address: e.target.value }))}
                  className="input-field"
                  rows="3"
                  placeholder="Enter address"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button
                  onClick={updateProfile}
                  className="btn-primary"
                >
                  Update Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashierDashboard;
