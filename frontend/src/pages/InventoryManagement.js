import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  FiPlus,
  FiEdit3,
  FiTrash2,
  FiRefreshCw
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const InventoryManagement = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showQtyModal, setShowQtyModal] = useState(false);

  const [selectedItem, setSelectedItem] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    menu_item_ids: [],
    unit: 'pcs',
    quantity: 0,
    min_quantity: 0,
  });

  const [qtyData, setQtyData] = useState({
    mode: 'set',
    quantity: '',
    delta: ''
  });

  const [menuItemFilter, setMenuItemFilter] = useState('all');

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [invRes, menuRes] = await Promise.all([
        api.inventory.getAll(),
        api.menu.getAll()
      ]);
      const invItems = (invRes?.data?.data?.items) ?? (invRes?.data?.items) ?? [];
      const mItems = (menuRes?.data?.data?.menuItems) ?? (menuRes?.data?.menuItems) ?? [];
      setItems(Array.isArray(invItems) ? invItems : []);
      setMenuItems(Array.isArray(mItems) ? mItems : []);
    } catch (e) {
      console.error('Failed to load inventory:', e);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const normalizedItems = useMemo(() => {
    const menuById = new Map(menuItems.map(m => [m.id, m]));
    const arr = Array.isArray(items) ? items : [];
    return arr.map((it) => {
      const ids = Array.isArray(it?.menu_item_ids) ? it.menu_item_ids : (it?.menu_item_id != null ? [it.menu_item_id] : []);
      const normalizedIds = Array.from(new Set(
        ids
          .map((v) => (v == null ? null : parseInt(v, 10)))
          .filter((v) => Number.isFinite(v))
      ));
      const linkedItems = normalizedIds.map((id) => menuById.get(id)).filter(Boolean);
      return {
        ...it,
        menu_item_ids: normalizedIds,
        menu_item_names: linkedItems.map((m) => m?.name).filter(Boolean),
        menu_item_name: linkedItems[0]?.name || null,
        menu_item_type: linkedItems[0]?.type || null,
        menu_item_category: linkedItems[0]?.category || null,
      };
    });
  }, [items, menuItems]);

  const filtered = useMemo(() => {
    const term = String(searchTerm || '').toLowerCase().trim();
    if (!term) return normalizedItems;
    return normalizedItems.filter((it) => {
      const name = String(it.name || '').toLowerCase();
      const menuNames = Array.isArray(it.menu_item_names) ? it.menu_item_names : (it.menu_item_name ? [it.menu_item_name] : []);
      const menuBlob = menuNames.map((s) => String(s || '').toLowerCase()).join(' ');
      return name.includes(term) || menuBlob.includes(term);
    });
  }, [normalizedItems, searchTerm]);

  const uniqueMenuTypes = useMemo(() => (['all', 'cafe', 'barista', 'restaurant']), []);

  const openAdd = () => {
    setFormData({
      name: '',
      menu_item_ids: [],
      unit: 'pcs',
      quantity: 0,
      min_quantity: 0,
    });
    setMenuItemFilter('all');
    setShowAddModal(true);
  };

  const openEdit = (item) => {
    setSelectedItem(item);
    const ids = Array.isArray(item?.menu_item_ids)
      ? item.menu_item_ids
      : (item?.menu_item_id != null ? [item.menu_item_id] : []);
    setFormData({
      name: item?.name || '',
      menu_item_ids: ids
        .map((v) => (v == null ? '' : String(v)))
        .filter((v) => v !== ''),
      unit: item?.unit || 'pcs',
      quantity: item?.quantity ?? 0,
      min_quantity: item?.min_quantity ?? 0,
    });
    setMenuItemFilter('all');
    setShowEditModal(true);
  };

  const openQty = (item) => {
    setSelectedItem(item);
    setQtyData({ mode: 'set', quantity: String(item?.quantity ?? ''), delta: '' });
    setShowQtyModal(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleMenuItemId = (id) => {
    const key = String(id);
    setFormData((prev) => {
      const curr = Array.isArray(prev.menu_item_ids) ? prev.menu_item_ids : [];
      const set = new Set(curr.map(String));
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, menu_item_ids: Array.from(set) };
    });
  };

  const submitAddOrEdit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: String(formData.name || '').trim(),
        unit: String(formData.unit || 'pcs').trim(),
        quantity: parseFloat(formData.quantity || 0),
        min_quantity: parseFloat(formData.min_quantity || 0),
        menu_item_ids: Array.isArray(formData.menu_item_ids)
          ? formData.menu_item_ids
              .map((v) => (v == null || v === '' ? null : parseInt(v, 10)))
              .filter((v) => Number.isFinite(v))
          : [],
      };

      if (!payload.name) {
        toast.error('Name is required');
        return;
      }

      if (showAddModal) {
        await api.inventory.create(payload);
        toast.success('Item added');
        setShowAddModal(false);
      } else if (showEditModal && selectedItem) {
        await api.inventory.update(selectedItem.id, payload);
        toast.success('Item updated');
        setShowEditModal(false);
      }

      await fetchAll();
    } catch (e) {
      console.error('Save inventory item failed:', e);
      const msg = e?.response?.data?.message || 'Failed to save inventory item';
      toast.error(msg);
    }
  };

  const submitQty = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;

    try {
      if (qtyData.mode === 'delta') {
        const d = parseFloat(qtyData.delta);
        if (!Number.isFinite(d)) {
          toast.error('Invalid delta');
          return;
        }
        await api.inventory.updateQuantity(selectedItem.id, { delta: d });
      } else {
        const q = parseFloat(qtyData.quantity);
        if (!Number.isFinite(q)) {
          toast.error('Invalid quantity');
          return;
        }
        await api.inventory.updateQuantity(selectedItem.id, { quantity: q });
      }

      toast.success('Quantity updated');
      setShowQtyModal(false);
      await fetchAll();
    } catch (e) {
      console.error('Update quantity failed:', e);
      toast.error('Failed to update quantity');
    }
  };

  const deleteItem = async (item) => {
    if (!item) return;
    if (!window.confirm('Are you sure you want to delete this inventory item?')) return;

    try {
      await api.inventory.delete(item.id);
      toast.success('Item deleted');
      await fetchAll();
    } catch (e) {
      console.error('Delete inventory item failed:', e);
      toast.error('Failed to delete item');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading inventory..." />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Storage (Inventory)</h1>
          <p className="text-gray-600 mt-1">Manage items and stock levels. Stock is reduced automatically when orders are placed.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchAll}
            className="btn-outline flex items-center space-x-2"
          >
            <FiRefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          <button
            onClick={openAdd}
            className="btn-primary flex items-center space-x-2"
          >
            <FiPlus className="w-4 h-4" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              className="input-field"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by inventory name or linked menu item..."
            />
          </div>
          <div className="text-sm text-gray-600 md:col-span-2">
            <div>Total items: {filtered.length}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header text-left py-3 px-4">Item</th>
                <th className="table-header text-left py-3 px-4">Linked Menu Items</th>
                <th className="table-header text-left py-3 px-4">Qty</th>
                <th className="table-header text-left py-3 px-4">Min</th>
                <th className="table-header text-left py-3 px-4">Unit</th>
                <th className="table-header text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const qty = parseFloat(it.quantity || 0);
                const min = parseFloat(it.min_quantity || 0);
                const low = Number.isFinite(min) && qty <= min;
                return (
                  <tr key={it.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="table-cell">
                      <div className="font-medium text-gray-900">{it.name}</div>
                      {low && (
                        <div className="text-xs text-red-600 mt-1">Low stock</div>
                      )}
                    </td>
                    <td className="table-cell text-gray-700">
                      {Array.isArray(it.menu_item_names) && it.menu_item_names.length > 0 ? (
                        <div>
                          <div className="font-medium">{it.menu_item_names.join(', ')}</div>
                          <div className="text-xs text-gray-500">{it.menu_item_type} • {it.menu_item_category}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Not linked</span>
                      )}
                    </td>
                    <td className="table-cell font-semibold">{qty}</td>
                    <td className="table-cell">{min}</td>
                    <td className="table-cell">{it.unit || 'pcs'}</td>
                    <td className="table-cell">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => openQty(it)}
                          className="btn-outline text-xs py-1 px-2"
                        >
                          Update Quantity
                        </button>
                        <button
                          onClick={() => openEdit(it)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Item"
                        >
                          <FiEdit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteItem(it)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Item"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center py-10 text-gray-500">No inventory items found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {showAddModal ? 'Add Item' : 'Edit Item'}
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

            <form onSubmit={submitAddOrEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  className="input-field"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-700">Link to Menu Items (optional)</label>
                  <select
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500 py-1 px-2"
                    value={menuItemFilter}
                    onChange={(e) => setMenuItemFilter(e.target.value)}
                  >
                    {uniqueMenuTypes.map(type => (
                      <option key={type} value={type}>
                        {type === 'all'
                          ? 'All Units'
                          : (type.charAt(0).toUpperCase() + type.slice(1))}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="border border-gray-300 rounded-md p-2 max-h-40 overflow-y-auto">
                  {menuItems
                    .filter((mi) => {
                      if (menuItemFilter === 'all') return true;
                      if (menuItemFilter === 'cafe') return mi.type === 'cafe' || mi.type === 'bakery';
                      return mi.type === menuItemFilter;
                    })
                    .map((mi) => {
                      const id = String(mi.id);
                      const checked = Array.isArray(formData.menu_item_ids) && formData.menu_item_ids.map(String).includes(id);
                      return (
                        <label key={mi.id} className="flex items-center gap-2 py-1 text-sm text-gray-800 cursor-pointer select-none hover:bg-gray-50 rounded px-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMenuItemId(id)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span>{mi.name} {mi.category ? <span className="text-gray-500 text-xs">({mi.category})</span> : ''} <span className="text-gray-400 text-xs">#{mi.id}</span></span>
                        </label>
                      );
                  })}

                  {menuItems.filter((mi) => {
                    if (menuItemFilter === 'all') return true;
                    if (menuItemFilter === 'cafe') return mi.type === 'cafe' || mi.type === 'bakery';
                    return mi.type === menuItemFilter;
                  }).length === 0 && (
                    <div className="text-sm text-gray-500 py-2 text-center">
                      No menu items found {menuItemFilter !== 'all' ? `for ${menuItemFilter}` : ''}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Linking enables automatic stock deduction when that menu item is ordered.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    className="input-field"
                    name="quantity"
                    type="number"
                    step="0.01"
                    value={formData.quantity}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Quantity</label>
                  <input
                    className="input-field"
                    name="min_quantity"
                    type="number"
                    step="0.01"
                    value={formData.min_quantity}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <input
                  className="input-field"
                  name="unit"
                  value={formData.unit}
                  onChange={handleChange}
                  placeholder="pcs, kg, liters, ..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
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
                <button type="submit" className="btn-primary">
                  {showAddModal ? 'Create' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQtyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Update Quantity</h3>
              <button
                onClick={() => setShowQtyModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>

            <form onSubmit={submitQty} className="space-y-4">
              <div className="text-sm text-gray-600">
                Item: <span className="font-medium text-gray-900">{selectedItem?.name}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="mode"
                      value="set"
                      checked={qtyData.mode === 'set'}
                      onChange={() => setQtyData(prev => ({ ...prev, mode: 'set' }))}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">Set exact</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="mode"
                      value="delta"
                      checked={qtyData.mode === 'delta'}
                      onChange={() => setQtyData(prev => ({ ...prev, mode: 'delta' }))}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">Add/Subtract</span>
                  </label>
                </div>
              </div>

              {qtyData.mode === 'delta' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delta</label>
                  <input
                    className="input-field"
                    type="number"
                    step="0.01"
                    value={qtyData.delta}
                    onChange={(e) => setQtyData(prev => ({ ...prev, delta: e.target.value }))}
                    placeholder="e.g. 5 or -2"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    className="input-field"
                    type="number"
                    step="0.01"
                    value={qtyData.quantity}
                    onChange={(e) => setQtyData(prev => ({ ...prev, quantity: e.target.value }))}
                  />
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setShowQtyModal(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Update</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryManagement;
