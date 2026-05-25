import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useDashboardFilters } from '../context/DashboardFilterContext';
import { FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';

const getOrderUnitKey = (order) => {
  const raw = String(order?.type || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'bakery') return 'cafe';
  if (raw === 'cafe' || raw === 'restaurant' || raw === 'barista') return raw;
  return raw;
};

const getItemSubtotal = (item) => {
  const subtotal = parseFloat(item?.subtotal);
  if (Number.isFinite(subtotal)) return subtotal;

  const qty = parseInt(item?.quantity, 10) || 0;
  const unitPrice = parseFloat(item?.unit_price);
  if (Number.isFinite(unitPrice) && qty > 0) return unitPrice * qty;

  const price = parseFloat(item?.price);
  if (Number.isFinite(price) && qty > 0) return price * qty;

  return 0;
};

const getItemQty = (item) => {
  const qty = parseInt(item?.quantity, 10);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
};

const toDateInputValue = (d) => {
  try {
    const x = new Date(d);
    const yyyy = String(x.getFullYear());
    const mm = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    const x = new Date();
    const yyyy = String(x.getFullYear());
    const mm = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
};

const parseDateInputLocal = (value) => {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month - 1, day);
};

const getLocalDayStart = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const getLocalDayEnd = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const normalizeUnitKey = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'bakery') return 'cafe';
  if (s === 'cafe' || s.includes('cafe')) return 'cafe';
  if (s === 'barista' || s.includes('barista')) return 'barista';
  if (s === 'restaurant' || s.includes('restaurant') || s.includes('restorant') || s.includes('ጾም')) return 'restaurant';
  return null;
};

const getMenuItemDepartment = (menuItem) => {
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
};

