import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import BranchBadge from '../../components/common/BranchBadge';
import {
  FiTool,
  FiClipboard,
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
  FiUser,
  FiMapPin,
  FiEdit3,
  FiSave,
  FiX,
  FiPlus,
  FiMinus
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const KITCHEN_DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const KITCHEN_MENU_CACHE_KEY = 'kitchen_menu_v1';

/**
 * Kitchen Staff Dashboard Component
 * Focused on food preparation and order management
 */
const KitchenStaffDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [attendanceStatus, setAttendanceStatus] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  const [addingItemsOrderId, setAddingItemsOrderId] = useState(null);
  const [addingItems, setAddingItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [dashboardData, setDashboardData] = useState({
    kitchenOrders: [],
    preparingOrders: [],
    readyOrders: [],
    todayStats: {
      ordersReceived: 0,
      ordersCompleted: 0,
      averageTime: 0
    }
  });

  // Helper function to filter preparing orders for kitchen view
  const filterPreparingOrdersForKitchen = (allOrders) => {
    return allOrders
      .filter(order => order.status === 'preparing')
      .filter(order => {
        // Only show orders that have food items
        return order.items && order.items.some(item => item.item_type === 'food');
      })
      .map(order => ({
        ...order,
        // Filter out beverage items from the order display
        items: order.items.filter(item => item.item_type === 'food')
      }));
  };

  // Helper function to identify beverages based on category and name
  const isBeverageItem = (menuItem) => {
    if ((menuItem?.main_category || '') === 'barista') return true;
    const beverageCategories = [
      'coffee', 'beverages', 'drinks', 'tea', 'espresso', 
      'cappuccino', 'latte', 'americano', 'cold drinks',
      'hot drinks', 'iced coffee', 'frappuccino', 'smoothie',
      'juice', 'soda', 'water'
    ];

    const category = (menuItem.sub_category || menuItem.category || '').toLowerCase();
    const name = (menuItem.name || '').toLowerCase();
    
    // Check if item is a beverage
    return beverageCategories.some(bevCat => 
      category.includes(bevCat) || name.includes(bevCat)
    );
  };

  // Helper function to filter menu items for kitchen (exclude beverages)
  const filterMenuItemsForKitchen = (menuItems) => {
    return (Array.isArray(menuItems) ? menuItems : [])
      .filter(item => item.is_available)
      .filter(item => (item.main_category || '') === 'restaurant')
      .filter(item => !isBeverageItem(item));
  };

  // Fetch dashboard data
  useEffect(() => {
    const DASHBOARD_CACHE_KEY = `kitchen_dashboard_${user.id}_v1`;

    const loadCache = (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Number.isFinite(parsed.ts)) return null;
        if (Date.now() - parsed.ts > KITCHEN_DASHBOARD_CACHE_TTL_MS) return null;
        return parsed.data || null;
      } catch {
        return null;
      }
    };

    const saveCache = (key, data) => {
      try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
      } catch {
        // ignore cache write failures
      }
    };

    const fetchData = async () => {
      try {
        const cached = loadCache(DASHBOARD_CACHE_KEY);
        if (cached) {
          setDashboardData(prev => ({
            ...prev,
            kitchenOrders: Array.isArray(cached.kitchenOrders) ? cached.kitchenOrders : [],
            preparingOrders: Array.isArray(cached.preparingOrders) ? cached.preparingOrders : [],
            readyOrders: Array.isArray(cached.readyOrders) ? cached.readyOrders : [],
            todayStats: cached.todayStats || prev.todayStats
          }));
          setAttendanceStatus(cached.attendanceStatus || null);
          setLoading(false);
        } else {
          setLoading(true);
        }

        const [
          kitchenOrdersResult,
          allOrdersResult,
          attendanceResult
        ] = await Promise.allSettled([
          api.orders.getKitchenOrders(),
          api.orders.getAll({ type: 'cafe' }),
          api.attendance.getCurrentStatus(user.id)
        ]);

        let nextCachePayload = null;
        setDashboardData(prev => {
          const allOrdersRaw = allOrdersResult?.status === 'fulfilled'
            ? (allOrdersResult.value?.data?.data?.orders ?? allOrdersResult.value?.data?.orders ?? [])
            : prev.preparingOrders.concat(prev.readyOrders);

          const kitchenOrdersRaw = kitchenOrdersResult?.status === 'fulfilled'
            ? (kitchenOrdersResult.value?.data?.data?.orders ?? kitchenOrdersResult.value?.data?.orders ?? [])
            : prev.kitchenOrders;

          const allOrders = Array.isArray(allOrdersRaw) ? allOrdersRaw : [];
          const kitchenOrders = Array.isArray(kitchenOrdersRaw) ? kitchenOrdersRaw : [];
          const preparingOrders = filterPreparingOrdersForKitchen(allOrders);
          const readyOrders = allOrders.filter(order => order.status === 'ready');

          const today = new Date().toISOString().split('T')[0];
          const todayOrders = allOrders.filter(order => String(order?.created_at || '').startsWith(today));
          const todayCompleted = todayOrders.filter(order => order.status === 'ready' || order.status === 'completed');

          const next = {
            ...prev,
            kitchenOrders,
            preparingOrders,
            readyOrders,
            todayStats: {
              ordersReceived: todayOrders.length,
              ordersCompleted: todayCompleted.length,
              averageTime: 15
            }
          };

          nextCachePayload = {
            kitchenOrders: next.kitchenOrders,
            preparingOrders: next.preparingOrders,
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
          saveCache(DASHBOARD_CACHE_KEY, nextCachePayload);
        }

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user.id]);

  // Fetch menu items for editing
  useEffect(() => {
    const loadMenuCache = () => {
      try {
        const raw = localStorage.getItem(KITCHEN_MENU_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Number.isFinite(parsed.ts)) return null;
        if (Date.now() - parsed.ts > KITCHEN_DASHBOARD_CACHE_TTL_MS) return null;
        return Array.isArray(parsed.data) ? parsed.data : null;
      } catch {
        return null;
      }
    };

    const saveMenuCache = (menu) => {
      try {
        localStorage.setItem(KITCHEN_MENU_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: menu }));
      } catch {
        // ignore cache write failures
      }
    };

    const fetchMenuItems = async () => {
      try {
        const cached = loadMenuCache();
        if (cached) {
          setMenuItems(cached);
        }

        const response = await api.menu.getCafeMenu();
        const raw = response.data.data.menuItems || [];
        const normalized = Array.isArray(raw)
          ? raw.map(item => ({
              ...item,
              main_category: item.main_category || 'restaurant',
              sub_category: item.sub_category || item.category || '',
              is_available: typeof item.is_available === 'boolean' ? item.is_available : (item.available ?? true)
            }))
          : [];
        setMenuItems(normalized);
        saveMenuCache(normalized);
      } catch (error) {
        console.error('Error fetching menu items:', error);
      }
    };

    fetchMenuItems();
  }, []);

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

  // Start preparing order
  const startPreparing = async (orderId) => {
    try {
      await api.orders.updateStatus(orderId, { 
        status: 'preparing', 
        updated_by: user.id 
      });
      toast.success('Order moved to preparing!');
      
      // Refresh data
      const [kitchenOrdersResult, allOrdersResult] = await Promise.allSettled([
        api.orders.getKitchenOrders(),
        api.orders.getAll({ type: 'cafe' })
      ]);

      setDashboardData(prev => ({
        ...prev,
        kitchenOrders: kitchenOrdersResult?.status === 'fulfilled'
          ? (kitchenOrdersResult.value?.data?.data?.orders ?? kitchenOrdersResult.value?.data?.orders ?? prev.kitchenOrders)
          : prev.kitchenOrders,
        preparingOrders: (() => {
          const allOrdersRaw = allOrdersResult?.status === 'fulfilled'
            ? (allOrdersResult.value?.data?.data?.orders ?? allOrdersResult.value?.data?.orders ?? [])
            : prev.preparingOrders.concat(prev.readyOrders);
          const allOrders = Array.isArray(allOrdersRaw) ? allOrdersRaw : [];
          return filterPreparingOrdersForKitchen(allOrders);
        })(),
        readyOrders: (() => {
          const allOrdersRaw = allOrdersResult?.status === 'fulfilled'
            ? (allOrdersResult.value?.data?.data?.orders ?? allOrdersResult.value?.data?.orders ?? [])
            : prev.preparingOrders.concat(prev.readyOrders);
          const allOrders = Array.isArray(allOrdersRaw) ? allOrdersRaw : [];
          return allOrders.filter(order => order.status === 'ready');
        })()
      }));
    } catch (error) {
      console.error('Error starting preparation:', error);
    }
  };
  // Mark order as ready
  const markOrderReady = async (orderId) => {
    try {
      await api.orders.markReady(orderId, { updated_by: user.id });
      toast.success('Order marked as ready!');
      const allOrdersResult = await Promise.allSettled([
        api.orders.getAll({ type: 'cafe' })
      ]);
      const allOrdersFetch = allOrdersResult?.[0];
      
      setDashboardData(prev => ({
        ...prev,
        preparingOrders: (() => {
          const allOrdersRaw = allOrdersFetch?.status === 'fulfilled'
            ? (allOrdersFetch.value?.data?.data?.orders ?? allOrdersFetch.value?.data?.orders ?? [])
            : prev.preparingOrders.concat(prev.readyOrders);
          const allOrders = Array.isArray(allOrdersRaw) ? allOrdersRaw : [];
          return filterPreparingOrdersForKitchen(allOrders);
        })(),
        readyOrders: (() => {
          const allOrdersRaw = allOrdersFetch?.status === 'fulfilled'
            ? (allOrdersFetch.value?.data?.data?.orders ?? allOrdersFetch.value?.data?.orders ?? [])
            : prev.preparingOrders.concat(prev.readyOrders);
          const allOrders = Array.isArray(allOrdersRaw) ? allOrdersRaw : [];
          return allOrders.filter(order => order.status === 'ready');
        })()
      }));
    } catch (error) {
      console.error('Error marking order ready:', error);
    }
  };
  // Start editing order items
  const startEditingOrder = (order) => {
    setEditingOrderId(order.id);
    // Ensure all items have proper data types
    const normalizedItems = (order.items || []).map(item => ({
      ...item,
      quantity: parseInt(item.quantity || 1),
      unit_price: parseFloat(item.unit_price || 0),
      subtotal: parseFloat(item.subtotal || 0),
      menu_item_id: parseInt(item.menu_item_id)
    }));
    setEditingItems(normalizedItems);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingOrderId(null);
    setEditingItems([]);
  };

  // Update item quantity
  const updateItemQuantity = (index, newQuantity) => {
    if (newQuantity < 1) return;
    
    const updatedItems = [...editingItems];
    updatedItems[index].quantity = parseInt(newQuantity);
    updatedItems[index].subtotal = parseFloat(updatedItems[index].unit_price || 0) * parseInt(newQuantity);
    setEditingItems(updatedItems);
  };

  // Remove item
  const removeItem = (index) => {
    const updatedItems = editingItems.filter((_, i) => i !== index);
    setEditingItems(updatedItems);
  };

  // Add new item
  const addMenuItem = (menuItem) => {
    const existingItemIndex = editingItems.findIndex(item => item.menu_item_id === menuItem.id);
    
    if (existingItemIndex >= 0) {
      updateItemQuantity(existingItemIndex, editingItems[existingItemIndex].quantity + 1);
    } else {
      const price = parseFloat(menuItem.price || 0);
      const newItem = {
        menu_item_id: parseInt(menuItem.id),
        menu_item_name: menuItem.name,
        quantity: 1,
        unit_price: price,
        subtotal: price
      };
      setEditingItems([...editingItems, newItem]);
    }
  };

  // Save order changes
  const saveOrderChanges = async () => {
    try {
      const itemsData = {
        items: editingItems.map(item => ({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal
        })),
        updated_by: user.id
      };

      await api.orders.updateItems(editingOrderId, itemsData);
      toast.success('Order items updated successfully!');
      
      // Refresh data
      const kitchenOrdersResult = await Promise.allSettled([
        api.orders.getKitchenOrders()
      ]);
      const kitchenFetch = kitchenOrdersResult?.[0];
      setDashboardData(prev => ({
        ...prev,
        kitchenOrders: kitchenFetch?.status === 'fulfilled'
          ? (kitchenFetch.value?.data?.data?.orders ?? kitchenFetch.value?.data?.orders ?? prev.kitchenOrders)
          : prev.kitchenOrders
      }));
      
      cancelEditing();
    } catch (error) {
      console.error('Error updating order items:', error);
      toast.error('Failed to update order items');
    }
  };

  // Start adding items to preparing order
  const startAddingItems = (order) => {
    setAddingItemsOrderId(order.id);
    setAddingItems([]);
  };

  // Cancel adding items
  const cancelAddingItems = () => {
    setAddingItemsOrderId(null);
    setAddingItems([]);
  };

  // Add menu item to adding items list
  const addMenuItemToPreparing = (menuItem) => {
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

  // Update quantity of adding items
  const updateAddingItemQuantity = (index, newQuantity) => {
    if (newQuantity < 1) return;
    
    const updatedItems = [...addingItems];
    updatedItems[index].quantity = parseInt(newQuantity);
    updatedItems[index].subtotal = parseFloat(updatedItems[index].unit_price || 0) * parseInt(newQuantity);
    setAddingItems(updatedItems);
  };

  // Remove item from adding items list
  const removeAddingItem = (index) => {
    const updatedItems = addingItems.filter((_, i) => i !== index);
    setAddingItems(updatedItems);
  };

  // Save added items to preparing order
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

      await api.orders.addItems(addingItemsOrderId, itemsData);
      toast.success('Items added to order successfully!');
      
      // Refresh data
      const allOrdersResult = await Promise.allSettled([
        api.orders.getAll({ type: 'cafe' })
      ]);
      const allOrdersFetch = allOrdersResult?.[0];
      
      setDashboardData(prev => ({
        ...prev,
        preparingOrders: (() => {
          const allOrdersRaw = allOrdersFetch?.status === 'fulfilled'
            ? (allOrdersFetch.value?.data?.data?.orders ?? allOrdersFetch.value?.data?.orders ?? [])
            : prev.preparingOrders.concat(prev.readyOrders);
          const allOrders = Array.isArray(allOrdersRaw) ? allOrdersRaw : [];
          return filterPreparingOrdersForKitchen(allOrders);
        })(),
        readyOrders: (() => {
          const allOrdersRaw = allOrdersFetch?.status === 'fulfilled'
            ? (allOrdersFetch.value?.data?.data?.orders ?? allOrdersFetch.value?.data?.orders ?? [])
            : prev.preparingOrders.concat(prev.readyOrders);
          const allOrders = Array.isArray(allOrdersRaw) ? allOrdersRaw : [];
          return allOrders.filter(order => order.status === 'ready');
        })()
      }));
      
      cancelAddingItems();
    } catch (error) {
      console.error('Error adding items to order:', error);
      toast.error('Failed to add items to order');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading kitchen dashboard..." />;
  }

  const statsCards = [
    {
      title: "Today's Orders",
      value: dashboardData.todayStats.ordersReceived,
      icon: FiClipboard,
      color: 'bg-blue-500'
    },
    {
      title: 'Orders Completed',
      value: dashboardData.todayStats.ordersCompleted,
      icon: FiCheckCircle,
      color: 'bg-green-500'
    },
    {
      title: 'Avg Prep Time',
      value: `${dashboardData.todayStats.averageTime} min`,
      icon: FiClock,
      color: 'bg-orange-500'
    }
  ];

  return (
    <div className="p-6 space-y-6">
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
                Kitchen Dashboard
              </h1>
              <BranchBadge />
            </div>
            <p className="text-gray-600 mt-1">
              Manage café orders and food preparation
            </p>
          </div>
        </div>
        
        {/* Attendance Controls */}
        <div className="flex items-center space-x-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* New Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              New Orders
            </h3>
            <span className="badge badge-info">
              {dashboardData.kitchenOrders.length}
            </span>
          </div>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {dashboardData.kitchenOrders.map((order) => (
              <div key={order.id} className="border border-gray-200 rounded-lg p-4 bg-blue-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <FiMapPin className="w-4 h-4 text-gray-600" />
                    <span className="font-semibold text-gray-900">
                      Table {order.table_number || 'N/A'}
                    </span>
                    <span className="text-sm text-gray-500">
                      Order #{order.id}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-blue-600">
                    ${parseFloat(order.total_amount).toFixed(2)}
                  </span>
                </div>

                {/* Order Items - Editable for pending orders */}
                {editingOrderId === order.id ? (
                  <div className="mb-4 p-3 bg-white rounded border">
                    <h4 className="font-medium text-gray-900 mb-2">Edit Order Items:</h4>
                    
                    {/* Current Items */}
                    <div className="space-y-2 mb-3">
                      {(editingItems || []).map((item, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                          <div className="flex-1">
                            <span className="font-medium">{item.menu_item_name}</span>
                            <span className="text-sm text-gray-600 ml-2">
                              ${parseFloat(item.unit_price).toFixed(2)} each
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => updateItemQuantity(index, item.quantity - 1)}
                              className="w-6 h-6 flex items-center justify-center bg-red-100 text-red-600 rounded hover:bg-red-200"
                            >
                              <FiMinus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                            <button
                              onClick={() => updateItemQuantity(index, item.quantity + 1)}
                              className="w-6 h-6 flex items-center justify-center bg-green-100 text-green-600 rounded hover:bg-green-200"
                            >
                              <FiPlus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => removeItem(index)}
                              className="w-6 h-6 flex items-center justify-center bg-red-100 text-red-600 rounded hover:bg-red-200 ml-2"
                            >
                              <FiX className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Menu Items */}
                    <div className="mb-3">
                      <h5 className="text-sm font-medium text-gray-700 mb-2">Add Food Items:</h5>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        {filterMenuItemsForKitchen(menuItems).map((menuItem) => (
                          <button
                            key={menuItem.id}
                            onClick={() => addMenuItem(menuItem)}
                            className="text-left p-2 bg-gray-100 rounded hover:bg-gray-200 text-xs"
                          >
                            <div className="font-medium">{menuItem.name}</div>
                            <div className="text-gray-600">${parseFloat(menuItem.price).toFixed(2)}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Total: ${(editingItems || []).reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0).toFixed(2)}
                      </span>
                      <div className="flex space-x-2">
                        <button
                          onClick={cancelEditing}
                          className="btn-outline text-xs py-1 px-2"
                        >
                          <FiX className="w-3 h-3 mr-1" />
                          Cancel
                        </button>
                        <button
                          onClick={saveOrderChanges}
                          className="btn-primary text-xs py-1 px-2"
                        >
                          <FiSave className="w-3 h-3 mr-1" />
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Display Order Items */
                  order.items && order.items.length > 0 && (
                    <div className="mb-3 p-2 bg-white rounded">
                      <h4 className="text-sm font-medium text-gray-900 mb-1">Order Items:</h4>
                      <div className="space-y-2">
                        {order.items.map((item, index) => {
                          const menuItem = (menuItems || []).find(mi => parseInt(mi.id) === parseInt(item.menu_item_id));
                          const imageUrl = menuItem && menuItem.image_url;
                          return (
                            <div key={index} className="flex items-center justify-between text-xs text-gray-600">
                              <div className="flex items-center space-x-2">
                                {imageUrl && (
                                  <img
                                    src={imageUrl}
                                    alt={item.menu_item_name}
                                    className="w-24 h-24 rounded object-cover border border-gray-200"
                                  />
                                )}
                                <div>
                                  <div>
                                    <span className="font-medium">{item.quantity}x</span> {item.menu_item_name}
                                  </div>
                                  {menuItem && menuItem.category && (
                                    <div className="text-[10px] text-gray-500">{menuItem.category}</div>
                                  )}
                                </div>
                              </div>
                              <span className="font-medium">${parseFloat(item.subtotal).toFixed(2)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                  <div className="flex space-x-2">
                    {editingOrderId !== order.id && (
                      <button
                        onClick={() => startEditingOrder(order)}
                        className="btn-outline text-xs py-1 px-2"
                      >
                        <FiEdit3 className="w-3 h-3 mr-1" />
                        Edit Items
                      </button>
                    )}
                    <button
                      onClick={() => startPreparing(order.id)}
                      disabled={editingOrderId === order.id}
                      className="btn-primary text-sm py-1 px-3 disabled:opacity-50"
                    >
                      Start Preparing
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {dashboardData.kitchenOrders.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No new orders
              </p>
            )}
          </div>
        </div>

        {/* Preparing Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Preparing
            </h3>
            <span className="badge badge-warning">
              {dashboardData.preparingOrders.length}
            </span>
          </div>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {dashboardData.preparingOrders.map((order) => (
              <div key={order.id} className="border border-gray-200 rounded-lg p-4 bg-yellow-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <FiMapPin className="w-4 h-4 text-gray-600" />
                    <span className="font-semibold text-gray-900">
                      Table {order.table_number || 'N/A'}
                    </span>
                    <span className="text-sm text-gray-500">
                      Order #{order.id}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-yellow-600">
                    ${parseFloat(order.total_amount).toFixed(2)}
                  </span>
                </div>

                {/* Current Order Items */}
                {order.items && order.items.length > 0 && (
                  <div className="mb-3 p-2 bg-white rounded">
                    <h4 className="text-sm font-medium text-gray-900 mb-1">Current Items:</h4>
                    <div className="space-y-2">
                      {order.items.map((item, index) => {
                        const menuItem = (menuItems || []).find(mi => parseInt(mi.id) === parseInt(item.menu_item_id));
                        const imageUrl = menuItem && menuItem.image_url;
                        return (
                          <div key={index} className="flex items-center justify-between text-xs text-gray-600">
                            <div className="flex items-center space-x-2">
                              {imageUrl && (
                                <img
                                  src={imageUrl}
                                  alt={item.menu_item_name}
                                  className="w-24 h-24 rounded object-cover border border-gray-200"
                                />
                              )}
                              <div>
                                <div>
                                  <span className="font-medium">{item.quantity}x</span> {item.menu_item_name}
                                </div>
                                {menuItem && menuItem.category && (
                                  <div className="text-[10px] text-gray-500">{menuItem.category}</div>
                                )}
                              </div>
                            </div>
                            <span className="font-medium">${parseFloat(item.subtotal).toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Add Items Interface */}
                {addingItemsOrderId === order.id ? (
                  <div className="mb-4 p-3 bg-white rounded border">
                    <h4 className="font-medium text-gray-900 mb-2">Add Items to Order:</h4>
                    
                    {/* Items being added */}
                    {addingItems.length > 0 && (
                      <div className="space-y-2 mb-3">
                        <h5 className="text-sm font-medium text-gray-700">Items to Add:</h5>
                        {addingItems.map((item, index) => (
                          <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
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
                      <h5 className="text-sm font-medium text-gray-700 mb-2">Select Food Items to Add:</h5>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        {filterMenuItemsForKitchen(menuItems).map((menuItem) => (
                          <button
                            key={menuItem.id}
                            onClick={() => addMenuItemToPreparing(menuItem)}
                            className="text-left p-2 bg-gray-100 rounded hover:bg-gray-200 text-xs"
                          >
                            <div className="font-medium">{menuItem.name}</div>
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
                ) : null}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Started: {new Date(order.updated_at).toLocaleString()}
                  </span>
                  <div className="flex space-x-2">
                    {addingItemsOrderId !== order.id && (
                      <button
                        onClick={() => startAddingItems(order)}
                        className="btn-outline text-xs py-1 px-2"
                      >
                        <FiPlus className="w-3 h-3 mr-1" />
                        Add Item
                      </button>
                    )}
                    <button
                      onClick={() => markOrderReady(order.id)}
                      disabled={addingItemsOrderId === order.id}
                      className="btn-secondary text-sm py-1 px-3 disabled:opacity-50"
                    >
                      Mark Ready
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {dashboardData.preparingOrders.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No orders in preparation
              </p>
            )}
          </div>
        </div>

        {/* Ready Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-900">
              Ready for Service
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
                    <FiMapPin className="w-4 h-4 text-gray-600" />
                    <span className="font-semibold text-gray-900">
                      Table {order.table_number || 'N/A'}
                    </span>
                    <span className="text-sm text-gray-500">
                      Order #{order.id}
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
                  <span className="badge badge-success text-xs">
                    Ready
                  </span>
                </div>
              </div>
            ))}
            {dashboardData.readyOrders.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No orders ready
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
          <button className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors">
            <FiAlertCircle className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">Priority Orders</span>
          </button>
          <button className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors">
            <FiTool className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">Kitchen Status</span>
          </button>
          <button className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors">
            <FiClock className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">Prep Times</span>
          </button>
          <button className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors">
            <FiUser className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600 font-medium">My Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default KitchenStaffDashboard;
