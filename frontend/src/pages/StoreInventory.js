import React, { useEffect, useState, useCallback } from 'react';
import inventoryApi from '../services/inventoryApi';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  FiPlus, FiEdit3, FiTrash2, FiRefreshCw, FiPackage,
  FiAlertCircle, FiSearch, FiX, FiSave, FiMinus, FiPlusCircle
} from 'react-icons/fi';

const UOM_OPTIONS = ['pcs', 'kg', 'g', 'l', 'ml', 'boxes', 'bottles', 'bags', 'cans', 'packs', 'rolls', 'sheets'];
const EMPTY_FORM = { item_number: '', description: '', uom: 'pcs', quantity: '', min_quantity: '' };
// Soft colour palette cycled across however many stores exist.
const PALETTE = [
  'bg-yellow-50 border-yellow-300 text-yellow-800',
  'bg-red-50 border-red-300 text-red-800',
  'bg-pink-50 border-pink-300 text-pink-800',
  'bg-orange-50 border-orange-300 text-orange-800',
  'bg-blue-50 border-blue-300 text-blue-800',
  'bg-green-50 border-green-300 text-green-800',
  'bg-purple-50 border-purple-300 text-purple-800',
  'bg-teal-50 border-teal-300 text-teal-800',
];

export default function StoreInventory() {
  const { user } = useAuth();
  const [stores, setStores]             = useState([]);
  const [activeStore, setActiveStore]   = useState(null); // numeric PG store id
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [search, setSearch]             = useState('');
  const [showModal, setShowModal]       = useState(false);
  const [editItem, setEditItem]         = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [showQtyModal, setShowQtyModal] = useState(false);
  const [qtyTarget, setQtyTarget]       = useState(null);
  const [qtyMode, setQtyMode]           = useState('add');
  const [qtyValue, setQtyValue]         = useState('');

  const canEdit = ['admin', 'store_admin', 'store_manager', 'fnb_manager'].includes(user?.role);

  // Load the real PostgreSQL stores (same source as the inventory module).
  useEffect(() => {
    inventoryApi.stores.list()
      .then((r) => {
        const list = (r.data.data.stores || []).filter((s) => s.is_active !== false);
        setStores(list);
        // Default to the user's pinned store if they have one, else the first.
        const pinned = user?.store_id ? list.find((s) => Number(s.id) === Number(user.store_id)) : null;
        setActiveStore((prev) => prev ?? (pinned ? pinned.id : (list[0]?.id ?? null)));
      })
      .catch(() => toast.error('Failed to load stores'));
  }, [user]);

  const fetchItems = useCallback(async () => {
    if (!activeStore) return;
    setLoading(true);
    try {
      const res = await inventoryApi.balances({ store_id: activeStore });
      const data = res?.data?.data?.balances ?? [];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [activeStore]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      item_number: item.item_code || '',
      description: item.description || '',
      uom: item.uom || 'pcs',
      quantity: Number(item.quantity) || 0,
      min_quantity: Number(item.min_quantity) || 0,
    });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditItem(null); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) { toast.error('Description is required'); return; }
    setSaving(true);
    try {
      const minQ = parseFloat(form.min_quantity) || 0;
      const qty = parseFloat(form.quantity) || 0;
      if (editItem) {
        await inventoryApi.items.update(editItem.item_id, {
          description: form.description, uom: form.uom,
          default_min_qty: minQ, default_reorder: minQ,
        });
        // Honour an edited quantity by posting an adjustment to this store.
        if (Number(qty) !== Number(editItem.quantity)) {
          await inventoryApi.adjust({ store_id: activeStore, item_id: editItem.item_id, new_quantity: qty, reason: 'Manual edit' });
        }
        toast.success('Item updated');
      } else {
        const res = await inventoryApi.items.create({
          item_code: form.item_number || undefined,
          description: form.description, uom: form.uom,
          default_min_qty: minQ, default_reorder: minQ,
        });
        const newId = res.data.data.item.id;
        if (qty > 0) {
          await inventoryApi.adjust({ store_id: activeStore, item_id: newId, new_quantity: qty, reason: 'Initial stock' });
        }
        toast.success('Item added');
      }
      closeModal();
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Remove "${item.description}" from the catalog?`)) return;
    try {
      await inventoryApi.items.remove(item.item_id);
      toast.success('Item removed');
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove item');
    }
  };

  const openQty = (item) => { setQtyTarget(item); setQtyMode('add'); setQtyValue(''); setShowQtyModal(true); };
  const handleQtySubmit = async (e) => {
    e.preventDefault();
    const val = parseFloat(qtyValue);
    if (isNaN(val) || val <= 0) { toast.error('Enter a valid positive number'); return; }
    try {
      await inventoryApi.adjust({
        store_id: activeStore, item_id: qtyTarget.item_id,
        delta: qtyMode === 'add' ? val : -val,
        reason: qtyMode === 'add' ? 'Stock in' : 'Stock out',
      });
      toast.success('Quantity updated');
      setShowQtyModal(false);
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update quantity');
    }
  };

  const storeInfo = stores.find((s) => Number(s.id) === Number(activeStore));
  const colorFor = (id) => PALETTE[stores.findIndex((s) => Number(s.id) === Number(id)) % PALETTE.length] || PALETTE[0];
  const filtered = items.filter((i) =>
    (i.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.item_code || '').toLowerCase().includes(search.toLowerCase())
  );
  const lowStock = items.filter((i) => Number(i.quantity) <= Number(i.min_quantity) && Number(i.min_quantity) > 0).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">Manage stock across all {stores.length} stores</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchItems} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            <FiRefreshCw className="w-4 h-4" /> Refresh
          </button>
          {canEdit && (
            <button onClick={openAdd} disabled={!activeStore} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50">
              <FiPlus className="w-4 h-4" /> Add Item
            </button>
          )}
        </div>
      </div>

      {/* Store Tabs */}
      <div className="flex gap-2 flex-wrap">
        {stores.map((s) => (
          <button
            key={s.id}
            onClick={() => { setActiveStore(s.id); setSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              Number(activeStore) === Number(s.id)
                ? 'bg-teal-600 text-white border-teal-600 shadow-md'
                : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300'
            }`}
          >
            <span>{s.icon || '🏬'}</span> {s.name}
          </button>
        ))}
      </div>

      {/* Store Banner */}
      {storeInfo && (
        <div className={`rounded-xl border-2 p-4 flex items-center gap-3 ${colorFor(storeInfo.id)}`}>
          <span className="text-3xl">{storeInfo.icon || '🏬'}</span>
          <div>
            <h2 className="font-bold text-lg">{storeInfo.name}</h2>
            <p className="text-sm opacity-75">{items.length} items&nbsp;·&nbsp;
              {lowStock > 0 ? <span className="font-semibold text-red-600">{lowStock} low stock</span> : <span>All stock levels OK</span>}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><FiX className="w-4 h-4" /></button>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <FiRefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <FiPackage className="w-10 h-10 mb-2" />
            <p>{search ? 'No items match your search' : 'No items in this store yet'}</p>
            {canEdit && !search && <button onClick={openAdd} className="mt-3 text-teal-600 text-sm underline">Add the first item</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Item No.', 'Description', 'UOM', 'Quantity', 'Min Qty', 'Status', canEdit ? 'Actions' : ''].filter(Boolean).map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => {
                  const isLow = Number(item.quantity) <= Number(item.min_quantity) && Number(item.min_quantity) > 0;
                  return (
                    <tr key={item.item_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.item_code}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{item.description}</td>
                      <td className="px-4 py-3 text-gray-600">{item.uom}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{Number(item.quantity)}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{Number(item.min_quantity)}</td>
                      <td className="px-4 py-3">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                            <FiAlertCircle className="w-3 h-3" /> Low
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">OK</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openQty(item)} title="Adjust Qty" className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg">
                              <FiPlusCircle className="w-4 h-4" />
                            </button>
                            <button onClick={() => openEdit(item)} title="Edit" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                              <FiEdit3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(item)} title="Remove" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && storeInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">{editItem ? 'Edit Item' : 'Add Item'} — {storeInfo.name}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><FiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Item Code (auto-generated if blank)</label>
                <input value={form.item_number} disabled={!!editItem} onChange={(e) => setForm((f) => ({ ...f, item_number: e.target.value }))}
                  placeholder="e.g. DRY-0001"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Description *</label>
                <input required value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. All-purpose flour"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">UOM</label>
                  <select value={form.uom} onChange={(e) => setForm((f) => ({ ...f, uom: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                    {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Quantity</label>
                  <input type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Minimum Quantity (low-stock alert)</label>
                <input type="number" min="0" step="0.01" value={form.min_quantity} onChange={(e) => setForm((f) => ({ ...f, min_quantity: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50">
                  <FiSave className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quantity Adjustment Modal */}
      {showQtyModal && qtyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Adjust Quantity</h3>
              <button onClick={() => setShowQtyModal(false)} className="text-gray-400 hover:text-gray-600"><FiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleQtySubmit} className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">{qtyTarget.description}</span> — Current: <span className="font-bold text-teal-700">{Number(qtyTarget.quantity)} {qtyTarget.uom}</span>
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setQtyMode('add')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border ${qtyMode === 'add' ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600'}`}>
                  <FiPlusCircle className="w-4 h-4" /> Add
                </button>
                <button type="button" onClick={() => setQtyMode('remove')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border ${qtyMode === 'remove' ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600'}`}>
                  <FiMinus className="w-4 h-4" /> Remove
                </button>
              </div>
              <input autoFocus type="number" min="0.01" step="0.01" value={qtyValue} onChange={(e) => setQtyValue(e.target.value)}
                placeholder={`Amount to ${qtyMode}…`}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowQtyModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" className={`flex-1 px-4 py-2 text-white rounded-lg text-sm font-medium ${qtyMode === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