const PaymentsItems = () => {
  const { businessUnit, setBusinessUnit, selectedMenuItemId, menuItems } = useDashboardFilters();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState([]);

  const [dateRange, setDateRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState(() => toDateInputValue(new Date()));
  const [customEndDate, setCustomEndDate] = useState(() => toDateInputValue(new Date()));
  const [customMode, setCustomMode] = useState('specific');

  const [ordersById, setOrdersById] = useState({});
  const ordersByIdRef = useRef({});
  const loadingOrderIdsRef = useRef(new Set());
  const pendingOrdersByIdRef = useRef({});
  const flushOrdersTimerRef = useRef(null);

  const [bulkOrdersLoading, setBulkOrdersLoading] = useState(false);

  const menuDeptById = useMemo(() => {
    const list = Array.isArray(menuItems) ? menuItems : [];
    const map = {};
    for (const it of list) {
      const id = it?.id != null ? parseInt(it.id, 10) : null;
      if (!Number.isFinite(id)) continue;
      const dept = getMenuItemDepartment(it);
      if (!dept) continue;
      map[id] = dept;
    }
    return map;
  }, [menuItems]);

  const flushPendingOrders = useCallback(() => {
    const pending = pendingOrdersByIdRef.current || {};
    const keys = Object.keys(pending);
    if (keys.length === 0) return;

    pendingOrdersByIdRef.current = {};

    setOrdersById((prev) => {
      const next = { ...prev, ...pending };
      ordersByIdRef.current = next;
      return next;
    });
  }, []);

  const scheduleFlushOrders = useCallback(() => {
    if (flushOrdersTimerRef.current) return;
    flushOrdersTimerRef.current = setTimeout(() => {
      flushOrdersTimerRef.current = null;
      flushPendingOrders();
    }, 350);
  }, [flushPendingOrders]);

  useEffect(() => {
    return () => {
      if (flushOrdersTimerRef.current) {
        clearTimeout(flushOrdersTimerRef.current);
        flushOrdersTimerRef.current = null;
      }
    };
  }, []);

  const resetOrdersCache = useCallback(() => {
    ordersByIdRef.current = {};
    loadingOrderIdsRef.current = new Set();
    pendingOrdersByIdRef.current = {};
    if (flushOrdersTimerRef.current) {
      clearTimeout(flushOrdersTimerRef.current);
      flushOrdersTimerRef.current = null;
    }
    setOrdersById({});
    setBulkOrdersLoading(false);
  }, []);

  const fetchPayments = useCallback(async (mode = 'initial') => {
    const setBusy = mode === 'initial' ? setLoading : setRefreshing;
    setBusy(true);

    try {
      if (mode === 'initial' || mode === 'refresh') resetOrdersCache();
      const resp = await api.payments.getAll();
      const list = resp?.data?.data?.payments ?? resp?.data?.payments ?? [];
      setPayments(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Error fetching payments:', e);
      toast.error('Failed to load payments');
    } finally {
      setBusy(false);
    }
  }, [resetOrdersCache]);

  useEffect(() => {
    fetchPayments('initial');
  }, [fetchPayments]);

  const ensureOrderLoaded = useCallback(async (orderId) => {
    const id = orderId != null ? parseInt(orderId, 10) : null;
    if (!Number.isFinite(id)) return;
    if (ordersByIdRef.current?.[id]) return;
    if (loadingOrderIdsRef.current.has(id)) return;

    loadingOrderIdsRef.current.add(id);

    try {
      const resp = await api.orders.getById(id);
      const order = resp?.data?.data?.order ?? resp?.data?.order ?? null;
      if (order) {
        ordersByIdRef.current[id] = order;
        pendingOrdersByIdRef.current[id] = order;
        scheduleFlushOrders();
      }
    } catch (e) {
      console.error('Error fetching order:', e);
    } finally {
      loadingOrderIdsRef.current.delete(id);
    }
  }, [scheduleFlushOrders]);

  const dateRangeBounds = useMemo(() => {
    const now = new Date();

    if (dateRange === 'all') return { start: null, end: null };

    if (dateRange === 'today') {
      return { start: getLocalDayStart(now), end: getLocalDayEnd(now) };
    }

    if (dateRange === 'week') {
      const start = getLocalDayStart(now);
      start.setDate(start.getDate() - 6);
      return { start, end: getLocalDayEnd(now) };
    }

    if (dateRange === 'month') {
      const start = getLocalDayStart(now);
      start.setDate(1);
      return { start, end: getLocalDayEnd(now) };
    }

    if (dateRange === 'custom') {
      const startDate = parseDateInputLocal(customStartDate);
      if (!startDate) return { start: null, end: null };
      const endSeed = customMode === 'specific' ? startDate : parseDateInputLocal(customEndDate);
      if (!endSeed) return { start: null, end: null };
      const start = getLocalDayStart(startDate);
      const end = getLocalDayEnd(endSeed);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return { start: null, end: null };
      if (end < start) return { start: end, end: start };
      return { start, end };
    }

    return { start: null, end: null };
  }, [customEndDate, customStartDate, dateRange]);

  const filteredPaidPayments = useMemo(() => {
    const list = Array.isArray(payments) ? payments : [];
    const paid = list.filter((p) => String(p?.status || '').toLowerCase() === 'paid');

    const { start, end } = dateRangeBounds;
    if (!start || !end) return paid;

    return paid.filter((p) => {
      const dt = p?.created_at ? new Date(p.created_at) : null;
      if (!dt || !Number.isFinite(dt.getTime())) return false;
      return dt >= start && dt <= end;
    });
  }, [dateRangeBounds, payments]);

  const uniqueOrderIds = useMemo(() => {
    return Array.from(new Set(filteredPaidPayments
      .map((p) => (p?.order_id != null ? parseInt(p.order_id, 10) : null))
      .filter((x) => Number.isFinite(x))));
  }, [filteredPaidPayments]);

  const loadedOrdersCountForSelection = useMemo(() => {
    const ids = Array.isArray(uniqueOrderIds) ? uniqueOrderIds : [];
    let count = 0;
    for (const id of ids) {
      if (ordersById?.[id]) count += 1;
    }
    return count;
  }, [ordersById, uniqueOrderIds]);

  useEffect(() => {
    if (uniqueOrderIds.length === 0) {
      setBulkOrdersLoading(false);
      return;
    }

    let cancelled = false;
    const CONCURRENCY = 5;
    let nextIndex = 0;

    setBulkOrdersLoading(true);

    const worker = async () => {
      while (!cancelled) {
        const idx = nextIndex;
        nextIndex += 1;
        const oid = uniqueOrderIds[idx];
        if (oid == null) return;

        await ensureOrderLoaded(oid);
      }
    };

    (async () => {
      const workers = Array.from(
        { length: Math.min(CONCURRENCY, uniqueOrderIds.length) },
        () => worker()
      );
      await Promise.all(workers);
      if (cancelled) return;
      flushPendingOrders();
      setBulkOrdersLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ensureOrderLoaded, flushPendingOrders, uniqueOrderIds]);

  const soldItems = useMemo(() => {
    const targetMenuItemId = selectedMenuItemId && selectedMenuItemId !== 'all'
      ? parseInt(selectedMenuItemId, 10)
      : null;

    const agg = new Map();
    const orders = (Array.isArray(uniqueOrderIds) ? uniqueOrderIds : [])
      .map((id) => ordersById?.[id])
      .filter(Boolean);

    for (const order of orders) {
      const fallbackUnitKey = getOrderUnitKey(order) || 'unknown';

      const items = Array.isArray(order?.items) ? order.items : [];
      for (const it of items) {
        const mid = it?.menu_item_id != null ? parseInt(it.menu_item_id, 10) : null;
        if (Number.isFinite(targetMenuItemId) && (!Number.isFinite(mid) || mid !== targetMenuItemId)) continue;

        const fromItem = normalizeUnitKey(it?.department) || normalizeUnitKey(it?.type) || normalizeUnitKey(it?.main_category) || normalizeUnitKey(it?.category) || normalizeUnitKey(it?.sub_category);
        const fromMenu = Number.isFinite(mid) ? menuDeptById?.[mid] : null;
        const itemUnitKey = fromItem || fromMenu || fallbackUnitKey;
        if (businessUnit !== 'all' && itemUnitKey !== businessUnit) continue;

        const nameRaw = it?.menu_item_name || it?.name;
        const name = String(nameRaw || 'Unknown').trim() || 'Unknown';

        const keyPart = Number.isFinite(mid) ? `id:${mid}` : `name:${name.toLowerCase()}`;
        const key = `${itemUnitKey}:${keyPart}`;

        const prev = agg.get(key) || {
          key,
          unit: itemUnitKey,
          menu_item_id: Number.isFinite(mid) ? mid : null,
          name,
          qty: 0,
          revenue: 0,
        };

        prev.qty += getItemQty(it);
        prev.revenue += getItemSubtotal(it);
        agg.set(key, prev);
      }
    }

    return Array.from(agg.values()).sort((a, b) => {
      if ((b.qty || 0) !== (a.qty || 0)) return (b.qty || 0) - (a.qty || 0);
      return (b.revenue || 0) - (a.revenue || 0);
    });
  }, [ordersById, businessUnit, menuDeptById, selectedMenuItemId, uniqueOrderIds]);

  const soldTotals = useMemo(() => {
    return soldItems.reduce((acc, row) => {
      acc.distinct += 1;
      acc.qty += Number(row?.qty || 0);
      acc.revenue += Number(row?.revenue || 0);
      return acc;
    }, { distinct: 0, qty: 0, revenue: 0 });
  }, [soldItems]);

  const foodDrinkTotals = useMemo(() => {
    if (businessUnit !== 'all') return null;

    return soldItems.reduce((acc, row) => {
      const isDrink = String(row?.unit || '').toLowerCase() === 'barista';
      const bucket = isDrink ? acc.drinks : acc.food;
      bucket.distinct += 1;
      bucket.qty += Number(row?.qty || 0);
      bucket.revenue += Number(row?.revenue || 0);
      return acc;
    }, {
      food: { distinct: 0, qty: 0, revenue: 0 },
      drinks: { distinct: 0, qty: 0, revenue: 0 },
    });
  }, [businessUnit, soldItems]);

  if (loading) {
    return <LoadingSpinner text="Loading payments..." />;
  }

  const viewingLabel = dateRange === 'today'
    ? 'Today'
    : dateRange === 'week'
    ? 'This Week'
    : dateRange === 'month'
    ? 'This Month'
    : dateRange === 'all'
    ? 'All'
    : customMode === 'specific'
    ? customStartDate
    : `${customStartDate} - ${customEndDate}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Foods & Drinks Sold</h1>
          <p className="text-gray-600 mt-1">Sold items summary based on paid payments</p>
          <div className="text-xs text-gray-500 mt-1">
            Orders loaded: {loadedOrdersCountForSelection}/{uniqueOrderIds.length}
            {bulkOrdersLoading ? ` (loading...)` : ''}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Paid payments: {filteredPaidPayments.length}
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchPayments('refresh')}
          className="btn-outline flex items-center"
          disabled={refreshing}
        >
          <FiRefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'all', label: 'All' },
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'Week' },
            { key: 'month', label: 'Month' },
            { key: 'custom', label: 'Custom' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setDateRange(opt.key)}
              className={
                dateRange === opt.key
                  ? 'px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white'
                  : 'px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {dateRange === 'custom' && (
          <div className="flex flex-col gap-3">
            <div className="bg-gray-50 rounded-xl p-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCustomMode('specific')}
                className={
                  customMode === 'specific'
                    ? 'flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-gray-200 shadow-sm'
                    : 'flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-white/70'
                }
              >
                Specific Date
              </button>
              <button
                type="button"
                onClick={() => setCustomMode('range')}
                className={
                  customMode === 'range'
                    ? 'flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-gray-200 shadow-sm'
                    : 'flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-white/70'
                }
              >
                Date Range
              </button>
            </div>

            {customMode === 'specific' ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => {
                    setCustomStartDate(e.target.value);
                    setCustomEndDate(e.target.value);
                  }}
                  className="input-field w-[220px]"
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-600">From</div>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="input-field w-[160px]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-600">To</div>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="input-field w-[160px]"
                  />
                </div>
              </div>
            )}

            <div className="px-3 py-2 rounded-lg bg-orange-50 text-orange-700 text-sm font-semibold border border-orange-100">
              Viewing: {viewingLabel}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'all', label: 'All' },
            { key: 'cafe', label: 'Cafe' },
            { key: 'barista', label: 'Barista' },
            { key: 'restaurant', label: 'Restaurant' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setBusinessUnit(opt.key)}
              className={
                businessUnit === opt.key
                  ? 'px-4 py-2 rounded-lg text-sm font-semibold bg-secondary-600 text-white'
                  : 'px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Items</h3>
          <div className="text-sm text-gray-600">
            {businessUnit === 'all' && foodDrinkTotals ? (
              <>
                Food Qty: {foodDrinkTotals.food.qty} | Soft Drinks Qty: {foodDrinkTotals.drinks.qty}
              </>
            ) : (
              <>
                Distinct: {soldTotals.distinct} | Qty: {soldTotals.qty} | Revenue: ${soldTotals.revenue.toFixed(2)}
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                {businessUnit === 'all' && (
                  <th className="table-header text-left py-3 px-4">Unit</th>
                )}
                <th className="table-header text-left py-3 px-4">Item</th>
                <th className="table-header text-left py-3 px-4">Qty Sold</th>
                <th className="table-header text-left py-3 px-4">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {soldItems.map((row) => (
                <tr key={row.key} className="border-b border-gray-100 hover:bg-gray-50">
                  {businessUnit === 'all' && (
                    <td className="table-cell capitalize">{row.unit}</td>
                  )}
                  <td className="table-cell font-semibold text-gray-900">{row.name}</td>
                  <td className="table-cell">{row.qty}</td>
                  <td className="table-cell font-semibold">${Number(row.revenue || 0).toFixed(2)}</td>
                </tr>
              ))}

              {soldItems.length === 0 && (
                <tr>
                  <td colSpan={businessUnit === 'all' ? 4 : 3} className="px-4 py-10 text-center text-gray-500">
                    {filteredPaidPayments.length === 0 ? 'No paid payments found for the selected date range' : 'Loading sold items...'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {bulkOrdersLoading && uniqueOrderIds.length > 0 && (
          <div className="px-6 py-4 text-sm text-gray-600 border-t border-gray-100">
            Loading orders: {loadedOrdersCountForSelection}/{uniqueOrderIds.length}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentsItems;
