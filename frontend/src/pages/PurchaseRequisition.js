import React, { useEffect, useState, useCallback, useRef } from 'react';
import api from '../services/api';
import inventoryApi from '../services/inventoryApi';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import UomFields from '../components/inventory/UomFields';
import {
  FiPlus, FiRefreshCw, FiX, FiCheck, FiCheckCircle,
  FiXCircle, FiClock, FiChevronDown, FiChevronUp,
  FiFileText, FiAlertTriangle, FiEdit2
} from 'react-icons/fi';

// No longer using hardcoded zones - will fetch real stores from inventory

const STATUS_META = {
  pending_fnb:        { label: 'Pending F&B Review',         color: 'bg-yellow-900 text-yellow-300 border border-yellow-700' },
  approved:           { label: 'Approved for PO',            color: 'bg-green-900 text-green-300 border border-green-700' },
  adjusted_approved:  { label: 'Adjusted & Approved',        color: 'bg-blue-900 text-blue-300 border border-blue-700' },
  rejected:           { label: 'Rejected',                   color: 'bg-red-900 text-red-300 border border-red-700' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, color: 'bg-gray-800 text-gray-300 border border-gray-600' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${meta.color}`}>{meta.label}</span>;
}

function fmt(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function PurchaseRequisition() {
  const { user } = useAuth();
  const role = user?.role;
  const isStoreAdmin = role === 'store_admin' || role === 'admin';
  const isFnb        = role === 'fnb_manager' || role === 'admin';
  const isOwner      = role === 'owner';

  const [requisitions, setRequisitions] = useState([]);
  const [stores, setStores]             = useState([]);
  const [loading, setLoading]           = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStore, setFilterStore]   = useState('all');
  const [expandedId, setExpandedId]     = useState(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [actionModal, setActionModal]   = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    inventoryApi.stores.list()
      .then((r) => setStores((r.data.data.stores || []).filter(s => s.is_active !== false)))
      .catch(() => {});
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterStore   !== 'all') params.store_id = filterStore;
      // Pass user info for role-scoped filtering
      if (user?.id) params.user_id = user.id;
      if (user?.role) params.user_role = user.role;
      const res = await api.purchaseRequisitions.getAll(params);
      const data = res?.data?.data?.requisitions ?? res?.data?.requisitions ?? [];
      setRequisitions(Array.isArray(data) ? data : []);
    } catch { toast.error('Failed to load requisitions'); }
    finally  { setLoading(false); }
  }, [filterStatus, filterStore, user]);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, 30000);
    return () => clearInterval(pollRef.current);
  }, [fetchAll]);

  const pending   = requisitions.filter(r => r.status === 'pending_fnb').length;
  const approved  = requisitions.filter(r => ['approved','adjusted_approved'].includes(r.status)).length;
  const rejected  = requisitions.filter(r => r.status === 'rejected').length;
  const totalCost = requisitions
    .filter(r => ['approved','adjusted_approved'].includes(r.status))
    .reduce((s, r) => s + (( r.approved_quantity ?? r.quantity) * r.unit_cost), 0);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-amber-400 flex items-center gap-2">
            <FiFileText className="w-6 h-6" /> Purchase Requisitions
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {isOwner ? 'Read-only overview — auto-refreshes every 30s' : isFnb ? 'Review & approve pending requisitions' : 'Create and track purchase requisitions'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 text-gray-300">
            <FiRefreshCw className="w-4 h-4" /> Refresh
          </button>
          {isStoreAdmin && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-gray-950 text-sm font-semibold rounded-lg hover:bg-amber-400">
              <FiPlus className="w-4 h-4" /> New Requisition
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',    value: requisitions.length, color: 'border-gray-600 bg-gray-800' },
          { label: 'Pending',  value: pending,             color: 'border-yellow-700 bg-yellow-950' },
          { label: 'Approved', value: approved,            color: 'border-green-700 bg-green-950' },
          { label: 'Approved Cost', value: `ETB ${fmt(totalCost)}`, color: 'border-amber-700 bg-amber-950' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 border ${s.color}`}>
            <p className="text-xl font-bold text-gray-100">{s.value}</p>
            <p className="text-xs text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Pending alert for F&B */}
      {isFnb && pending > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-yellow-950 border border-yellow-700 rounded-xl text-yellow-300 text-sm">
          <FiAlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span><span className="font-bold">{pending}</span> requisition{pending > 1 ? 's' : ''} awaiting your review</span>
        </div>
      )}

      {/* Approved alert for Purchaser */}
      {role === 'purchaser' && approved > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-950 border border-green-700 rounded-xl text-green-300 text-sm">
          <FiCheckCircle className="w-5 h-5 flex-shrink-0" />
          <span><span className="font-bold">{approved}</span> requisition{approved > 1 ? 's' : ''} approved and ready for Purchase Orders</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="all">All Statuses</option>
          <option value="pending_fnb">Pending F&B Review</option>
          <option value="approved">Approved for PO</option>
          <option value="adjusted_approved">Adjusted & Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="all">All Stores</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.icon ? `${s.icon} ` : ''}{s.name}</option>)}
        </select>
        <span className="text-xs text-gray-500 ml-auto">{requisitions.length} record{requisitions.length !== 1 ? 's' : ''}</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">
          <FiRefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : requisitions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-600">
          <FiFileText className="w-10 h-10 mb-2" />
          <p>No requisitions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requisitions.map(pr => (
            <PRCard
              key={pr.id}
              pr={pr}
              stores={stores}
              expanded={expandedId === pr.id}
              onToggle={() => setExpandedId(expandedId === pr.id ? null : pr.id)}
              isStoreAdmin={isStoreAdmin}
              isFnb={isFnb}
              isOwner={isOwner}
              onAction={setActionModal}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreatePRModal
          user={user}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchAll(); }}
        />
      )}

      {/* Action Modal (approve / adjust / reject) */}
      {actionModal && (
        <ActionModal
          pr={actionModal.pr}
          type={actionModal.type}
          user={user}
          onClose={() => setActionModal(null)}
          onDone={() => { setActionModal(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

function PRCard({ pr, stores = [], expanded, onToggle, isStoreAdmin, isFnb, isOwner, onAction }) {
  const canApprove = isFnb && pr.status === 'pending_fnb';
  const canReject  = isFnb && pr.status === 'pending_fnb';
  const store = stores.find(s => String(s.id) === String(pr.store_id));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <span className="font-mono text-xs text-amber-600 flex-shrink-0">{pr.req_number}</span>
          <span className="text-sm font-semibold text-gray-100 truncate">{pr.item_name}</span>
          <span className="text-xs text-gray-500 flex-shrink-0">{store?.icon || '🏪'} {store?.name || pr.store_name || 'Unknown Store'}</span>
          <StatusBadge status={pr.status} />
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0 ml-3">
          <span className="hidden sm:block">{pr.created_by_name}</span>
          <span className="text-amber-500 font-semibold">ETB {fmt(pr.estimated_cost)}</span>
          {expanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-800 px-5 py-4 space-y-4">
          {/* Details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Store',      value: `${store?.icon || '🏪'} ${store?.name || pr.store_name || 'Unknown'}` },
              { label: 'Item Code',  value: pr.item_code || '—' },
              { label: 'Supplier',   value: pr.supplier || '—' },
              { label: 'Created By', value: pr.created_by_name || '—' },
              { label: 'Qty Requested', value: `${pr.quantity}` },
              { label: 'Unit Cost',  value: `ETB ${fmt(pr.unit_cost)}` },
              { label: 'Est. Cost',  value: `ETB ${fmt(pr.estimated_cost)}` },
              { label: 'Approved Qty', value: pr.approved_quantity != null ? pr.approved_quantity : '—' },
            ].map(d => (
              <div key={d.label} className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{d.label}</p>
                <p className="font-semibold text-gray-100">{d.value}</p>
              </div>
            ))}
          </div>

          {pr.notes && (
            <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-400">
              <span className="font-semibold text-gray-300">Notes: </span>{pr.notes}
            </div>
          )}

          {/* Approval info */}
          {(pr.approved_by_name || pr.rejected_by_name) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {pr.approved_by_name && (
                <div className="bg-green-950 border border-green-800 rounded-lg p-3">
                  <p className="text-xs text-green-400 font-semibold mb-1">Approved by</p>
                  <p className="text-green-300 font-medium">{pr.approved_by_name}</p>
                  <p className="text-xs text-gray-500">{pr.approved_at ? new Date(pr.approved_at).toLocaleString() : ''}</p>
                </div>
              )}
              {pr.rejected_by_name && (
                <div className="bg-red-950 border border-red-800 rounded-lg p-3">
                  <p className="text-xs text-red-400 font-semibold mb-1">Rejected by</p>
                  <p className="text-red-300 font-medium">{pr.rejected_by_name}</p>
                  <p className="text-xs text-gray-500">{pr.rejected_at ? new Date(pr.rejected_at).toLocaleString() : ''}</p>
                  {pr.rejection_note && <p className="text-xs text-red-400 mt-1 italic">"{pr.rejection_note}"</p>}
                </div>
              )}
            </div>
          )}

          {/* Audit log */}
          {Array.isArray(pr.audit_log) && pr.audit_log.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-400 mb-2 uppercase tracking-wide">Audit Trail</p>
              <div className="space-y-1">
                {pr.audit_log.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-gray-400">
                    <FiClock className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-600" />
                    <span className="text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                    <span className="text-amber-500 font-medium capitalize">{log.action.replace('_', ' ')}</span>
                    <span>by {log.actor_name}</span>
                    {log.note && <span className="text-gray-500 italic">— {log.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons — F&B Manager only */}
          {!isOwner && (canApprove || canReject) && (
            <div className="flex gap-3 flex-wrap">
              {canApprove && (
                <>
                  <button
                    onClick={() => onAction({ pr, type: 'approve' })}
                    className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-600"
                  >
                    <FiCheckCircle className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => onAction({ pr, type: 'adjust' })}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm rounded-lg hover:bg-blue-600"
                  >
                    <FiEdit2 className="w-4 h-4" /> Adjust & Approve
                  </button>
                </>
              )}
              {canReject && (
                <button
                  onClick={() => onAction({ pr, type: 'reject' })}
                  className="flex items-center gap-2 px-4 py-2 bg-red-800 text-white text-sm rounded-lg hover:bg-red-700"
                >
                  <FiXCircle className="w-4 h-4" /> Reject
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreatePRModal({ user, onClose, onCreated }) {
  const [masterItems, setMasterItems] = useState([]);
  const [storesList, setStoresList] = useState([]);
  const [purchasers, setPurchasers] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [form, setForm] = useState({
    store_id: '', purchaser_id: '', item_id: '', item_mode: 'existing', item_name: '', item_code: '', supplier: '',
    quantity: '', unit_cost: '', category: '', sub_category: '', item_type: '', uom: 'pcs',
    uom_attributes: {}, specifications: '', storage_requirements: '', is_perishable: false,
    track_batches: false, notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    inventoryApi.items.list({ limit: 1000 }).then((r) => setMasterItems(r.data.data.items || [])).catch(() => {});
    inventoryApi.stores.list().then((r) => setStoresList((r.data.data.stores || []).filter(s => s.is_active !== false))).catch(() => {});
    inventoryApi.uoms.list().then((r) => setUoms(r.data.data.uoms || [])).catch(() => {});
    // Fetch purchasers (users with purchasing role)
    api.users.getAll({ role: 'purchasing' }).then((r) => setPurchasers(r.data.users || r.data.data.users || [])).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const pickItem = (val) => {
    if (val === '__new__') {
      set('item_mode', 'new');
      set('item_id', '');
      set('item_name', '');
      return;
    }
    if (val === '') {
      set('item_mode', 'existing');
      set('item_id', '');
      set('item_name', '');
      return;
    }
    const m = masterItems.find((x) => String(x.id) === String(val));
    set('item_mode', 'existing');
    set('item_id', val);
    set('item_name', m?.description || '');
    set('item_code', m?.item_code || '');
    set('category', m?.category || '');
    set('uom', m?.uom || 'pcs');
    set('uom_attributes', m?.uom_attributes || {});
    set('is_perishable', !!m?.is_perishable);
    set('track_batches', !!m?.track_batches);
  };

  const qty    = parseFloat(form.quantity)   || 0;
  const cost   = parseFloat(form.unit_cost)  || 0;
  const estCost = qty * cost;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.store_id || !form.item_name.trim() || !form.quantity || !form.unit_cost) {
      toast.error('Store, item, quantity and unit cost are required'); return;
    }
    setSaving(true);
    try {
      await api.purchaseRequisitions.create({
        store_id: form.store_id,
        purchaser_id: form.purchaser_id || undefined,
        item_id: form.item_mode === 'existing' ? form.item_id : undefined,
        is_new_item: form.item_mode === 'new',
        item_name: form.item_name,
        item_code: form.item_code,
        category: form.category || undefined,
        sub_category: form.sub_category || undefined,
        item_type: form.item_type || undefined,
        uom: form.uom,
        uom_attributes: form.uom_attributes,
        is_perishable: form.is_perishable,
        track_batches: form.track_batches,
        specifications: form.specifications || undefined,
        storage_requirements: form.storage_requirements || undefined,
        supplier: form.supplier,
        quantity:   qty,
        unit_cost:  cost,
        notes: form.notes,
        created_by_id:   user?.id,
        created_by_name: user?.full_name || user?.name || user?.username,
      });
      toast.success('Requisition submitted to purchaser');
      onCreated();
    } catch { toast.error('Failed to submit'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-800 flex-shrink-0">
          <h3 className="font-bold text-lg text-amber-400">New Purchase Requisition</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><FiX className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto flex-1">

            {/* Store */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Destination Store *</label>
              <select required value={form.store_id} onChange={e => set('store_id', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">Select store…</option>
                {storesList.map(s => <option key={s.id} value={s.id}>{s.icon ? `${s.icon} ` : ''}{s.name}</option>)}
              </select>
            </div>

            {/* Purchaser */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Assign to Purchaser</label>
              <select value={form.purchaser_id} onChange={e => set('purchaser_id', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">Auto-assign…</option>
                {purchasers.map(p => <option key={p.id} value={p.id}>{p.full_name || p.username}</option>)}
              </select>
            </div>

            {/* Item selection: existing or new */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Inventory Item *</label>
              <select required value={form.item_mode === 'new' ? '__new__' : form.item_id}
                onChange={e => pickItem(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">Select item…</option>
                <option value="__new__">➕ New item…</option>
                {masterItems.map(m => <option key={m.id} value={m.id}>{m.description} ({m.uom})</option>)}
              </select>
            </div>

            {/* New item form */}
            {form.item_mode === 'new' && (
              <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 space-y-3">
                <div className="text-xs font-semibold text-amber-400">New item details (added to inventory master)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Description *</label>
                    <input required value={form.item_name} onChange={e => set('item_name', e.target.value)}
                      placeholder="e.g. Flour 50kg"
                      className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Item Code</label>
                    <input value={form.item_code} onChange={e => set('item_code', e.target.value)}
                      placeholder="auto if blank"
                      className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Category</label>
                    <input value={form.category} onChange={e => set('category', e.target.value)}
                      placeholder="e.g. Grains"
                      className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Sub-category</label>
                    <input value={form.sub_category} onChange={e => set('sub_category', e.target.value)}
                      placeholder="e.g. Wheat"
                      className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Unit of Measure *</label>
                    <select required value={form.uom} onChange={e => set('uom', e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                      {uoms.map(u => <option key={u.code} value={u.code}>{u.name} ({u.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Item Type</label>
                    <input value={form.item_type} onChange={e => set('item_type', e.target.value)}
                      placeholder="e.g. Bulk"
                      className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                </div>
                <div className="bg-amber-800/40 rounded-lg p-3">
                  <div className="text-xs font-semibold text-gray-400 mb-2">📐 {uoms.find(u => u.code === form.uom)?.name || form.uom} details</div>
                  <UomFields uom={form.uom} value={form.uom_attributes} uoms={uoms} onChange={(next) => set('uom_attributes', next)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Specifications</label>
                    <input value={form.specifications} onChange={e => set('specifications', e.target.value)}
                      placeholder="e.g. Organic, gluten-free"
                      className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Storage Requirements</label>
                    <input value={form.storage_requirements} onChange={e => set('storage_requirements', e.target.value)}
                      placeholder="e.g. Cool & dry"
                      className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 text-gray-300">
                    <input type="checkbox" checked={form.is_perishable} onChange={e => set('is_perishable', e.target.checked)} className="w-4 h-4" />
                    Perishable
                  </label>
                  <label className="flex items-center gap-2 text-gray-300">
                    <input type="checkbox" checked={form.track_batches} onChange={e => set('track_batches', e.target.checked)} className="w-4 h-4" />
                    Track batches
                  </label>
                </div>
              </div>
            )}

            {/* Existing item: show loaded info */}
            {form.item_mode === 'existing' && form.item_id && (
              <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400">
                Loaded: <b className="text-gray-200">{form.item_name}</b> · {form.uom} · {form.category || 'no category'}
                {form.uom_attributes && Object.keys(form.uom_attributes).length ? ` · ${Object.entries(form.uom_attributes).map(([k, v]) => `${k}:${v}`).join(', ')}` : ''}
              </div>
            )}

            {/* Supplier */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Supplier</label>
              <input value={form.supplier} onChange={e => set('supplier', e.target.value)}
                placeholder="Supplier name (optional)"
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>

            {/* Quantity + Unit Cost */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Quantity *</label>
                <input required type="number" min="0.01" step="0.01" value={form.quantity}
                  onChange={e => set('quantity', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Unit Cost (ETB) *</label>
                <input required type="number" min="0" step="0.01" value={form.unit_cost}
                  onChange={e => set('unit_cost', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>

            {/* Live estimated cost */}
            {qty > 0 && cost > 0 && (
              <div className="bg-amber-950 border border-amber-800 rounded-lg px-4 py-3 text-sm">
                <span className="text-amber-400 font-semibold">Estimated Cost: </span>
                <span className="text-amber-200 font-bold text-lg">ETB {fmt(estCost)}</span>
                <span className="text-amber-600 ml-2 text-xs">({qty} × ETB {fmt(cost)})</span>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                placeholder="Additional notes…"
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
            </div>
          </div>

          <div className="flex gap-3 p-5 border-t border-gray-800 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-gray-950 font-semibold rounded-lg text-sm hover:bg-amber-400 disabled:opacity-50">
              <FiCheck className="w-4 h-4" /> {saving ? 'Submitting…' : 'Submit Requisition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActionModal({ pr, type, user, onClose, onDone }) {
  const [adjustedQty, setAdjustedQty] = useState(pr.quantity);
  const [note, setNote]               = useState('');
  const [saving, setSaving]           = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const actor = { approver_id: user?.id, approver_name: user?.full_name || user?.name || user?.username };
      if (type === 'approve') {
        await api.purchaseRequisitions.approve(pr.id, actor);
        toast.success('Requisition approved');
      } else if (type === 'adjust') {
        if (!adjustedQty || parseFloat(adjustedQty) <= 0) { toast.error('Enter a valid quantity'); setSaving(false); return; }
        await api.purchaseRequisitions.adjustApprove(pr.id, { ...actor, adjusted_quantity: parseFloat(adjustedQty), note });
        toast.success('Requisition adjusted & approved');
      } else if (type === 'reject') {
        if (!note.trim()) { toast.error('Rejection note is required'); setSaving(false); return; }
        await api.purchaseRequisitions.reject(pr.id, { rejector_id: user?.id, rejector_name: user?.full_name || user?.name || user?.username, note });
        toast.success('Requisition rejected');
      }
      onDone();
    } catch { toast.error('Action failed'); setSaving(false); }
  };

  const titles = { approve: 'Approve Requisition', adjust: 'Adjust & Approve', reject: 'Reject Requisition' };
  const btnColors = { approve: 'bg-green-700 hover:bg-green-600', adjust: 'bg-blue-700 hover:bg-blue-600', reject: 'bg-red-800 hover:bg-red-700' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="font-bold text-amber-400">{titles[type]}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><FiX className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            <div className="bg-gray-800 rounded-lg p-3 text-sm space-y-1">
              <p className="text-amber-400 font-mono">{pr.req_number}</p>
              <p className="text-gray-100 font-semibold">{pr.item_name}</p>
              <p className="text-gray-400">🏪 {pr.store_name || 'Unknown'} · Qty: {pr.quantity} · ETB {fmt(pr.estimated_cost)}</p>
            </div>

            {type === 'adjust' && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Adjusted Quantity *</label>
                <input type="number" min="0.01" step="0.01" required
                  value={adjustedQty} onChange={e => setAdjustedQty(e.target.value)}
                  className="w-full bg-gray-800 border-2 border-amber-600 text-amber-200 font-bold rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                {adjustedQty > 0 && (
                  <p className="text-xs text-amber-500 mt-1">New cost: ETB {fmt(parseFloat(adjustedQty) * pr.unit_cost)}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                {type === 'reject' ? 'Rejection Note (required)' : 'Note (optional)'}
              </label>
              <textarea
                value={note} onChange={e => setNote(e.target.value)}
                required={type === 'reject'} rows={3}
                placeholder={type === 'reject' ? 'Reason for rejection…' : 'Optional note…'}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
            </div>
          </div>

          <div className="flex gap-3 p-5 border-t border-gray-800">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-semibold ${btnColors[type]} disabled:opacity-50`}>
              {type === 'approve' && <FiCheckCircle className="w-4 h-4" />}
              {type === 'adjust'  && <FiEdit2 className="w-4 h-4" />}
              {type === 'reject'  && <FiXCircle className="w-4 h-4" />}
              {saving ? 'Processing…' : titles[type]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
