import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FiMapPin,
  FiClock,
  FiHome,
  FiList,
  FiLogOut
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Waiter Order Creation Page
 * Simplified interface for creating café orders
 */
const CreateOrder = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedMainCategory, setSelectedMainCategory] = useState('all');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');
  const [orderItems, setOrderItems] = useState([]);
  const [allTables, setAllTables] = useState([]);
  const [recentMenuVersion, setRecentMenuVersion] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const submitLockRef = useRef(false);
  const searchInputRef = useRef(null);
  const itemRefsByIdRef = useRef(new Map());

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const RECENT_MENU_ITEMS_KEY = `waiter_recent_menu_items_${user?.id || 'unknown'}_v1`;
  const RECENT_MENU_ITEMS_MAX = 30;

  const loadRecentMenuItemIds = useCallback(() => {
    try {
      const raw = localStorage.getItem(RECENT_MENU_ITEMS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isFinite(id));
    } catch {
      return [];
    }
  }, [RECENT_MENU_ITEMS_KEY]);

  const saveRecentMenuItemIds = (ids) => {
    try {
      localStorage.setItem(RECENT_MENU_ITEMS_KEY, JSON.stringify(ids));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const MENU_CACHE_KEY = 'waiter_cafe_menu_cache_v2';
    const MENU_CACHE_TTL_MS = 5 * 60 * 1000;

    const loadCachedMenu = () => {
      try {
        const raw = localStorage.getItem(MENU_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.items) || !Number.isFinite(parsed.ts)) return null;
        if (Date.now() - parsed.ts > MENU_CACHE_TTL_MS) return null;
        return parsed.items;
      } catch {
        return null;
      }
    };

    const cacheMenu = (items) => {
      try {
        localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
      } catch {
        // ignore
      }
    };

    const normalizeMenuItems = (rawItems) => {
      const normalizedItems = Array.isArray(rawItems)
        ? rawItems.map((item) => ({
            ...item,
            main_category: item.main_category || 'cafe',
            sub_category: item.sub_category || item.category || '',
            is_available: typeof item.is_available === 'boolean' ? item.is_available : (item.available ?? true),
          }))
        : [];
      return normalizedItems.filter(item => item.is_available);
    };

    const fetchData = async () => {
      try {
        const cached = loadCachedMenu();
        const hasCachedMenu = !!(cached && cached.length > 0);
        if (!hasCachedMenu) {
          setLoading(true);
        }
        if (cached && cached.length > 0) {
          setMenuItems(cached);
          setFilteredItems(cached);
          setLoading(false);
        }

        const [menuResult, tablesResult] = await Promise.allSettled([
          api.menu.getCafeMenu(),
          api.tables.getAll()
        ]);

        if (menuResult.status === 'fulfilled') {
          const menuResponse = menuResult.value;
          const rawItems = (menuResponse?.data?.data?.menuItems) ?? (menuResponse?.data?.menuItems) ?? [];
          const availableItems = normalizeMenuItems(rawItems);
          setMenuItems(availableItems);
          setFilteredItems(availableItems);
          cacheMenu(availableItems);
        }

        if (tablesResult.status === 'fulfilled') {
          const allTablesResponse = tablesResult.value;
          const tables = (allTablesResponse?.data?.data?.tables) ?? [];
          const tablesArray = Array.isArray(tables) ? tables.sort((a, b) => a.number - b.number) : [];
          setAllTables(tablesArray);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load menu items or table status');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filter items by category
  useEffect(() => {
    const mainFiltered = selectedMainCategory === 'all'
      ? menuItems
      : menuItems.filter(item => (item.main_category || 'cafe') === selectedMainCategory);

    if (selectedCategory === 'all') {
      if (selectedMainCategory === 'all') {
        const recentIds = loadRecentMenuItemIds();
        const rank = new Map(recentIds.map((id, idx) => [id, idx]));
        const sorted = [...mainFiltered].sort((a, b) => {
          const aId = parseInt(a?.id, 10);
          const bId = parseInt(b?.id, 10);
          const aRank = Number.isFinite(aId) && rank.has(aId) ? rank.get(aId) : Infinity;
          const bRank = Number.isFinite(bId) && rank.has(bId) ? rank.get(bId) : Infinity;
          if (aRank !== bRank) return aRank - bRank;
          return String(a?.name || '').localeCompare(String(b?.name || ''));
        });
        setFilteredItems(sorted);
      } else {
        setFilteredItems(mainFiltered);
      }
    } else {
      setFilteredItems(
        mainFiltered.filter(item => (item.sub_category || item.category) === selectedCategory)
      );
    }
  }, [selectedCategory, selectedMainCategory, menuItems, recentMenuVersion, loadRecentMenuItemIds]);

  const parseSearchQuery = useCallback((raw) => {
    const q = String(raw || '').trim();
    if (!q) return { textTokens: [], categoryTokens: [], mainCategoryTokens: [], minPrice: null, maxPrice: null };
    const parts = q.split(/\s+/).filter(Boolean);
    const out = { textTokens: [], categoryTokens: [], mainCategoryTokens: [], minPrice: null, maxPrice: null };
    for (const p of parts) {
      const s = String(p);
      const lower = s.toLowerCase();
      const catMatch = lower.match(/^(?:cat|category):(.+)$/);
      if (catMatch) {
        out.categoryTokens.push(String(catMatch[1] || '').trim());
        continue;
      }
      const mainMatch = lower.match(/^(?:main|dept):(.+)$/);
      if (mainMatch) {
        out.mainCategoryTokens.push(String(mainMatch[1] || '').trim());
        continue;
      }
      const gte = lower.match(/^(?:price)?(>=|>|min:)(\d+(?:\.\d+)?)$/);
      if (gte) {
        const n = parseFloat(gte[2]);
        if (Number.isFinite(n)) out.minPrice = out.minPrice == null ? n : Math.max(out.minPrice, n);
        continue;
      }
      const lte = lower.match(/^(?:price)?(<=|<|max:)(\d+(?:\.\d+)?)$/);
      if (lte) {
        const n = parseFloat(lte[2]);
        if (Number.isFinite(n)) out.maxPrice = out.maxPrice == null ? n : Math.min(out.maxPrice, n);
        continue;
      }
      const bareNumber = lower.match(/^(\d+(?:\.\d+)?)$/);
      if (bareNumber) {
        const n = parseFloat(bareNumber[1]);
        if (Number.isFinite(n)) {
          out.textTokens.push(bareNumber[1]);
        }
        continue;
      }
      out.textTokens.push(s);
    }
    out.textTokens = out.textTokens.map(t => String(t).toLowerCase());
    out.categoryTokens = out.categoryTokens.map(t => String(t).toLowerCase());
    out.mainCategoryTokens = out.mainCategoryTokens.map(t => String(t).toLowerCase());
    return out;
  }, []);

  const scoreFuzzy = useCallback((haystack, needle) => {
    const h = String(haystack || '').toLowerCase();
    const n = String(needle || '').toLowerCase();
    if (!n) return 0;
    if (!h) return -Infinity;
    if (h === n) return 1000;
    const idx = h.indexOf(n);
    if (idx >= 0) return 700 - idx;
    let hi = 0;
    let matched = 0;
    for (let ni = 0; ni < n.length; ni++) {
      const ch = n[ni];
      const found = h.indexOf(ch, hi);
      if (found === -1) return -Infinity;
      matched++;
      hi = found + 1;
    }
    return 200 + matched;
  }, []);

  const searchedItems = useMemo(() => {
    const q = parseSearchQuery(searchQuery);
    if (
      q.textTokens.length === 0 &&
      q.categoryTokens.length === 0 &&
      q.mainCategoryTokens.length === 0 &&
      q.minPrice == null &&
      q.maxPrice == null
    ) {
      return filteredItems;
    }

    const results = [];
    for (const item of (Array.isArray(filteredItems) ? filteredItems : [])) {
      const name = String(item?.name || '');
      const sub = String(item?.sub_category || item?.category || '');
      const main = String(item?.main_category || '');
      const price = parseFloat(item?.price);

      if (q.minPrice != null && Number.isFinite(price) && price < q.minPrice) continue;
      if (q.maxPrice != null && Number.isFinite(price) && price > q.maxPrice) continue;

      if (q.categoryTokens.length > 0) {
        const subLower = sub.toLowerCase();
        let ok = true;
        for (const tok of q.categoryTokens) {
          if (!tok) continue;
          if (!subLower.includes(tok)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }

      if (q.mainCategoryTokens.length > 0) {
        const mainLower = main.toLowerCase();
        let ok = true;
        for (const tok of q.mainCategoryTokens) {
          if (!tok) continue;
          if (!mainLower.includes(tok)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }

      let score = 0;
      for (const tok of q.textTokens) {
        const s1 = scoreFuzzy(name, tok);
        const s2 = scoreFuzzy(sub, tok);
        const s3 = scoreFuzzy(main, tok);
        const s4 = Number.isFinite(price) ? scoreFuzzy(String(price), tok) : -Infinity;
        const best = Math.max(s1, s2, s3, s4);
        if (best === -Infinity) {
          score = -Infinity;
          break;
        }
        score += best;
      }
      if (score === -Infinity) continue;
      results.push({ item, score });
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.item?.name || '').localeCompare(String(b.item?.name || ''));
    });
    return results.map(r => r.item);
  }, [filteredItems, parseSearchQuery, scoreFuzzy, searchQuery]);

  useEffect(() => {
    setSearchActiveIndex(0);
  }, [searchQuery, selectedCategory, selectedMainCategory]);

  const onSearchKeyDown = (e) => {
    if (!searchedItems || searchedItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchActiveIndex((i) => Math.min(i + 1, searchedItems.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = searchedItems[Math.min(Math.max(searchActiveIndex, 0), searchedItems.length - 1)];
      if (item) addToOrder(item);
    }
  };

  useEffect(() => {
    const item = searchedItems && searchedItems[searchActiveIndex];
    if (!item?.id) return;
    const el = itemRefsByIdRef.current.get(item.id);
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        // ignore
      }
    }
  }, [searchActiveIndex, searchedItems]);

  // Get unique main categories
  const getMainCategories = () => {
    const mainCats = [...new Set(menuItems.map(item => item.main_category || 'cafe').filter(Boolean))];
    return mainCats
      .filter((c) => String(c).trim().toLowerCase() !== 'restaurant')
      .sort();
  };

  const getMainCategoryLabel = useCallback((mainCat) => {
    const k = String(mainCat || '').trim().toLowerCase();
    if (k === 'fasting') return 'የጾም ምግብ';
    if (k === 'fasting_break') return 'የፍስክ ምግብ';
    if (!k) return '';
    return k.charAt(0).toUpperCase() + k.slice(1);
  }, []);

  // Get unique categories
  const getCategories = () => {
    const normalize = (v) => String(v || '').trim().toLowerCase();
    const isSpecialDrinks = (v) => normalize(v) === normalize('ስፔሻል መጠጦች');
    const isFiskFoodLabel = (v) => normalize(v) === normalize('የፍስክ ምግብ');

    const selectedKey = normalize(selectedMainCategory);
    let source = selectedMainCategory === 'all'
      ? menuItems
      : menuItems.filter(item => (item.main_category || 'cafe') === selectedMainCategory);

    if (selectedKey === 'fasting') {
      const fastingBreakSource = menuItems.filter(item => normalize(item.main_category || 'cafe') === 'fasting_break');
      if (fastingBreakSource.length > 0) source = fastingBreakSource;
    }

    const categories = [...new Set(source.map(item => item.sub_category || item.category).filter(Boolean))]
      .filter((c) => !isSpecialDrinks(c))
      .filter((c) => !isFiskFoodLabel(c));

    return categories.sort();
  };

  // Generate placeholder image URL
  const getMenuItemImage = (item) => {
    // Return the image_url from the database if available
    if (item.image_url) {
      return item.image_url;
    }
    
    // Fallback image mapping for items without image_url
    const foodImages = {};
    
    // Match item name to image category
    const itemName = (item.name || '').toLowerCase();
    for (const [key, url] of Object.entries(foodImages)) {
      if (itemName.includes(key)) {
        return url;
      }
    }
    
    // Default food image
    return null;
  };

  // Add item to order with animation
  const addToOrder = (menuItem) => {
    void getMenuItemImage(menuItem);
    const existingItem = orderItems.find(item => item.menu_item_id === menuItem.id);
    
    if (existingItem) {
      setOrderItems(prev => prev.map(item =>
        item.menu_item_id === menuItem.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setOrderItems(prev => [...prev, {
        menu_item_id: menuItem.id,
        menu_item_name: menuItem.name,
        price: menuItem.price,
        quantity: 1
      }]);
    }
    
    // Show success toast with animation
    toast.success('Add', {
      id: 'waiter-add-to-order',
      duration: 1000,
      icon: '🛒',
      style: {
        borderRadius: '10px',
        background: '#10B981',
        color: '#fff',
      },
    });
  };

  // Remove item from order
  const removeFromOrder = (menuItemId) => {
    setOrderItems(prev => prev.filter(item => item.menu_item_id !== menuItemId));
  };

  // Update item quantity
  const updateQuantity = (menuItemId, change) => {
    setOrderItems(prev => prev.map(item => {
      if (item.menu_item_id === menuItemId) {
        const newQuantity = item.quantity + change;
        return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  // Calculate total
  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => 
      sum + (parseFloat(item.price) * item.quantity), 0
    ).toFixed(2);
  };

  const beverageCategories = [
    'coffee', 'beverages', 'drinks', 'tea', 'espresso', 
    'cappuccino', 'latte', 'americano', 'cold drinks',
    'hot drinks', 'iced coffee', 'frappuccino', 'smoothie',
    'juice', 'soda', 'water'
  ];

  // Categorize order items for routing display
  const categorizeOrderItems = () => {
    const beverageItems = [];
    const foodItems = [];

    orderItems.forEach(item => {
      const itemName = item.menu_item_name.toLowerCase();
      const isBeverage = beverageCategories.some(bevCat => 
        itemName.includes(bevCat)
      );

      if (isBeverage) {
        beverageItems.push(item);
      } else {
        foodItems.push(item);
      }
    });

    return { beverageItems, foodItems };
  };

  // Get order routing info
  const getOrderRoutingInfo = () => {
    if (orderItems.length === 0) return null;
    
    const { beverageItems, foodItems } = categorizeOrderItems();
    
    if (foodItems.length === 0) {
      return {
        type: 'beverage_only',
        message: 'Beverages only - Will go directly to cashier',
        icon: '☕',
        color: 'text-blue-600 bg-blue-50'
      };
    } else if (beverageItems.length === 0) {
      return {
        type: 'food_only',
        message: 'Food items only - Will go to kitchen then cashier',
        icon: '🍽️',
        color: 'text-orange-600 bg-orange-50'
      };
    } else {
      return {
        type: 'mixed',
        message: `Mixed order - Beverages (${beverageItems.length}) will wait for food items (${foodItems.length}) to complete`,
        icon: '🔄',
        color: 'text-purple-600 bg-purple-50'
      };
    }
  };

  // Submit order
  const handleSubmitOrder = async () => {
    if (submitLockRef.current) return;
    if (creatingOrder) return;
    submitLockRef.current = true;

    try {
      setCreatingOrder(true);

      if (orderItems.length === 0) {
        toast.error('Please add at least one item to the order');
        return;
      }

      if (!selectedTable) {
        toast.error('Please select a table or Take Away');
        return;
      }

      const employeeId = user?.id != null
        ? parseInt(user.id, 10)
        : (user?.user_id != null ? parseInt(user.user_id, 10) : null);
      if (!Number.isFinite(employeeId)) {
        toast.error('Your account is missing an employee id. Please logout and login again.');
        return;
      }

      const orderData = {
        employee_id: employeeId,
        type: 'cafe',
        items: orderItems.map(item => {
          const unitPrice = parseFloat(item.price);
          const quantity = parseInt(item.quantity);
          const itemName = String(item.menu_item_name || '').toLowerCase();
          const isBeverage = beverageCategories.some(bevCat => itemName.includes(bevCat));
          return {
            menu_item_id: parseInt(item.menu_item_id),
            menu_item_name: item.menu_item_name,
            quantity: quantity,
            unit_price: unitPrice,
            subtotal: unitPrice * quantity,
            item_type: isBeverage ? 'beverage' : 'food'
          };
        }),
        total_amount: parseFloat(calculateTotal())
      };

      if (selectedTable && selectedTable !== 'takeaway') {
        orderData.table_number = parseInt(selectedTable);
      }

      await api.orders.createCafe(orderData);
      toast.success('Order created successfully!');

      try {
        const recentIds = loadRecentMenuItemIds();
        const orderedIds = orderItems
          .map((it) => parseInt(it.menu_item_id, 10))
          .filter((id) => Number.isFinite(id));

        const next = [...orderedIds, ...recentIds.filter((id) => !orderedIds.includes(id))]
          .slice(0, RECENT_MENU_ITEMS_MAX);
        saveRecentMenuItemIds(next);
        setRecentMenuVersion((v) => v + 1);
      } catch {
        // ignore
      }

      await logout();
      navigate('/login');

      // Reset form
      setSelectedTable('');
      setOrderItems([]);
    } finally {
      setCreatingOrder(false);
      submitLockRef.current = false;
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading menu..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* Simple Navigation Bar */}
      <div className="bg-white shadow-sm border-b border-gray-200 mb-6">
        <div className="flex items-center justify-between h-12 px-3 sm:px-6">
          <div className="flex items-center space-x-2">
            <img
              src="/assets/logo.png"
              alt="Logo"
              className="w-8 h-8 object-contain"
            />
            <h1 className="text-lg font-semibold text-gray-900">Create Order</h1>
            <BranchBadge />
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/waiter/order-history')}
              className="flex items-center space-x-2 px-2 sm:px-3 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors duration-200"
            >
              <FiList className="w-4 h-4" />
              <span className="hidden sm:inline">Order History</span>
            </button>
            <button
              onClick={() => navigate('/waiter/dashboard')}
              className="flex items-center space-x-2 px-2 sm:px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
            >
              <FiHome className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-2 sm:px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
            >
              <FiLogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Attractive Table Selection Header */}
      <div className="relative overflow-hidden mb-8">
        {/* Background Pattern */}
        <div className="absolute inset-0" style={{backgroundColor: '#FFE5B4'}}></div>
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        
        <div className="relative px-3 sm:px-6 py-4">
          {/* Inline Table Selection */}
          <div className="max-w-5xl mx-auto">
            <div className="bg-white/15 backdrop-blur-md rounded-xl p-3 shadow-lg border border-white/20">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:space-x-3">
                {/* Label */}
                <div className="flex items-center space-x-2 text-black">
                  <FiMapPin className="w-4 h-4" />
                  <span className="text-sm font-medium">Table:</span>
                </div>
                
                {/* Horizontal Table List */}
                <div className="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto justify-start sm:justify-center">
                  {allTables.map(table => {
                    const num = table.number;
                    const isSelected = selectedTable === num.toString();
                    
                    return (
                      <div key={num} className="relative">
                        <button
                          onClick={() => {
                            setSelectedTable(num.toString());
                          }}
                          className={`relative flex-shrink-0 w-10 h-10 rounded-lg transition-all duration-200 transform ${
                            isSelected
                              ? 'text-black shadow-md scale-105 bg-[#FFE5B4]'
                              : 'bg-white/25 text-black hover:bg-white/40 hover:scale-105'
                          }`}
                          title={`Table ${num}`}
                        >
                          <span className="text-sm font-bold">{num}</span>
                        </button>
                      </div>
                    );
                  })}
                  
                  {/* Take Away Option */}
                  <div className="relative ml-2">
                    <button
                      onClick={() => setSelectedTable('takeaway')}
                      className={`relative flex-shrink-0 px-4 h-10 rounded-lg transition-all duration-200 transform whitespace-nowrap ${
                        selectedTable === 'takeaway'
                          ? 'text-black shadow-md scale-105 bg-[#FFE5B4]'
                          : 'bg-white/25 text-black hover:bg-white/40 hover:scale-105'
                      }`}
                      title="Take Away Order"
                    >
                      <span className="text-sm font-bold">Take Away</span>
                      
                      {/* Selection Indicator */}
                      {selectedTable === 'takeaway' && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full">
                          <div className="w-1.5 h-1.5 bg-white rounded-full absolute top-0.5 left-0.5"></div>
                        </div>
                      )}
                    </button>
                  </div>
                </div>
                
                {/* Selected Table Info */}
                {selectedTable && (
                  <div className="flex items-center space-x-1 bg-green-500/20 backdrop-blur-sm rounded-lg px-2 py-1 text-black text-xs">
                    <FiCheck className="w-3 h-3" />
                    <span>
                      {selectedTable === 'takeaway' ? 'Take Away' : `Table #${selectedTable}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </div>

        <div className="flex flex-col lg:flex-row gap-5 sm:gap-8 px-3 sm:px-6 pb-8">
        {/* Menu Items Grid */}
        <div className="flex-1">
          {/* Category Filter */}
          {menuItems.length > 0 && (
            <div className="mb-6">
              <div className="mb-4 flex justify-center">
                <div className="w-full max-w-3xl">
                  <div className="relative">
                    <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={onSearchKeyDown}
                      placeholder="Search menu (name, category, price). Examples: latte, cat:breakfast, >=100"
                      className="w-full pl-12 pr-12 py-3 rounded-2xl bg-white shadow-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-200"
                    />
                    {searchQuery.trim() !== '' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchActiveIndex(0);
                          try { searchInputRef.current?.focus?.(); } catch (e) {}
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center"
                        title="Clear search"
                      >
                        <FiX className="w-5 h-5 text-gray-500" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 text-center text-xs text-gray-500">
                    Showing {searchedItems.length} of {filteredItems.length}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mb-3">
                <button
                  key="all"
                  onClick={() => {
                    setSelectedMainCategory('all');
                    setSelectedCategory('all');
                  }}
                  className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-full text-base sm:text-lg font-bold transition-all duration-200 ${
                    selectedMainCategory === 'all'
                      ? 'text-black shadow-lg scale-105'
                      : 'bg-white text-gray-700 hover:opacity-80 shadow-md'
                  }`}
                  style={{
                    backgroundColor: selectedMainCategory === 'all' ? '#FFE5B4' : undefined
                  }}
                >
                  All ({menuItems.length})
                </button>
                {getMainCategories().map(mainCat => {
                  const count = menuItems.filter(item => (item.main_category || 'cafe') === mainCat).length;
                  const displayLabel = getMainCategoryLabel(mainCat);
                  return (
                    <button
                      key={mainCat}
                      onClick={() => {
                        setSelectedMainCategory(mainCat);
                        setSelectedCategory('all');
                      }}
                      className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-full text-base sm:text-lg font-bold transition-all duration-200 ${
                        selectedMainCategory === mainCat
                          ? 'text-black shadow-lg scale-105'
                          : 'bg-white text-gray-700 hover:opacity-80 shadow-md'
                      }`}
                      style={{
                        backgroundColor: selectedMainCategory === mainCat ? '#FF9800' : undefined,
                        borderColor: selectedMainCategory === mainCat ? '#FF9800' : undefined
                      }}
                    >
                      {displayLabel} ({count})
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    selectedCategory === 'all'
                      ? 'text-black shadow-lg'
                      : 'bg-white text-gray-700 hover:opacity-80 shadow-md'
                  }`}
                  style={{
                    backgroundColor: selectedCategory === 'all' ? '#FFE5B4' : undefined
                  }}
                >
                  All Items ({selectedMainCategory === 'all' ? menuItems.length : menuItems.filter(item => (item.main_category || 'cafe') === selectedMainCategory).length})
                </button>
                {getCategories().map(category => {
                  const count = (selectedMainCategory === 'all'
                    ? menuItems
                    : menuItems.filter(item => (item.main_category || 'cafe') === selectedMainCategory)
                  ).filter(item => (item.sub_category || item.category) === category).length;
                  const displayName = category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                  return (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                        selectedCategory === category
                          ? 'text-black shadow-lg'
                          : 'bg-white text-gray-700 hover:opacity-80 shadow-md'
                      }`}
                      style={{
                        backgroundColor: selectedCategory === category ? '#FFE5B4' : undefined
                      }}
                    >
                      {displayName} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {searchedItems.length === 0 ? (
            <div className="text-center py-16">
              <div className="animate-pulse">
                <FiClock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {menuItems.length === 0 ? 'Loading delicious menu items...' : (searchQuery.trim() ? 'No items match your search' : 'No items in this category')}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
              {searchedItems.map((item, index) => (
                <div
                  key={item.id}
                  ref={(el) => {
                    if (!item?.id) return;
                    if (el) itemRefsByIdRef.current.set(item.id, el);
                    else itemRefsByIdRef.current.delete(item.id);
                  }}
                  className={`group bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden cursor-pointer transform hover:scale-105 animate-fade-in ${index === searchActiveIndex ? 'ring-2 ring-orange-300' : ''}`}
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => addToOrder(item)}
                >
                  {/* Image Container */}
                  <div className="p-4 sm:p-6 flex flex-col items-center justify-center text-center min-h-[120px] sm:min-h-[140px]">
                    <h3 className="font-bold text-gray-900 text-base sm:text-xl leading-snug mb-3 sm:mb-4">
                      {item.name}
                    </h3>

                    {/* Price Badge */}
                    <div className="bg-orange-50 rounded-full px-4 sm:px-5 py-1.5 sm:py-2">
                      <span className="text-sm sm:text-lg font-bold text-orange-600">
                        {parseFloat(item.price).toFixed(2)} Birr
                      </span>
                    </div>

                    {/* Add Button Overlay */}
                  </div>

                  {/* Content */}
                  <div className="p-0"></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fixed Order Summary Panel */}
        <div className="lg:w-96">
          <div className="lg:sticky lg:top-6">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]">
              {/* Header */}
              <div className="p-4 sm:p-6 text-black" style={{backgroundColor: '#FFE5B4'}}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold">Order Summary</h3>
                    {selectedTable && (
                      <div className="mt-1 flex items-center space-x-1 text-sm font-medium">
                        <FiMapPin className="w-4 h-4" />
                        <span>
                          {selectedTable === 'takeaway' ? 'Take Away' : `Table #${selectedTable}`}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <FiShoppingCart className="w-5 h-5" />
                    <span className="bg-white/20 rounded-full px-2 py-1 text-sm font-medium text-black">
                      {orderItems.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                {orderItems.length === 0 ? (
                  <div className="text-center py-8">
                    <FiShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Your cart is empty</p>
                    <p className="text-sm text-gray-400 mt-1">Add items from the menu</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orderItems.map((item) => (
                      <div
                        key={item.menu_item_id}
                        className="flex items-center gap-2 sm:gap-3 p-3 bg-gray-50 rounded-xl animate-slide-in"
                      >
                        {/* Item Image */}
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-orange-100 text-orange-700 font-bold flex items-center justify-center flex-shrink-0">
                          {String(item.menu_item_name || '?').trim().slice(0, 1).toUpperCase()}
                        </div>
                        
                        {/* Item Details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 line-clamp-2 break-words leading-snug">
                            {item.menu_item_name}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {parseFloat(item.price).toFixed(2)} Birr each
                          </p>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <button
                            onClick={() => updateQuantity(item.menu_item_id, -1)}
                            className="w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors flex items-center justify-center"
                          >
                            <FiMinus className="w-4 h-4" />
                          </button>
                          <span className="w-7 sm:w-8 text-center font-medium text-gray-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.menu_item_id, 1)}
                            className="w-8 h-8 rounded-full hover:opacity-80 transition-colors flex items-center justify-center text-black"
                            style={{backgroundColor: '#FFE5B4'}}
                          >
                            <FiPlus className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => removeFromOrder(item.menu_item_id)}
                          className="w-8 h-8 rounded-full bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors flex items-center justify-center"
                        >
                          <FiX className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total */}
                {orderItems.length > 0 && (
                  <div className="border-t border-gray-200 pt-4 mt-6">
                    <div className="flex justify-between items-center text-xl font-bold">
                      <span className="text-gray-900">Total:</span>
                      <span className="text-orange-600">{calculateTotal()} Birr</span>
                    </div>
                  </div>
                )}

                {/* Order Routing Info */}
                {(() => {
                  const routingInfo = getOrderRoutingInfo();
                  return routingInfo && (
                    <div className={`mt-4 p-3 rounded-lg border ${routingInfo.color}`}>
                      <div className="flex items-start space-x-2">
                        <span className="text-lg">{routingInfo.icon}</span>
                        <div className="text-sm font-medium">
                          <p className="font-semibold mb-1">Order Routing:</p>
                          <p>{routingInfo.message}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={handleSubmitOrder}
                  disabled={orderItems.length === 0 || creatingOrder || !selectedTable}
                  className="w-full mt-6 hover:opacity-80 disabled:opacity-50 text-black font-bold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed shadow-lg flex items-center justify-center space-x-2"
                  style={{backgroundColor: '#FFE5B4'}}
                >
                  {creatingOrder ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Creating Order...</span>
                    </>
                  ) : (
                    <>
                      <FiCheck className="w-5 h-5" />
                      <span>Place Order</span>
                    </>
                  )}
                </button>

                {/* Order Requirements */}
                {(orderItems.length === 0 || !selectedTable) && (
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-start space-x-2">
                      <FiClock className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        {orderItems.length === 0 && <p>• Add items to your order</p>}
                        {!selectedTable && <p>• Select a table or Take Away</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Styles */}
      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
          opacity: 0;
        }
        
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        
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

export default CreateOrder;
