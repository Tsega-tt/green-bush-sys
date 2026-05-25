import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  FiPlus,
  FiEdit3,
  FiTrash2,
  FiToggleLeft,
  FiToggleRight,
  FiSearch
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/**
 * Menu Management Page Component
 * Admin interface for managing bakery and café menu items
 */
const MenuManagement = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const isAdmin = user?.role === 'admin';
  const [menuItems, setMenuItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState(isAdmin ? 'all' : 'cafe');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    main_category: 'cafe',
    sub_category: '',
    is_available: true,
    image_base64: ''
  });
  const [imagePreview, setImagePreview] = useState(null);

  // Fetch menu items
  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        setLoading(true);
        console.log('Fetching menu items...');
        const response = await api.menu.getAll();
        console.log('Menu API response:', response);
        console.log('Menu items data:', response.data);
        setMenuItems(response.data.data.menuItems || []);
        setFilteredItems(response.data.data.menuItems || []);
      } catch (error) {
        console.error('Error fetching menu items:', error);
        console.error('Error details:', error.response || error.message);
        toast.error(`Failed to load menu items: ${error.response?.data?.message || error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchMenuItems();
  }, []);

  // Filter items based on search and filters
  useEffect(() => {
    let filtered = menuItems;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply category filter (Cafe/Restaurant/Barista)
    if (filterType !== 'all') {
      filtered = filtered.filter(item => (item.main_category || '') === filterType);
    }

    // Apply sub category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(item => (item.sub_category || item.category) === filterCategory);
    }

    setFilteredItems(filtered);
  }, [menuItems, searchTerm, filterType, filterCategory]);

  // Toggle item availability
  const toggleAvailability = async (itemId) => {
    try {
      await api.menu.toggleAvailability(itemId);
      toast.success('Item availability updated');
      
      // Refresh menu items
      const response = await api.menu.getAll();
      setMenuItems(response.data.data.menuItems);
    } catch (error) {
      console.error('Error toggling availability:', error);
      toast.error('Failed to update item availability');
    }
  };

  // Get unique categories
  const getCategories = () => {
    const categories = [...new Set(menuItems.map(item => item.sub_category || item.category).filter(Boolean))];
    return categories.sort();
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = name === 'price'
      ? String(value ?? '').split(/[.,]/)[0].replace(/[^\d]/g, '')
      : value;
    setFormData(prev => {
      const next = {
        ...prev,
        [name]: type === 'checkbox' ? checked : nextValue
      };
      if (name === 'main_category') {
        next.sub_category = '';
      }
      return next;
    });
  };

  const getSubCategoryOptionsForForm = useMemo(() => {
    const normalize = (v) => String(v || '').trim().toLowerCase();
    const isSpecialDrinks = (v) => normalize(v) === normalize('ስፔሻል መጠጦች');
    const isFiskFoodLabel = (v) => normalize(v) === normalize('የፍስክ ምግብ');

    const main = String(formData?.main_category || '').trim();
    const mainKey = normalize(main);
    const effectiveMainKey = mainKey === 'fasting' ? 'fasting_break' : mainKey;
    const options = new Set();

    for (const it of (Array.isArray(menuItems) ? menuItems : [])) {
      const itMainRaw = String(it?.main_category || '').trim();
      const itMainKey = normalize(itMainRaw);
      if (effectiveMainKey && itMainKey && itMainKey !== effectiveMainKey) continue;
      const sub = String(it?.sub_category || it?.category || '').trim();
      if (!sub) continue;
      if ((effectiveMainKey === 'fasting' || effectiveMainKey === 'fasting_break') && (isSpecialDrinks(sub) || isFiskFoodLabel(sub))) continue;
      options.add(sub);
    }

    const current = String(formData?.sub_category || '').trim();
    if (current) {
      if (!((effectiveMainKey === 'fasting' || effectiveMainKey === 'fasting_break') && (isSpecialDrinks(current) || isFiskFoodLabel(current)))) {
        options.add(current);
      }
    }

    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [formData?.main_category, formData?.sub_category, menuItems]);

  // Handle add menu item
  const handleAddMenuItem = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      main_category: 'cafe',
      sub_category: '',
      is_available: true,
      image_base64: ''
    });
    setImagePreview(null);
    setShowAddModal(true);
  };

  // Handle edit menu item
  const handleEditMenuItem = (item) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      price: Number.isFinite(Number(item.price)) ? String(parseInt(item.price, 10)) : String(item.price || ''),
      main_category: item.main_category || 'cafe',
      sub_category: item.sub_category || item.category || '',
      is_available: item.is_available,
      image_base64: ''
    });
    setImagePreview(item.image_url || null);
    setShowEditModal(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      setFormData(prev => ({ ...prev, image_base64: result }));
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const priceInt = parseInt(formData.price, 10);
      if (!Number.isFinite(priceInt)) {
        toast.error('Please enter a valid whole number price');
        return;
      }
      const menuItemData = {
        ...formData,
        category: formData.sub_category,
        price: priceInt
      };

      if (showAddModal) {
        await api.menu.create(menuItemData);
        toast.success('Menu item created successfully');
        setShowAddModal(false);
      } else if (showEditModal) {
        await api.menu.update(selectedItem.id, menuItemData);
        toast.success('Menu item updated successfully');
        setShowEditModal(false);
      }
      
      // Refresh menu items
      const response = await api.menu.getAll();
      setMenuItems(response.data.data.menuItems);
    } catch (error) {
      console.error('Error saving menu item:', error);
      toast.error('Failed to save menu item');
    }
  };

  // Handle delete menu item
  const handleDeleteMenuItem = async (itemId) => {
    if (window.confirm('Are you sure you want to delete this menu item?')) {
      try {
        await api.menu.delete(itemId);
        toast.success('Menu item deleted successfully');
        
        // Refresh menu items
        const response = await api.menu.getAll();
        setMenuItems(response.data.data.menuItems);
      } catch (error) {
        console.error('Error deleting menu item:', error);
        toast.error('Failed to delete menu item');
      }
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading menu items..." />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isAdmin ? 'Menu Management' : 'Café Menu'}
          </h1>
          <p className="text-gray-600 mt-1">
            {isAdmin 
              ? 'Manage your bakery and café menu items'
              : 'Browse available café menu items'
            }
          </p>
        </div>
        {isAdmin && (
          <button 
            onClick={handleAddMenuItem}
            className="btn-primary flex items-center space-x-2"
          >
            <FiPlus className="w-4 h-4" />
            <span>Add Menu Item</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search menu items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input-field"
          >
            <option value="all">All Categories</option>
            <option value="cafe">Cafe</option>
            <option value="barista">Barista</option>
            <option value="fasting">የጾም ምግብ</option>
            <option value="fasting_break">የፍስክ ምግብ</option>
          </select>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="input-field"
          >
            <option value="all">All Sub Categories</option>
            {getCategories().map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          {/* Stats */}
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>Total: {filteredItems.length}</span>
            <span>Available: {filteredItems.filter(item => item.is_available).length}</span>
          </div>
        </div>
      </div>

      {/* Menu Items Grid */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No items found
          </h3>
          <p className="text-gray-600 mb-4">
            Try adjusting your search or filter criteria
          </p>
          {isAdmin && (
            <button 
              onClick={handleAddMenuItem}
              className="btn-primary"
            >
              Add First Menu Item
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <div key={item.id} className="card hover:shadow-md transition-shadow">
              <div className="w-full h-48 bg-gray-200 rounded-lg mb-4 overflow-hidden flex items-center justify-center">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-400 text-sm">No Image</span>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{item.name}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {item.description || 'No description available'}
                    </p>
                  </div>

                  <button
                    onClick={() => toggleAvailability(item.id)}
                    className="ml-2"
                  >
                    {item.is_available ? (
                      <FiToggleRight className="w-6 h-6 text-green-500" />
                    ) : (
                      <FiToggleLeft className="w-6 h-6 text-gray-400" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex space-x-2">
                    <span className={`badge ${item.main_category === 'barista' ? 'badge-info' : (item.main_category === 'cafe' ? 'badge-success' : 'badge-warning')}`}>
                      {item.main_category || 'cafe'}
                    </span>
                    <span className="badge">
                      {item.sub_category || item.category}
                    </span>
                  </div>
                  <span className="font-bold text-lg text-gray-900">
                    {Number.isFinite(Number(item.price)) ? parseInt(item.price, 10) : item.price}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`badge ${item.is_available ? 'badge-success' : 'badge-error'}`}>
                    {item.is_available ? 'Available' : 'Unavailable'}
                  </span>
                  {isAdmin && (
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleEditMenuItem(item)}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <FiEdit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteMenuItem(item.id)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Menu Item Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div className="bg-white rounded-lg w-full max-w-md mx-auto my-8 max-h-[calc(100vh-4rem)] sm:max-h-[calc(100vh-6rem)] overscroll-contain flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-gray-900">
                {showAddModal ? 'Add New Menu Item' : 'Edit Menu Item'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>
          
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                />
              </div>
            
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  className="input-field"
                  rows="3"
                />
              </div>
            
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="input-field"
                />
                {imagePreview && (
                  <div className="mt-2 w-full h-40 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price
                </label>
                <input
                  type="text"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  className="input-field"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  name="main_category"
                  value={formData.main_category}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                >
                  <option value="cafe">Cafe</option>
                  <option value="barista">Barista</option>
                  <option value="fasting">የጾም ምግብ</option>
                  <option value="fasting_break">የፍስክ ምግብ</option>
                </select>
              </div>
            
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sub Category
                </label>
                <select
                  name="sub_category"
                  value={formData.sub_category}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                >
                  <option value="" disabled>Select sub category</option>
                  {getSubCategoryOptionsForForm.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_available"
                  checked={formData.is_available}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  Available for ordering
                </label>
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-4 mt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                }}
                className="btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
              >
                {showAddModal ? 'Create Item' : 'Update Item'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

  </div>
  );
};

export default MenuManagement;
