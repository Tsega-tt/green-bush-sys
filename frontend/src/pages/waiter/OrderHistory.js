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
  FiMapPin,
  FiDollarSign,
  FiCalendar,
  FiClipboard,
  FiMinus,
  FiX,
  FiSave,
  FiLogOut
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Waiter Order History Page
 * Shows orders created by the current waiter
 */
const OrderHistory = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [addingItemsOrderId, setAddingItemsOrderId] = useState(null);
  const [addingItems, setAddingItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);

  const normalizeStatus = (s) => String(s || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .trim();

  const getEffectiveStatus = (order) => {
    const pst = normalizeStatus(order?.payment_status);
    if (pst === 'paid') return 'paid';
    const st = normalizeStatus(order?.status);
    return st || 'pending';
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Fetch waiter's orders and menu items
  useEffect(() => {
    const MENU_CACHE_KEY = 'waiter_order_history_menu_v1';
    const ORDERS_CACHE_KEY = `waiter_order_history_orders_${user.id}_v1`;
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
          if (cachedMenu) {
            setMenuItems(cachedMenu);
          }
          if (cachedOrders) {
            setOrders(cachedOrders);
          }
          setLoading(false);
        } else {
          setLoading(true);
        }

        const [ordersResult, menuResult] = await Promise.allSettled([
          api.orders.getAll({ 
            employee_id: user.id,
            type: 'cafe'
          }),
          api.menu.getCafeMenu()
        ]);

        const ordersRaw = ordersResult?.status === 'fulfilled'
          ? (ordersResult.value?.data?.data?.orders ?? ordersResult.value?.data?.orders ?? [])
          : (cachedOrders || []);
        const safeOrders = Array.isArray(ordersRaw) ? ordersRaw : [];

        const rawItems = menuResult?.status === 'fulfilled'
          ? (menuResult.value?.data?.data?.menuItems ?? menuResult.value?.data?.menuItems ?? [])
          : (cachedMenu || []);
        const normalizedItems = Array.isArray(rawItems)
          ? rawItems.map(item => ({
              ...item,
              main_category: item.main_category || 'restaurant',
              sub_category: item.sub_category || item.category || '',
              is_available: typeof item.is_available === 'boolean' ? item.is_available : (item.available ?? true)
            }))
          : [];

        setOrders(safeOrders);
        setMenuItems(normalizedItems);
        saveCache(ORDERS_CACHE_KEY, safeOrders);
        saveCache(MENU_CACHE_KEY, normalizedItems);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load order history');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 10000);
    return () => clearInterval(intervalId);
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
      paid: {
        icon: FiDollarSign,
        color: 'text-green-700',
        bgColor: 'bg-green-100',
        label: 'Paid'
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

  // Check if order can have items added (not completed/paid)
  const canAddItems = (order) => {
    const effectiveStatus = getEffectiveStatus(order);
    return ['pending', 'preparing', 'ready'].includes(effectiveStatus);
  };

  // Add Item Functionality
  const startAddingItems = (order) => {
    setAddingItemsOrderId(order.id);
    setAddingItems([]);
  };

  const cancelAddingItems = () => {
    setAddingItemsOrderId(null);
    setAddingItems([]);
  };

  const addMenuItemToOrder = (menuItem) => {
    const existingItemIndex = addingItems.findIndex(item => item.menu_item_id === menuItem.id);
    
    if (existingItemIndex >= 0) {
      const updatedItems = [...addingItems];
      updatedItems[existingItemIndex].quantity += 1;
      updatedItems[existingItemIndex].subtotal = parseFloat(updatedItems[existingItemIndex].unit_price) * updatedItems[existingItemIndex].quantity;
      setAddingItems(updatedItems);
    } else {
      const price = parseFloat(menuItem.price || 0);
      const newItem = {
        menu_item_id: parseInt(menuItem.id),
        menu_item_name: menuItem.name,
        quantity: 1,
        unit_price: price,
        subtotal: price
      };
      setAddingItems([...addingItems, newItem]);
    }
  };

  const updateAddingItemQuantity = (index, newQuantity) => {
    if (newQuantity < 1) return;
    
    const updatedItems = [...addingItems];
    updatedItems[index].quantity = parseInt(newQuantity);
    updatedItems[index].subtotal = parseFloat(updatedItems[index].unit_price || 0) * parseInt(newQuantity);
    setAddingItems(updatedItems);
  };

  const removeAddingItem = (index) => {
    const updatedItems = addingItems.filter((_, i) => i !== index);
    setAddingItems(updatedItems);
  };

  const saveAddedItems = async () => {
    try {
      if (addingItems.length === 0) {
        toast.error('Please add at least one item');
        return;
      }

      const itemsData = {
        items: addingItems.map(item => ({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal
        })),
        updated_by: user.id
      };

      // Add items to the order
      await api.orders.addItems(addingItemsOrderId, itemsData);
      
      // If order was ready, send it back to preparing status
      const currentOrder = orders.find(o => o.id === addingItemsOrderId);
      if (currentOrder && normalizeStatus(currentOrder.status) === 'ready') {
        await api.orders.updateStatus(addingItemsOrderId, { 
          status: 'preparing', 
          updated_by: user.id 
        });
      }
      
      toast.success('Items added to order successfully!');
      
      // Refresh orders
      const ordersResult = await Promise.allSettled([
        api.orders.getAll({
          employee_id: user.id,
          type: 'cafe'
        })
      ]);
      const ordersFetch = ordersResult?.[0];
      const refreshedOrdersRaw = ordersFetch?.status === 'fulfilled'
        ? (ordersFetch.value?.data?.data?.orders ?? ordersFetch.value?.data?.orders ?? [])
        : orders;
      const refreshedOrders = Array.isArray(refreshedOrdersRaw) ? refreshedOrdersRaw : [];

      setOrders(refreshedOrders);
      try {
        localStorage.setItem(
          `waiter_order_history_orders_${user.id}_v1`,
          JSON.stringify({ ts: Date.now(), data: refreshedOrders })
        );
      } catch {
        // ignore cache write failures
      }
      
      cancelAddingItems();
    } catch (error) {
      console.error('Error adding items:', error);
      toast.error('Failed to add items. Please try again.');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading order history..." />;
  }

  return (
    <div className="space-y-6">
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
              <h1 className="text-3xl font-bold text-gray-900">Order History</h1>
              <BranchBadge />
            </div>
            <p className="text-gray-600 mt-2">
              View all your café orders ({orders.length} total)
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/waiter/create-order')}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
          >
            <FiPlus className="w-4 h-4" />
            <span>New Order</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
          >
            <FiLogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
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
            You haven't created any orders yet. Start by creating your first order.
          </p>
          <button
            onClick={() => navigate('/waiter/create-order')}
            className="btn-primary flex items-center space-x-2 mx-auto"
          >
            <FiPlus className="w-4 h-4" />
            <span>Create First Order</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {orders.map((order) => {
            const effectiveStatus = getEffectiveStatus(order);
            const statusDisplay = getStatusDisplay(effectiveStatus);
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
                          <FiMapPin className="w-4 h-4 mr-1" />
                          {order.table_number ? `Table ${order.table_number}` : 'Take Away'}
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

                {/* Add Items Interface for Non-Paid Orders */}
                {canAddItems(order) && addingItemsOrderId === order.id && (
                  <div className="border-t pt-4 mt-4">
                    <div className="mb-4 p-3 bg-gray-50 rounded border">
                      <h4 className="font-medium text-gray-900 mb-2">Add Items to Order:</h4>
                      
                      {/* Items being added */}
                      {addingItems.length > 0 && (
                        <div className="space-y-2 mb-3">
                          <h5 className="text-sm font-medium text-gray-700">Items to Add:</h5>
                          {addingItems.map((item, index) => (
                            <div key={index} className="flex items-center justify-between bg-white p-2 rounded">
                              <div className="flex-1">
                                <span className="font-medium">{item.menu_item_name}</span>
                                <span className="text-sm text-gray-600 ml-2">
                                  ${parseFloat(item.unit_price).toFixed(2)} each
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => updateAddingItemQuantity(index, item.quantity - 1)}
                                  className="w-6 h-6 flex items-center justify-center bg-red-100 text-red-600 rounded hover:bg-red-200"
                                >
                                  <FiMinus className="w-3 h-3" />
                                </button>
                                <span className="w-8 text-center font-medium">{item.quantity}</span>
                                <button
                                  onClick={() => updateAddingItemQuantity(index, item.quantity + 1)}
                                  className="w-6 h-6 flex items-center justify-center bg-green-100 text-green-600 rounded hover:bg-green-200"
                                >
                                  <FiPlus className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => removeAddingItem(index)}
                                  className="w-6 h-6 flex items-center justify-center bg-red-100 text-red-600 rounded hover:bg-red-200 ml-2"
                                >
                                  <FiX className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Menu Items Selection */}
                      <div className="mb-3">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Select Items to Add:</h5>
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                          {menuItems.filter(item => item.is_available).map((menuItem) => (
                            <button
                              key={menuItem.id}
                              onClick={() => addMenuItemToOrder(menuItem)}
                              className="text-left p-2 bg-white rounded hover:bg-gray-100 text-xs border"
                            >
                              <div className="font-medium">{menuItem.name}</div>
                              <div className="text-gray-600">{(menuItem.main_category || 'restaurant').toUpperCase()}{(menuItem.sub_category || menuItem.category) ? ` • ${menuItem.sub_category || menuItem.category}` : ''}</div>
                              <div className="text-gray-600">${parseFloat(menuItem.price).toFixed(2)}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Additional Total: ${addingItems.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0).toFixed(2)}
                        </span>
                        <div className="flex space-x-2">
                          <button
                            onClick={cancelAddingItems}
                            className="btn-outline text-xs py-1 px-2"
                          >
                            <FiX className="w-3 h-3 mr-1" />
                            Cancel
                          </button>
                          <button
                            onClick={saveAddedItems}
                            className="btn-primary text-xs py-1 px-2"
                            disabled={addingItems.length === 0}
                          >
                            <FiSave className="w-3 h-3 mr-1" />
                            Add Items
                          </button>
                        </div>
                      </div>
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

                {/* Add Item Button for Non-Paid Orders */}
                {canAddItems(order) && addingItemsOrderId !== order.id && (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex justify-end">
                      <button
                        onClick={() => startAddingItems(order)}
                        className="btn-outline text-sm py-2 px-3 flex items-center space-x-2"
                      >
                        <FiPlus className="w-4 h-4" />
                        <span>Add Item</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OrderHistory;
