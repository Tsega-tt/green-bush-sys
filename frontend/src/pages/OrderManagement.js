import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  FiPlus,
  FiEye,
  FiClock,
  FiCheckCircle,
  FiSearch,
  FiFilter,
  FiMapPin,
  FiUser
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Order Management Page Component
 * Interface for managing orders across different user roles
 */
const OrderManagement = ({ initialFilterStatus = 'all' } = {}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState(() => initialFilterStatus || 'all');
  const [filterType, setFilterType] = useState('all');
  const [selectedDate, setSelectedDate] = useState('today');
  const [menuMainCategoryById, setMenuMainCategoryById] = useState({});
  const [paidOrderIdSet, setPaidOrderIdSet] = useState(() => new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [newOrder, setNewOrder] = useState({
    type: user.role === 'bakery_employee' ? 'bakery' : 'cafe',
    table_number: '',
    customer_id: '',
    items: []
  });

  const getItemDepartment = (item) => {
    const explicitType = String(item?.item_type || '').trim().toLowerCase();
    if (explicitType === 'beverage') return 'barista';

    const explicitMain = String(item?.main_category || '').trim().toLowerCase();
    if (explicitMain.includes('fasting') || explicitMain.includes('ጾም')) return 'restaurant';
    if (explicitMain === 'bakery') return 'cafe';
    if (explicitMain === 'cafe' || explicitMain === 'restaurant' || explicitMain === 'barista') return explicitMain;

    const menuId = item?.menu_item_id != null ? parseInt(item.menu_item_id, 10) : null;
    const mapped = Number.isFinite(menuId) ? String(menuMainCategoryById?.[menuId] || '').trim().toLowerCase() : '';
    if (mapped.includes('fasting') || mapped.includes('ጾም')) return 'restaurant';
    if (mapped === 'bakery') return 'cafe';
    if (mapped === 'cafe' || mapped === 'restaurant' || mapped === 'barista') return mapped;

    const cat = String(item?.category || item?.sub_category || '').trim().toLowerCase();
    const name = String(item?.menu_item_name || item?.name || '').trim().toLowerCase();
    if (cat.includes('fasting') || name.includes('fasting') || cat.includes('ጾም') || name.includes('ጾም')) return 'restaurant';
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

  const getOrderSubtotalForUnit = (order, unit) => {
    if (!order) return 0;
    const itemsRaw = Array.isArray(order?.items) ? order.items : [];
    const orderFallback = String(order?.type || '').trim().toLowerCase();
    const fallbackDept = orderFallback === 'bakery'
      ? (useDerivedStatus ? 'cafe' : 'bakery')
      : (orderFallback || null);
    if (itemsRaw.length === 0) {
      if (fallbackDept === unit) {
        const total = parseFloat(order?.total_amount);
        return Number.isFinite(total) ? total : 0;
      }
      return 0;
    }
    let subtotal = 0;
    for (const it of itemsRaw) {
      const dept = getItemDepartment(it) || (orderFallback === 'cafe' ? null : fallbackDept);
      if (dept !== unit) continue;
      subtotal += getItemSubtotal(it);
    }
    return subtotal;
  };

  const getOrderDisplayTotal = (order) => {
    const ft = String(filterType || '').trim().toLowerCase();
    if (useDerivedStatus && (ft === 'cafe' || ft === 'restaurant' || ft === 'barista')) {
      return getOrderSubtotalForUnit(order, ft);
    }
    const n = parseFloat(order?.total_amount);
    return Number.isFinite(n) ? n : 0;
  };

  const normalizeStatus = (s) => String(s || '').trim().toLowerCase();
  const isVoidedStatus = (s) => ['deleted', 'canceled', 'cancelled', 'void', 'voided'].includes(normalizeStatus(s));
  const useDerivedStatus = user?.role === 'admin';
  const isPaidOrder = (order) => {
    const idKey = order?.id != null ? String(order.id) : null;
    if (idKey && paidOrderIdSet.has(idKey)) return true;
    const st = normalizeStatus(order?.status);
    const pst = normalizeStatus(order?.payment_status);
    return st === 'paid' || st === 'completed' || pst === 'paid';
  };
  const getDerivedStatus = (order) => {
    if (isVoidedStatus(order?.status)) return 'voided';
    if (isPaidOrder(order)) return 'paid';
    return 'pending';
  };

  useEffect(() => {
    if (!useDerivedStatus) {
      setPaidOrderIdSet(new Set());
      return;
    }

    let cancelled = false;
    api.payments.getAll()
      .then((resp) => {
        if (cancelled) return;
        const payments = resp?.data?.data?.payments ?? resp?.data?.payments ?? [];
        const paid = (Array.isArray(payments) ? payments : [])
          .filter((p) => normalizeStatus(p?.status) === 'paid')
          .map((p) => (p?.order_id != null ? String(p.order_id) : null))
          .filter(Boolean);
        setPaidOrderIdSet(new Set(paid));
      })
      .catch(() => {
      });

    return () => {
      cancelled = true;
    };
  }, [useDerivedStatus]);

  // Fetch orders based on user role
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        let response;

        // Fetch orders based on user role
        if (user.role === 'admin') {
          response = await api.orders.getAll();
        } else if (user.role === 'kitchen_staff') {
          response = await api.orders.getKitchenOrders();
        } else {
          // For other roles, get orders related to their work
          response = await api.orders.getAll({ 
            employee_id: user.id 
          });
        }

        console.log('Fetched orders:', response.data.data.orders);
        
        // Sort orders by date (newest first)
        const sortedOrders = response.data.data.orders.sort((a, b) => 
          new Date(b.created_at) - new Date(a.created_at)
        );
        
        setOrders(sortedOrders);
        setFilteredOrders(sortedOrders);
      } catch (error) {
        console.error('Error fetching orders:', error);
        toast.error('Failed to load orders');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [user.id, user.role]);

  useEffect(() => {
    let cancelled = false;
    api.menu.getAll()
      .then((resp) => {
        if (cancelled) return;
        const items = resp?.data?.data?.menuItems ?? resp?.data?.menuItems ?? [];
        if (!Array.isArray(items) || items.length === 0) return;
        const next = {};
        for (const it of items) {
          const id = it?.id != null ? parseInt(it.id, 10) : null;
          if (!Number.isFinite(id)) continue;
          const main = String(it?.main_category || '').trim().toLowerCase();
          if (!main) continue;
          next[id] = main;
        }
        setMenuMainCategoryById(next);
      })
      .catch(() => {
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch menu items for order creation
  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        console.log('Fetching menu items for role:', user.role);
        let response;
        
        if (user.role !== 'bakery_employee') {
          // For café waiters, get café menu items
          response = await api.menu.getAll();
          // Filter for café items
          const allItems = response.data.data.menuItems;
          const available = allItems.filter(item => item.is_available);
          setMenuItems(available);
          console.log('Loaded menu items:', available);
        } else {
          // For bakery employees, get bakery menu items
          response = await api.menu.getAll();
          // Filter for bakery items
          const allItems = response.data.data.menuItems;
          const bakeryItems = allItems.filter(item => (item.main_category || '') === 'cafe');
          setMenuItems(bakeryItems);
          console.log('Loaded bakery menu items:', bakeryItems);
        }
      } catch (error) {
        console.error('Error fetching menu items:', error);
        toast.error('Failed to load menu items');
      }
    };

    if (showCreateModal) {
      fetchMenuItems();
    }
  }, [showCreateModal, user.role]);

  // Generate date options for the last 7 days
  const getDateOptions = () => {
    const options = [];
    const today = new Date();

    options.push({
      key: 'all',
      label: 'All',
      date: null
    });
    
    // Add "Today" option
    options.push({
      key: 'today',
      label: 'Today',
      date: today.toISOString().split('T')[0]
    });
    
    // Add previous 6 days
    for (let i = 1; i <= 6; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      options.push({
        key: dateStr,
        label: i === 1 ? 'Yesterday' : `${dayName}, ${monthDay}`,
        date: dateStr
      });
    }
    
    return options;
  };

  // Filter orders by selected date and other filters
  useEffect(() => {
    let filtered = Array.isArray(orders) ? [...orders] : [];

    // Apply date filter
    if (selectedDate && selectedDate !== 'all') {
      const targetDate = selectedDate === 'today' 
        ? new Date().toISOString().split('T')[0]
        : selectedDate;
      
      filtered = filtered.filter(order => {
        const orderDate = new Date(order.created_at).toISOString().split('T')[0];
        return orderDate === targetDate;
      });
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(order =>
        String(order?.id ?? '').includes(searchTerm) ||
        String(order?.customer_id ?? '').toLowerCase().includes(String(searchTerm || '').toLowerCase()) ||
        String(order?.table_number ?? '').includes(searchTerm)
      );
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      if (useDerivedStatus) {
        filtered = filtered.filter(order => getDerivedStatus(order) === normalizeStatus(filterStatus));
      } else {
        if (normalizeStatus(filterStatus) === 'voided') {
          filtered = filtered.filter(order => isVoidedStatus(order.status));
        } else {
          filtered = filtered.filter(order => normalizeStatus(order.status) === normalizeStatus(filterStatus));
        }
      }
    }

    // Apply type filter
    if (filterType !== 'all') {
      const ft = String(filterType).trim().toLowerCase();
      if (useDerivedStatus && (ft === 'cafe' || ft === 'restaurant' || ft === 'barista')) {
        filtered = filtered.filter(order => {
          return getOrderSubtotalForUnit(order, ft) > 0;
        });
      } else {
        filtered = filtered.filter(order => {
          const ot = String(order?.type || '').trim().toLowerCase();
          if (ft === 'cafe' && useDerivedStatus) return ot === 'cafe' || ot === 'bakery';
          if (ft === 'cafe') return ot === 'cafe';
          return ot === ft;
        });
      }
    }

    // Sort filtered orders by time (newest first within the selected day)
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    setFilteredOrders(filtered);
  }, [orders, searchTerm, filterStatus, filterType, selectedDate, menuMainCategoryById, useDerivedStatus, paidOrderIdSet]);

  // Order creation functions
  const handleCreateOrder = () => {
    setShowCreateModal(true);
  };

  const handleAddItem = (menuItem) => {
    const existingItem = newOrder.items.find(item => item.menu_item_id === menuItem.id);
    
    if (existingItem) {
      setNewOrder(prev => ({
        ...prev,
        items: prev.items.map(item =>
          item.menu_item_id === menuItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }));
    } else {
      setNewOrder(prev => ({
        ...prev,
        items: [...prev.items, {
          menu_item_id: menuItem.id,
          menu_item_name: menuItem.name,
          price: menuItem.price,
          quantity: 1
        }]
      }));
    }
  };

  const handleRemoveItem = (menuItemId) => {
    setNewOrder(prev => ({
      ...prev,
      items: prev.items.filter(item => item.menu_item_id !== menuItemId)
    }));
  };

  const handleSubmitOrder = async () => {
    if (creatingOrder) return; // Prevent double submission
    
    try {
      setCreatingOrder(true);
      console.log('Creating order...', newOrder);
      
      if (newOrder.items.length === 0) {
        toast.error('Please add at least one item to the order');
        setCreatingOrder(false);
        return;
      }

      // Customer ID will be auto-generated for bakery orders

      // Generate a UUID for customer_id if it's a bakery order
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : ((r & 0x3) | 0x8);
          return v.toString(16);
        });
      };

      const employeeId = user?.id != null
        ? parseInt(user.id, 10)
        : (user?.user_id != null ? parseInt(user.user_id, 10) : null);
      if (!Number.isFinite(employeeId)) {
        toast.error('Your account is missing an employee id. Please logout and login again.');
        setCreatingOrder(false);
        return;
      }

      const orderData = {
        employee_id: employeeId,
        type: newOrder.type,
        items: newOrder.items.map(item => {
          const unitPrice = parseFloat(item.price);
          const quantity = parseInt(item.quantity);
          const subtotal = unitPrice * quantity;
          return {
            menu_item_id: parseInt(item.menu_item_id),
            quantity: quantity,
            unit_price: unitPrice,
            subtotal: subtotal
          };
        }),
        total_amount: newOrder.items.reduce((sum, item) => 
          sum + (parseFloat(item.price) * parseInt(item.quantity)), 0
        )
      };

      // Add type-specific fields
      if (newOrder.type === 'cafe') {
        if (newOrder.table_number) {
          orderData.table_number = parseInt(newOrder.table_number);
        }
      } else if (newOrder.type === 'bakery') {
        orderData.customer_id = generateUUID();
      }

      console.log('Sending order data:', orderData);

      // Use the appropriate API endpoint based on order type
      let createResponse;
      if (newOrder.type === 'cafe') {
        createResponse = await api.orders.createCafe(orderData);
      } else {
        createResponse = await api.orders.createBakery(orderData);
      }
      
      console.log('Order created successfully:', createResponse);
      toast.success('Order created successfully!');
      
      // Reset form and close modal
      setNewOrder({
        type: user.role === 'bakery_employee' ? 'bakery' : 'cafe',
        table_number: '',
        customer_id: '',
        items: []
      });
      setShowCreateModal(false);
      
      // Refresh orders
      const refreshResponse = user.role === 'admin' 
        ? await api.orders.getAll()
        : await api.orders.getAll({ employee_id: user.id });
      
      // Sort refreshed orders by date (newest first)
      const sortedRefreshOrders = refreshResponse.data.data.orders.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      
      setOrders(sortedRefreshOrders);
    } catch (error) {
      console.error('Error creating order:', error);
      console.error('Error response:', error.response);
      console.error('Error data:', error.response?.data);
      
      // Show specific validation errors if available
      if (error.response && error.response.data && error.response.data.errors) {
        const validationErrors = error.response.data.errors;
        console.error('Validation errors:', validationErrors);
        const errorMessages = validationErrors.map(err => `${err.param}: ${err.msg}`).join('; ');
        toast.error(`Validation failed: ${errorMessages}`);
      } else if (error.response && error.response.data && error.response.data.message) {
        toast.error(`Failed to create order: ${error.response.data.message}`);
      } else if (error.response) {
        toast.error(`Server error: ${error.response.status} - ${error.response.statusText}`);
      } else {
        toast.error('Network error. Please check your connection and try again.');
      }
    } finally {
      setCreatingOrder(false);
    }
  };

  // Update order status
  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await api.orders.updateStatus(orderId, {
        status: newStatus,
        updated_by: user.id
      });
      
      toast.success(`Order ${newStatus} successfully`);
      
      // Refresh orders
      const response = user.role === 'admin' 
        ? await api.orders.getAll()
        : await api.orders.getAll({ employee_id: user.id });
      
      // Sort refreshed orders by date (newest first)
      const sortedOrders = response.data.data.orders.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      
      setOrders(sortedOrders);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  // Get status badge color
  const getStatusBadge = (status) => {
    const st = normalizeStatus(status);
    const badges = {
      pending: 'badge badge-warning',
      preparing: 'badge badge-info',
      ready: 'badge badge-success',
      completed: 'badge badge-success',
      paid: 'badge badge-success',
      cancelled: 'badge badge-error',
      canceled: 'badge badge-error',
      deleted: 'badge badge-error',
      void: 'badge badge-error',
      voided: 'badge badge-error'
    };
    return badges[st] || 'badge';
  };

  // Get available status transitions based on user role
  const getAvailableStatuses = (currentStatus) => {
    const statusFlow = {
      admin: ['pending', 'preparing', 'ready', 'completed', 'cancelled'],
      kitchen_staff: currentStatus === 'pending' ? ['preparing'] : 
                   currentStatus === 'preparing' ? ['ready'] : [],
      bakery_employee: currentStatus === 'ready' ? ['completed'] : [],
      cafe_waiter: currentStatus === 'ready' ? ['completed'] : [],
      cashier: []
    };

    return statusFlow[user.role] || [];
  };

  if (loading) {
    return <LoadingSpinner text="Loading orders..." />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Order Management</h1>
          <p className="text-gray-600 mt-1">
            {user.role === 'kitchen_staff' ? 'Kitchen Orders' : 'Manage orders and track progress'}
            {filteredOrders.length > 0 && ' • Sorted by time (newest first)'}
          </p>
        </div>
        {(user.role === 'admin' || user.role === 'bakery_employee' || user.role === 'cafe_waiter') && (
          <button 
            onClick={handleCreateOrder}
            className="btn-primary flex items-center space-x-2"
          >
            <FiPlus className="w-4 h-4" />
            <span>New Order</span>
          </button>
        )}
      </div>

      {/* Day Filter Buttons */}
      <div className="card">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Filter by Day</h3>
          <div className="flex flex-wrap gap-2">
            {getDateOptions().map((option) => (
              <button
                key={option.key}
                onClick={() => setSelectedDate(option.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedDate === option.key
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Other Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field"
          >
            <option value="all">All Statuses</option>
            {useDerivedStatus ? (
              <>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="voided">Voided</option>
              </>
            ) : (
              <>
                <option value="pending">Pending</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="voided">Voided</option>
                <option value="cancelled">Cancelled</option>
              </>
            )}
          </select>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input-field"
          >
            <option value="all">All Types</option>
            {!useDerivedStatus && <option value="bakery">Bakery</option>}
            <option value="cafe">Café</option>
            <option value="restaurant">Restaurant</option>
            <option value="barista">Barista</option>
          </select>

          {/* Stats */}
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>
              {selectedDate === 'today' ? "Today's Orders" : 
               selectedDate === new Date(Date.now() - 86400000).toISOString().split('T')[0] ? "Yesterday's Orders" :
               `Orders for ${getDateOptions().find(opt => opt.key === selectedDate)?.label}`}: {filteredOrders.length}
            </span>
            {useDerivedStatus ? (
              <>
                <span>Pending: {filteredOrders.filter(order => getDerivedStatus(order) === 'pending').length}</span>
                <span>Paid: {filteredOrders.filter(order => getDerivedStatus(order) === 'paid').length}</span>
              </>
            ) : (
              <>
                <span>Pending: {filteredOrders.filter(order => normalizeStatus(order.status) === 'pending').length}</span>
                <span>Completed: {filteredOrders.filter(order => normalizeStatus(order.status) === 'completed').length}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {/* Day Header */}
        {filteredOrders.length > 0 && (
          <div className="flex items-center justify-between bg-gray-50 px-4 py-3 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900">
              {selectedDate === 'all' ? 'All Orders' : selectedDate === 'today' ? "Today's Orders" : 
               selectedDate === new Date(Date.now() - 86400000).toISOString().split('T')[0] ? "Yesterday's Orders" :
               `Orders for ${getDateOptions().find(opt => opt.key === selectedDate)?.label}`}
            </h3>
            <div className="text-sm text-gray-600">
              {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} • 
              Total: ${filteredOrders.reduce((sum, order) => sum + getOrderDisplayTotal(order), 0).toFixed(2)}
            </div>
          </div>
        )}
        
        {filteredOrders.map((order) => {
          const displayStatus = useDerivedStatus ? getDerivedStatus(order) : (isVoidedStatus(order?.status) ? 'voided' : order?.status);
          const unitFilter = useDerivedStatus && ['cafe', 'restaurant', 'barista'].includes(String(filterType || '').trim().toLowerCase())
            ? String(filterType || '').trim().toLowerCase()
            : null;
          const displayType = unitFilter
            ? unitFilter
            : (useDerivedStatus && String(order?.type || '').trim().toLowerCase() === 'bakery' ? 'cafe' : order?.type);
          const waiterName = String(order?.employee_name || order?.waiter_name || '').trim() || null;
          const customerId = order?.customer_id != null ? String(order.customer_id) : '';
          const shortCustomerId = customerId ? `${customerId.slice(0, 8)}...` : '';
          const orderFallback = String(order?.type || '').trim().toLowerCase();
          const fallbackDept = orderFallback === 'bakery'
            ? (useDerivedStatus ? 'cafe' : 'bakery')
            : (orderFallback || null);
          const itemsRaw = Array.isArray(order?.items) ? order.items : [];
          const itemsForDisplay = unitFilter
            ? itemsRaw.filter((it) => {
              const dept = getItemDepartment(it) || (orderFallback === 'cafe' ? null : fallbackDept);
              return dept === unitFilter;
            })
            : itemsRaw;

          return (
          <div key={order.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              {/* Order Info */}
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Order #{order.id}
                  </h3>
                  <span className={getStatusBadge(displayStatus)}>
                    {displayStatus}
                  </span>
                  <span className="badge badge-info">
                    {displayType}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-1">
                    <FiUser className="w-4 h-4" />
                    <span>Waiter: {waiterName || (order?.employee_id != null ? `#${order.employee_id}` : '—')}</span>
                  </div>

                  {shortCustomerId && (
                    <div className="flex items-center space-x-1">
                      <FiUser className="w-4 h-4" />
                      <span>Customer: {shortCustomerId}</span>
                    </div>
                  )}
                  
                  {order.table_number && (
                    <div className="flex items-center space-x-1">
                      <FiMapPin className="w-4 h-4" />
                      <span>Table {order.table_number}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-1">
                    <FiClock className="w-4 h-4" />
                    <span>{new Date(order.created_at).toLocaleString()}</span>
                  </div>
                  
                  <div className="font-semibold text-gray-900">
                    Total: ${getOrderDisplayTotal(order).toFixed(2)}
                  </div>
                </div>

                {/* Order Items */}
                {itemsForDisplay && itemsForDisplay.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Order Items:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {itemsForDisplay.map((item, index) => {
                        // Determine if item is a beverage
                        const beverageCategories = ['coffee', 'beverages', 'drinks', 'tea', 'espresso', 'cappuccino', 'latte', 'americano', 'cold drinks'];
                        const category = (item.category || '').toLowerCase();
                        const name = (item.menu_item_name || item.name || '').toLowerCase();
                        const isBeverage = beverageCategories.some(bevCat => 
                          category.includes(bevCat) || name.includes(bevCat)
                        );
                        
                        return (
                          <div key={index} className={`text-sm rounded px-2 py-1 ${
                            isBeverage ? 'text-blue-600 bg-blue-50 border border-blue-200' : 'text-gray-600 bg-gray-50'
                          }`}>
                            <span className="font-medium">{item.quantity}x</span> {item.menu_item_name || item.name}
                            {isBeverage && <span className="text-xs ml-1">☕</span>}
                            <span className="float-right">${getItemSubtotal(item).toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Routing indicator */}
                    {order.type === 'cafe' && (
                      <div className="mt-2 text-xs">
                        {itemsForDisplay.every(item => {
                          const beverageCategories = ['coffee', 'beverages', 'drinks', 'tea', 'espresso', 'cappuccino', 'latte', 'americano', 'cold drinks'];
                          const category = (item.category || '').toLowerCase();
                          const name = (item.menu_item_name || item.name || '').toLowerCase();
                          return beverageCategories.some(bevCat => 
                            category.includes(bevCat) || name.includes(bevCat)
                          );
                        }) ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ☕ Direct to Cashier
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            🍳 Kitchen Required
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {order.notes && (
                  <p className="mt-2 text-sm text-gray-600 italic">
                    Note: {order.notes}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 ml-4">
                {/* Status Update Buttons */}
                {!useDerivedStatus && getAvailableStatuses(order.status).map((status) => (
                  <button
                    key={status}
                    onClick={() => updateOrderStatus(order.id, status)}
                    className={`btn-outline text-xs py-1 px-2 ${
                      status === 'ready' ? 'border-green-500 text-green-600 hover:bg-green-50' :
                      status === 'preparing' ? 'border-blue-500 text-blue-600 hover:bg-blue-50' :
                      status === 'completed' ? 'border-purple-500 text-purple-600 hover:bg-purple-50' :
                      ''
                    }`}
                  >
                    {status === 'preparing' && <FiClock className="w-3 h-3 mr-1" />}
                    {status === 'ready' && <FiCheckCircle className="w-3 h-3 mr-1" />}
                    {status === 'completed' && <FiCheckCircle className="w-3 h-3 mr-1" />}
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}

                {/* View Details */}
                <button className="btn-outline text-xs py-1 px-2">
                  <FiEye className="w-3 h-3 mr-1" />
                  Details
                </button>
              </div>
            </div>
          </div>
        );
        })}
      </div>

      {/* Empty State */}
      {filteredOrders.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <FiFilter className="w-12 h-12 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {selectedDate === 'all'
              ? 'No orders found'
              : (
                <>No orders found for {selectedDate === 'today' ? 'today' : 
                    selectedDate === new Date(Date.now() - 86400000).toISOString().split('T')[0] ? 'yesterday' :
                    getDateOptions().find(opt => opt.key === selectedDate)?.label.toLowerCase()}</>
              )}
          </h3>
          <p className="text-gray-600 mb-4">
            Try selecting a different day or adjusting your search criteria
          </p>
          {(user.role === 'admin' || user.role === 'bakery_employee' || user.role === 'cafe_waiter') && (
            <button 
              onClick={handleCreateOrder}
              className="btn-primary"
            >
              Create First Order
            </button>
          )}
        </div>
      )}

      {/* Create Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                Create New {newOrder.type === 'cafe' ? 'Café' : 'Bakery'} Order
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Order Details */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Order Details</h4>
                
                {newOrder.type === 'cafe' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Table Number *
                    </label>
                    <select
                      value={newOrder.table_number}
                      onChange={(e) => setNewOrder(prev => ({ ...prev, table_number: e.target.value }))}
                      className="input-field"
                      required
                    >
                      <option value="">Select Table</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                        <option key={num} value={num}>Table {num}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer ID
                    </label>
                    <div className="input-field bg-gray-50 text-gray-600 flex items-center">
                      <span className="text-sm">Will be generated automatically</span>
                    </div>
                  </div>
                )}

                {/* Selected Items */}
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Selected Items</h5>
                  {newOrder.items.length === 0 ? (
                    <p className="text-gray-500 text-sm">No items selected</p>
                  ) : (
                    <div className="space-y-2">
                      {newOrder.items.map((item) => (
                        <div key={item.menu_item_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div>
                            <span className="font-medium">{item.menu_item_name}</span>
                            <span className="text-sm text-gray-600 ml-2">
                              ${parseFloat(item.price).toFixed(2)} × {item.quantity}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveItem(item.menu_item_id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <div className="border-t pt-2">
                        <span className="font-semibold">
                          Total: ${newOrder.items.reduce((sum, item) => 
                            sum + (parseFloat(item.price) * item.quantity), 0
                          ).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Menu Items */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-4">Available Items</h4>
                <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
                  {menuItems.map((item) => (
                    <div key={item.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-medium text-gray-900">{item.name}</h5>
                          <p className="text-sm text-gray-600">{item.description}</p>
                          <span className="text-lg font-bold text-green-600">
                            ${parseFloat(item.price).toFixed(2)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleAddItem(item)}
                          disabled={!item.is_available}
                          className={`btn-primary text-sm py-1 px-3 ${
                            !item.is_available ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <FiPlus className="w-3 h-3 mr-1" />
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end space-x-4 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-outline"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitOrder}
                disabled={newOrder.items.length === 0 || creatingOrder}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingOrder ? 'Creating Order...' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;
