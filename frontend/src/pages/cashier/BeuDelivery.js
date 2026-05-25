import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import BranchBadge from '../../components/common/BranchBadge';
import {
  FiPlus,
  FiMinus,
  FiShoppingCart,
  FiCheck,
  FiX,
  FiSearch,
  FiDollarSign,
  FiSquare,
  FiTruck,
  FiUser,
  FiPhone,
  FiRefreshCw,
  FiPrinter,
  FiClock
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Beu Delivery Module
 * Standalone delivery channel accessible only to Cashier and Admin.
 * Cashier independently manages orders and payments using the existing menu.
 * Zero connection to the waiter workflow.
 */
const BeuDelivery = () => {
  const { user } = useAuth();

  // ─── Menu State ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [selectedMainCategory, setSelectedMainCategory] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  // ─── Order State ──────────────────────────────────────────────────────────
  const [orderItems, setOrderItems] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  // ─── Success Modal ────────────────────────────────────────────────────────
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastOrderSummary, setLastOrderSummary] = useState(null);

  // ─── Fetch Menu ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const CACHE_KEY = 'beu_delivery_menu_cache_v1';
    const CACHE_TTL = 5 * 60 * 1000;

    const loadCache = () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.items) || !Number.isFinite(parsed.ts)) return null;
        if (Date.now() - parsed.ts > CACHE_TTL) return null;
        return parsed.items;
      } catch { return null; }
    };

    const saveCache = (items) => {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items })); } catch { }
    };

    const normalize = (rawItems) =>
      (Array.isArray(rawItems) ? rawItems : [])
        .map(item => ({
          ...item,
          main_category: item.main_category || 'cafe',
          sub_category: item.sub_category || item.category || '',
          is_available: typeof item.is_available === 'boolean' ? item.is_available : (item.available ?? true),
        }))
        .filter(item => item.is_available);

    const fetchMenu = async () => {
      try {
        const cached = loadCache();
        if (cached && cached.length > 0) {
          if (!cancelled) { setMenuItems(cached); setFilteredItems(cached); setLoading(false); }
        } else {
          if (!cancelled) setLoading(true);
        }

        const resp = await api.menu.getCafeMenu();
        const rawItems = resp?.data?.data?.menuItems ?? resp?.data?.menuItems ?? [];
        const available = normalize(rawItems);

        if (!cancelled) {
          setMenuItems(available);
          setFilteredItems(available);
          saveCache(available);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error('Failed to load menu items');
          setLoading(false);
        }
      }
    };

    fetchMenu();
    return () => { cancelled = true; };
  }, []);

  // ─── Category Filtering ───────────────────────────────────────────────────
  useEffect(() => {
    const mainFiltered = selectedMainCategory === 'all'
      ? menuItems
      : menuItems.filter(item => (item.main_category || 'cafe') === selectedMainCategory);

    if (selectedCategory === 'all') {
      setFilteredItems(mainFiltered);
    } else {
      setFilteredItems(mainFiltered.filter(item => (item.sub_category || item.category) === selectedCategory));
    }
  }, [selectedCategory, selectedMainCategory, menuItems]);

  // ─── Search ───────────────────────────────────────────────────────────────
  const searchedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredItems;
    return filteredItems.filter(item =>
      (item.name || '').toLowerCase().includes(q) ||
      (item.sub_category || '').toLowerCase().includes(q) ||
      (item.main_category || '').toLowerCase().includes(q)
    );
  }, [filteredItems, searchQuery]);

  // ─── Category Helpers ─────────────────────────────────────────────────────
  const getMainCategories = useCallback(() => {
    return [...new Set(menuItems.map(item => item.main_category || 'cafe').filter(Boolean))].sort();
  }, [menuItems]);

  const getCategories = useCallback(() => {
    const source = selectedMainCategory === 'all'
      ? menuItems
      : menuItems.filter(item => (item.main_category || 'cafe') === selectedMainCategory);
    return [...new Set(source.map(item => item.sub_category || item.category).filter(Boolean))].sort();
  }, [menuItems, selectedMainCategory]);

  const getMainCategoryLabel = (cat) => {
    const k = String(cat || '').trim().toLowerCase();
    if (k === 'fasting') return 'የጾም ምግብ';
    if (k === 'fasting_break') return 'የፍስክ ምግብ';
    if (!k) return '';
    return k.charAt(0).toUpperCase() + k.slice(1);
  };

  // ─── Cart Operations ──────────────────────────────────────────────────────
  const addToOrder = useCallback((menuItem) => {
    setOrderItems(prev => {
      const existing = prev.find(i => i.menu_item_id === menuItem.id);
      if (existing) {
        return prev.map(i => i.menu_item_id === menuItem.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        menu_item_id: menuItem.id,
        menu_item_name: menuItem.name,
        price: menuItem.price,
        quantity: 1,
      }];
    });
    toast.success('Added to cart', { id: 'beu-add', duration: 700, icon: '🛵' });
  }, []);

  const removeFromOrder = useCallback((menuItemId) => {
    setOrderItems(prev => prev.filter(i => i.menu_item_id !== menuItemId));
  }, []);

  const updateQuantity = useCallback((menuItemId, change) => {
    setOrderItems(prev =>
      prev
        .map(i => i.menu_item_id === menuItemId ? { ...i, quantity: i.quantity + change } : i)
        .filter(i => i.quantity > 0)
    );
  }, []);

  const calculateTotal = useCallback(() => {
    return orderItems.reduce((sum, i) => sum + parseFloat(i.price) * i.quantity, 0).toFixed(2);
  }, [orderItems]);

  const resetOrder = () => {
    setOrderItems([]);
    setCustomerName('');
    setCustomerPhone('');
    setPaymentMethod('cash');
    setSearchQuery('');
    setSelectedMainCategory('all');
    setSelectedCategory('all');
  };

  // ─── Place Order + Process Payment ────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (submitLockRef.current || submitting) return;

    if (orderItems.length === 0) {
      toast.error('Please add at least one item to the order');
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);

    try {
      const employeeId = user?.id != null
        ? parseInt(user.id, 10)
        : (user?.user_id != null ? parseInt(user.user_id, 10) : null);

      if (!Number.isFinite(employeeId)) {
        toast.error('Invalid user session. Please login again.');
        return;
      }

      const totalAmount = parseFloat(calculateTotal());

      // Step 1: Create the delivery order
      const orderData = {
        employee_id: employeeId,
        type: 'cafe',
        items: orderItems.map(item => {
          const unitPrice = parseFloat(item.price);
          const quantity = parseInt(item.quantity, 10);
          return {
            menu_item_id: parseInt(item.menu_item_id, 10),
            menu_item_name: item.menu_item_name,
            quantity,
            unit_price: unitPrice,
            subtotal: unitPrice * quantity,
            item_type: 'food',
          };
        }),
        total_amount: totalAmount,
        notes: `Beu Delivery${customerName.trim() ? ` - ${customerName.trim()}` : ''}${customerPhone.trim() ? ` (${customerPhone.trim()})` : ''}`,
      };

      const orderResp = await api.orders.createCafe(orderData);
      const createdOrder = orderResp?.data?.data?.order ?? orderResp?.data?.order;
      const orderId = createdOrder?.id;

      if (!orderId) {
        throw new Error('Order creation did not return an order ID.');
      }

      // Step 2: Immediately create & confirm payment (bypasses waiter queue)
      const paymentData = {
        order_id: orderId,
        amount: totalAmount,
        payment_method: paymentMethod,
        status: 'pending',
        processed_by: employeeId,
      };

      const payResp = await api.payments.create(paymentData);
      const createdPayment = payResp?.data?.data?.payment ?? payResp?.data?.payment;

      if (createdPayment?.id) {
        await api.payments.confirm(createdPayment.id, { processed_by: employeeId });
      }

      // Step 3: Show success summary
      setLastOrderSummary({
        orderId,
        items: [...orderItems],
        total: totalAmount,
        paymentMethod,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        timestamp: new Date(),
      });
      setShowSuccessModal(true);
      resetOrder();
      toast.success(`Delivery order #${orderId} placed and paid!`);
    } catch (err) {
      console.error('[BeuDelivery] Error:', err);
      const msg = err?.response?.data?.message || err?.message || 'Failed to place delivery order';
      toast.error(msg);
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return <LoadingSpinner text="Loading Beu Delivery menu..." />;
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow">
            <FiTruck className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-gray-900">Beu Delivery</h1>
              <BranchBadge />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Standalone delivery — cashier manages order &amp; payment</p>
          </div>
        </div>
        <button
          onClick={resetOrder}
          className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <FiRefreshCw className="w-4 h-4" />
          <span>Clear</span>
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">

        {/* ── Left: Menu Panel ── */}
        <div className="flex-1 min-w-0">

          {/* Search Bar */}
          <div className="relative mb-4">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search menu items…"
              className="w-full pl-12 pr-10 py-3 rounded-xl bg-white shadow border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm"
            />
            {searchQuery.trim() && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
              >
                <FiX className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>

          {/* Main Category Tabs */}
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => { setSelectedMainCategory('all'); setSelectedCategory('all'); }}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                selectedMainCategory === 'all'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-gray-700 shadow border border-gray-200 hover:bg-gray-50'
              }`}
            >
              All ({menuItems.length})
            </button>
            {getMainCategories().map(cat => {
              const count = menuItems.filter(i => (i.main_category || 'cafe') === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => { setSelectedMainCategory(cat); setSelectedCategory('all'); }}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    selectedMainCategory === cat
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white text-gray-700 shadow border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {getMainCategoryLabel(cat)} ({count})
                </button>
              );
            })}
          </div>

          {/* Sub-Category Pills */}
          {getCategories().length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                  selectedCategory === 'all'
                    ? 'bg-indigo-100 text-indigo-700 font-semibold'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                All Sub-categories
              </button>
              {getCategories().map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                    selectedCategory === cat
                      ? 'bg-indigo-100 text-indigo-700 font-semibold'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
            </div>
          )}

          {/* Result Count */}
          <p className="text-xs text-gray-400 mb-3">
            Showing {searchedItems.length} of {filteredItems.length} items
          </p>

          {/* Menu Grid */}
          {searchedItems.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FiSearch className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                {menuItems.length === 0 ? 'No menu items available.' : 'No items match your search.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {searchedItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => addToOrder(item)}
                  className="group bg-white rounded-2xl shadow hover:shadow-xl transition-all duration-200 cursor-pointer hover:scale-105 p-4 flex flex-col items-center text-center"
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xl flex items-center justify-center mb-3 group-hover:bg-indigo-100 transition-colors">
                    {String(item.name || '?').trim().slice(0, 1).toUpperCase()}
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-2 line-clamp-2">
                    {item.name}
                  </h3>
                  <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full">
                    {parseFloat(item.price).toFixed(2)} Birr
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Order + Payment Panel ── */}
        <div className="xl:w-96 flex-shrink-0">
          <div className="xl:sticky xl:top-6 space-y-4">

            {/* Customer Info Card */}
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center space-x-2">
                <FiUser className="w-4 h-4 text-indigo-500" />
                <span>Customer Info <span className="font-normal text-gray-400">(optional)</span></span>
              </h3>
              <div className="space-y-2">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <div className="relative">
                  <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>
            </div>

            {/* Cart Card */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="bg-indigo-600 p-4 text-white flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FiShoppingCart className="w-5 h-5" />
                  <span className="font-bold text-base">Order Cart</span>
                </div>
                <span className="bg-white bg-opacity-20 rounded-full px-2.5 py-0.5 text-sm font-semibold">
                  {orderItems.reduce((s, i) => s + i.quantity, 0)} items
                </span>
              </div>

              <div className="p-4 max-h-72 overflow-y-auto">
                {orderItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <FiShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Cart is empty — tap a menu item to add</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orderItems.map(item => (
                      <div key={item.menu_item_id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold text-sm flex items-center justify-center flex-shrink-0">
                          {String(item.menu_item_name || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.menu_item_name}</p>
                          <p className="text-xs text-gray-500">{parseFloat(item.price).toFixed(2)} Birr each</p>
                        </div>
                        <div className="flex items-center space-x-1 flex-shrink-0">
                          <button
                            onClick={() => updateQuantity(item.menu_item_id, -1)}
                            className="w-7 h-7 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center transition-colors"
                          >
                            <FiMinus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.menu_item_id, 1)}
                            className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 flex items-center justify-center transition-colors"
                          >
                            <FiPlus className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromOrder(item.menu_item_id)}
                          className="w-7 h-7 rounded-full bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-colors flex-shrink-0"
                        >
                          <FiX className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {orderItems.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-gray-900">Total:</span>
                    <span className="text-xl font-bold text-indigo-600">{calculateTotal()} Birr</span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Method Card */}
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment Method</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex items-center justify-center space-x-2 p-3 rounded-xl border-2 font-semibold text-sm transition-all duration-200 ${
                    paymentMethod === 'cash'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <FiDollarSign className="w-4 h-4" />
                  <span>Cash</span>
                  {paymentMethod === 'cash' && <FiCheck className="w-4 h-4 text-indigo-600" />}
                </button>
                <button
                  onClick={() => setPaymentMethod('qr_code')}
                  className={`flex items-center justify-center space-x-2 p-3 rounded-xl border-2 font-semibold text-sm transition-all duration-200 ${
                    paymentMethod === 'qr_code'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <FiSquare className="w-4 h-4" />
                  <span>QR Code</span>
                  {paymentMethod === 'qr_code' && <FiCheck className="w-4 h-4 text-indigo-600" />}
                </button>
              </div>
            </div>

            {/* Place Order Button */}
            <button
              onClick={handlePlaceOrder}
              disabled={orderItems.length === 0 || submitting}
              className={`w-full flex items-center justify-center space-x-2 py-4 rounded-xl font-bold text-base transition-all duration-200 shadow-lg ${
                orderItems.length === 0 || submitting
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-xl'
              }`}
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing…</span>
                </>
              ) : (
                <>
                  <FiTruck className="w-5 h-5" />
                  <span>Place Delivery Order &amp; Pay</span>
                </>
              )}
            </button>

            {orderItems.length === 0 && (
              <p className="text-center text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg py-2 px-3">
                Add items from the menu to place an order
              </p>
            )}

          </div>
        </div>
      </div>

      {/* ── Success Modal ── */}
      {showSuccessModal && lastOrderSummary && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="bg-green-500 p-6 text-white text-center">
              <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-3">
                <FiCheck className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold">Order Placed!</h2>
              <p className="text-green-100 text-sm mt-1">Beu Delivery Order #{lastOrderSummary.orderId}</p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">

              {/* Customer */}
              {(lastOrderSummary.customerName || lastOrderSummary.customerPhone) && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer</p>
                  {lastOrderSummary.customerName && (
                    <p className="text-sm font-medium text-gray-900 flex items-center space-x-1">
                      <FiUser className="w-3.5 h-3.5" />
                      <span>{lastOrderSummary.customerName}</span>
                    </p>
                  )}
                  {lastOrderSummary.customerPhone && (
                    <p className="text-sm text-gray-700 flex items-center space-x-1 mt-0.5">
                      <FiPhone className="w-3.5 h-3.5" />
                      <span>{lastOrderSummary.customerPhone}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items Ordered</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {lastOrderSummary.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">
                        <span className="font-semibold">{item.quantity}x</span> {item.menu_item_name}
                      </span>
                      <span className="text-gray-600 font-medium">
                        {(parseFloat(item.price) * item.quantity).toFixed(2)} Birr
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Row */}
              <div className="border-t border-gray-100 pt-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Paid</span>
                  <span className="text-lg font-bold text-green-600">
                    {Number(lastOrderSummary.total).toFixed(2)} Birr
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Payment Method</span>
                  <span className="text-sm font-semibold text-gray-800 capitalize flex items-center space-x-1">
                    {lastOrderSummary.paymentMethod === 'cash' ? (
                      <><FiDollarSign className="w-4 h-4" /><span>Cash</span></>
                    ) : (
                      <><FiSquare className="w-4 h-4" /><span>QR Code</span></>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Time</span>
                  <span className="text-sm text-gray-700">
                    {lastOrderSummary.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                <FiTruck className="w-5 h-5" />
                <span>New Delivery Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};

export default BeuDelivery;
