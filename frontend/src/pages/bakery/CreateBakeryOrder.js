import React, { useState, useEffect } from 'react';
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
  FiClock,
  FiHome,
  FiList
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Bakery Order Creation Page
 * Simplified interface for creating bakery orders
 */
const CreateBakeryOrder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderItems, setOrderItems] = useState([]);

  // Fetch bakery menu items
  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        setLoading(true);
        const response = await api.menu.getAll();
        const allItems = response.data.data.menuItems;
        const normalized = Array.isArray(allItems)
          ? allItems.map(item => ({
              ...item,
              main_category: item.main_category || 'restaurant',
              sub_category: item.sub_category || item.category || '',
              is_available: typeof item.is_available === 'boolean' ? item.is_available : (item.available ?? true)
            }))
          : [];
        const bakeryItems = normalized.filter(item => item.main_category === 'cafe' && item.is_available);
        setMenuItems(bakeryItems);
        setFilteredItems(bakeryItems);
      } catch (error) {
        console.error('Error fetching menu items:', error);
        toast.error('Failed to load menu items');
      } finally {
        setLoading(false);
      }
    };

    fetchMenuItems();
  }, []);

  // Filter items by category
  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredItems(menuItems);
    } else {
      setFilteredItems(menuItems.filter(item => (item.sub_category || item.category) === selectedCategory));
    }
  }, [selectedCategory, menuItems]);

  // Get unique categories
  const getCategories = () => {
    const categories = [...new Set(menuItems.map(item => item.sub_category || item.category).filter(Boolean))];
    return categories.sort();
  };

  // Generate placeholder image URL
  const getMenuItemImage = (item) => {
    // Return the image_url from the database if available
    if (item.image_url) {
      return item.image_url;
    }
    
    // Fallback image mapping for bakery items
    const bakeryImages = {
      'bread': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop',
      'cake': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=300&fit=crop',
      'pastry': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop',
      'croissant': 'https://images.unsplash.com/photo-1555507036-ab794f4afe5d?w=400&h=300&fit=crop',
      'muffin': 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=400&h=300&fit=crop',
      'donut': 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=300&fit=crop',
      'cookie': 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400&h=300&fit=crop'
    };
    
    // Match item name to image category
    const itemName = item.name.toLowerCase();
    for (const [key, url] of Object.entries(bakeryImages)) {
      if (itemName.includes(key)) {
        return url;
      }
    }
    
    // Default bakery image
    return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop';
  };

  // Add item to order with animation
  const addToOrder = (menuItem) => {
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
        quantity: 1,
        image: getMenuItemImage(menuItem)
      }]);
    }
    
    // Show success toast with animation
    toast.success(`Added ${menuItem.name} to order`, {
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

  // Submit order
  const handleSubmitOrder = async () => {
    if (creatingOrder) return;

    try {
      setCreatingOrder(true);

      if (orderItems.length === 0) {
        toast.error('Please add at least one item to the order');
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
        type: 'bakery',
        items: orderItems.map(item => {
          const unitPrice = parseFloat(item.price);
          const quantity = parseInt(item.quantity);
          return {
            menu_item_id: parseInt(item.menu_item_id),
            quantity: quantity,
            unit_price: unitPrice,
            subtotal: unitPrice * quantity
          };
        }),
        total_amount: parseFloat(calculateTotal())
      };

      await api.orders.createBakery(orderData);
      toast.success('Bakery order created successfully!');
      
      // Reset form
      setOrderItems([]);
      
      // Navigate to order history
      navigate('/bakery/order-history');
    } catch (error) {
      console.error('Error creating order:', error);
      if (error.response && error.response.data && error.response.data.errors) {
        const validationErrors = error.response.data.errors;
        const errorMessages = validationErrors.map(err => `${err.param}: ${err.msg}`).join('; ');
        toast.error(`Validation failed: ${errorMessages}`);
      } else {
        toast.error('Failed to create order. Please try again.');
      }
    } finally {
      setCreatingOrder(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading bakery menu..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* Simple Navigation Bar */}
      <div className="bg-white shadow-sm border-b border-gray-200 mb-6">
        <div className="flex items-center justify-between h-12 px-6">
          <div className="flex items-center space-x-2">
            <img
              src="/assets/logo.png"
              alt="Logo"
              className="w-8 h-8 object-contain"
            />
            <h1 className="text-lg font-semibold text-gray-900">Create New Bakery Order</h1>
            <BranchBadge />
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/bakery/order-history')}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors duration-200"
            >
              <FiList className="w-4 h-4" />
              <span>Order History</span>
            </button>
            <button
              onClick={() => navigate('/bakery/dashboard')}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
            >
              <FiHome className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
          </div>
        </div>
      </div>


      <div className="flex flex-col lg:flex-row gap-8 px-6 pb-8">
        {/* Menu Items Grid */}
        <div className="flex-1">
          {/* Category Filter */}
          {menuItems.length > 0 && (
            <div className="mb-6">
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
                  All Items ({menuItems.length})
                </button>
                {getCategories().map(category => {
                  const count = menuItems.filter(item => (item.sub_category || item.category) === category).length;
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

          {filteredItems.length === 0 ? (
            <div className="text-center py-16">
              <div className="animate-pulse">
                <FiClock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {menuItems.length === 0 ? 'Loading delicious bakery items...' : 'No items in this category'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredItems.map((item, index) => (
                <div
                  key={item.id}
                  className="group bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden cursor-pointer transform hover:scale-105 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => addToOrder(item)}
                >
                  {/* Image Container */}
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={getMenuItemImage(item)}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    
                    {/* Price Badge */}
                    <div className="absolute top-3 right-3">
                      <div className="bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-lg">
                        <span className="text-lg font-bold text-orange-600">
                          {parseFloat(item.price).toFixed(2)} Birr
                        </span>
                      </div>
                    </div>

                    {/* Add Button Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <button className="hover:opacity-80 text-black rounded-full p-3 shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-200" style={{backgroundColor: '#FFE5B4'}}>
                        <FiPlus className="w-6 h-6" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900 text-lg mb-1 group-hover:text-orange-600 transition-colors">
                      {item.name}
                    </h3>
                    {item.description && (
                      <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                        {item.description}
                      </p>
                    )}
                    
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fixed Order Summary Panel */}
        <div className="lg:w-96">
          <div className="lg:sticky lg:top-6">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              {/* Header */}
              <div className="p-6 text-black" style={{backgroundColor: '#FFE5B4'}}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Order Summary</h3>
                  <div className="flex items-center space-x-2">
                    <FiShoppingCart className="w-5 h-5" />
                    <span className="bg-white/20 rounded-full px-2 py-1 text-sm font-medium text-black">
                      {orderItems.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="p-6">
                {orderItems.length === 0 ? (
                  <div className="text-center py-8">
                    <FiShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Your cart is empty</p>
                    <p className="text-sm text-gray-400 mt-1">Add items from the menu</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {orderItems.map((item) => (
                      <div
                        key={item.menu_item_id}
                        className="flex items-center space-x-3 p-3 bg-gray-50 rounded-xl animate-slide-in"
                      >
                        {/* Item Image */}
                        <img
                          src={item.image}
                          alt={item.menu_item_name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        
                        {/* Item Details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">
                            {item.menu_item_name}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {parseFloat(item.price).toFixed(2)} Birr each
                          </p>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => updateQuantity(item.menu_item_id, -1)}
                            className="w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors flex items-center justify-center"
                          >
                            <FiMinus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center font-medium text-gray-900">
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

                {/* Submit Button */}
                <button
                  onClick={handleSubmitOrder}
                  disabled={orderItems.length === 0 || creatingOrder}
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
                {orderItems.length === 0 && (
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-start space-x-2">
                      <FiClock className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p>• Add items to your order</p>
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

export default CreateBakeryOrder;
