import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  FiPlus, FiRefreshCw, FiX, FiSend, FiCheck, FiCheckCircle,
  FiXCircle, FiClock, FiChevronDown, FiChevronUp, FiTrash2, FiEye
} from 'react-icons/fi';

const STORES = [
  { id: 'dry_goods', name: 'Dry/Goods Store',  icon: '📦' },
  { id: 'bar',       name: 'Bar Store',         icon: '🍷' },
  { id: 'pastry',    name: 'Pastry/Cake Store', icon: '🎂' },
  { id: 'kitchen',   name: 'Kitchen Store',      icon: '🍳' },
  { id: 'barman',    name: 'Barman Store',        icon: '🍸' },
];
const UOM_OPTIONS = ['pcs', 'kg', 'g', 'liters', 'ml', 'boxes', 'bottles', 'bags', 'cans', 'packs', 'rolls', 'sheets'];
const EMPTY_LINE  = { item_number: '', description: '', uom: 'pcs', quantity_requested: '', quantity_approved: '' };

const STATUS_META = {
  pending:        { label: 'Pending',         color: 'bg-yellow-100 text-yellow-700',  icon: FiClock },
  store_approved: { label: 'Store Approved',  color: 'bg-blue-100 text-blue-700',      icon: FiCheck },
  fully_approved: { label: 'Fully Approved',  color: 'bg-green-100 text-green-700',    icon: FiCheckCircle },
  rejected:       { label: 'Rejected',        color: 'bg-red-100 text-red-700',        icon: FiXCircle },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, color: 'bg-gray-100 text-gray-600', icon: FiClock };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${meta.color}`}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
}

export default function ItemRequests() {
  const { user } = useAuth();
  const [requests, setRequests]           = useState([]);
  const [loading, setLoading]             = useState(false);
  const [filterStatus, setFilterStatus]   = useState('all');
  const [showForm, setShowForm]           = useState(false);
  const [expandedId, setExpandedId]       = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(null);
  const [rejectModal, setRejectModal]     = useState(null);
  const [rejectReason, setRejectReason]   = useState('');

  const isStoreAdmin = user?.role === 'store_admin' || user?.role === 'admin';
  const isFnbManager = user?.role === 'fnb_manager' || user?.role === 'admin';

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const res = await api.itemRequests.getAll(params);
      const data = res?.data?.data?.requests ?? res?.data?.requests ?? [];
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleStoreApprove = async (req, approvedLines) => {
    try {
      await api.itemRequests.storeApprove(req.id, {
        approver_id:   user.id,
        approver_name: user.full_name || user.name,
        lines: approvedLines,
      });
      toast.success('Request approved (Step 1)');
      setShowApproveModal(null);
      fetchRequests();
    } catch {
      toast.error('Failed to approve');
    }
  };

  const handleFnbApprove = async (req) => {
    try {
      await api.itemRequests.fnbApprove(req.id, {
        approver_id:   user.id,
        approver_name: user.full_name || user.name,
      });
      toast.success('Request fully approved');
      fetchRequests();
    } catch {
      toast.error('Failed to approve');
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await api.itemRequests.reject(rejectModal.id, {
        rejected_by_id:   user.id,
        rejected_by_name: user.full_name || user.name,
        reason: rejectReason,
      });
      toast.success('Request rejected');
      setRejectModal(null);
      setRejectReason('');
      fetchRequests();
    } catch {
      toast.error('Failed to reject');
    }
  };

  const filteredRequests = requests;
  const pending      = requests.filter(r => r.status === 'pending').length;
  const storeApproved= requests.filter(r => r.status === 'store_approved').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Item Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Two-step approval workflow</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchRequests} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            <FiRefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
            <FiPlus className="w-4 h-4" /> New Request
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',         value: requests.length,  color: 'bg-gray-100 text-gray-800' },
          { label: 'Pending',       value: pending,          color: 'bg-yellow-100 text-yellow-800' },
          { label: 'Store Approved',value: storeApproved,    color: 'bg-blue-100 text-blue-800' },
          { label: 'Fully Approved',value: requests.filter(r => r.status === 'fully_approved').length, color: 'bg-green-100 text-green-800' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'store_approved', 'fully_approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filterStatus === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
            }`}>
            {s === 'all' ? 'All' : STATUS_META[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Request List */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <FiRefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
          <FiSend className="w-10 h-10 mb-2" />
          <p>No requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map(req => (
            <RequestCard
              key={req.id}
              req={req}
              expanded={expandedId === req.id}
              onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
              isStoreAdmin={isStoreAdmin}
              isFnbManager={isFnbManager}
              currentUser={user}
              onStoreApprove={() => setShowApproveModal(req)}
              onFnbApprove={() => handleFnbApprove(req)}
              onReject={() => { setRejectModal(req); setRejectReason(''); }}
            />
          ))}
        </div>
      )}

      {/* New Request Form Modal */}
      {showForm && <NewRequestModal user={user} onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); fetchRequests(); }} />}

      {/* Store Approve Modal */}
      {showApproveModal && (
        <StoreApproveModal
          req={showApproveModal}
          onClose={() => setShowApproveModal(null)}
          onApprove={(lines) => handleStoreApprove(showApproveModal, lines)}
        />
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-gray-900">Reject Request</h3>
              <button onClick={() => setRejectModal(null)}><FiX className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">Rejecting <span className="font-semibold">{rejectModal.request_number}</span></p>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)…" rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              <div className="flex gap-3">
                <button onClick={() => setRejectModal(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
                <button onClick={handleReject} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Reject</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RequestCard({ req, expanded, onToggle, isStoreAdmin, isFnbManager, currentUser, onStoreApprove, onFnbApprove, onReject }) {
  const canStoreApprove = isStoreAdmin && req.status === 'pending';
  const canFnbApprove   = isFnbManager && req.status === 'store_approved';
  const canReject       = (isStoreAdmin || isFnbManager) && !['fully_approved', 'rejected'].includes(req.status);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs text-gray-500">{req.request_number}</span>
          <span className="font-semibold text-gray-900">{req.store_name}</span>
          <StatusBadge status={req.status} />
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{req.requester_name}</span>
          <span>{new Date(req.created_at).toLocaleDateString()}</span>
          {expanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          {/* Lines Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  {['#', 'Item No.', 'Description', 'UOM', 'Qty Requested', 'Qty Approved'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {req.lines.map(line => (
                  <tr key={line.line_number} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{line.line_number}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{line.item_number || '—'}</td>
                    <td className="px-3 py-2 font-medium">{line.description}</td>
                    <td className="px-3 py-2 text-gray-500">{line.uom}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{line.quantity_requested}</td>
                    <td className="px-3 py-2">
                      {line.quantity_approved !== null
                        ? <span className="font-bold text-green-700">{line.quantity_approved}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Approval Trail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs font-semibold text-blue-600 mb-1">Step 1 — Store Admin</p>
              {req.store_admin_name
                ? <><p className="font-medium text-gray-800">Approved by: {req.store_admin_name}</p>
                    <p className="text-xs text-gray-400">{new Date(req.store_admin_approved_at).toLocaleString()}</p></>
                : <p className="text-gray-400 italic">Awaiting store admin approval</p>}
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-xs font-semibold text-green-600 mb-1">Step 2 — F&amp;B Manager</p>
              {req.fnb_manager_name
                ? <><p className="font-medium text-gray-800">Approved by: {req.fnb_manager_name}</p>
                    <p className="text-xs text-gray-400">{new Date(req.fnb_manager_approved_at).toLocaleString()}</p></>
                : <p className="text-gray-400 italic">Awaiting F&B Manager sign-off</p>}
            </div>
          </div>

          {req.status === 'rejected' && (
            <div className="p-3 bg-red-50 rounded-lg text-sm">
              <p className="font-semibold text-red-700">Rejected by: {req.rejected_by}</p>
              {req.rejection_reason && <p className="text-red-600 mt-1">Reason: {req.rejection_reason}</p>}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 flex-wrap">
            {canStoreApprove && (
              <button onClick={onStoreApprove} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                <FiCheck className="w-4 h-4" /> Approve (Step 1)
              </button>
            )}
            {canFnbApprove && (
              <button onClick={onFnbApprove} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
                <FiCheckCircle className="w-4 h-4" /> Final Approve
              </button>
            )}
            {canReject && (
              <button onClick={onReject} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
                <FiXCircle className="w-4 h-4" /> Reject
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NewRequestModal({ user, onClose, onCreated }) {
  const [storeId, setStoreId]           = useState('');
  const [storeItems, setStoreItems]     = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [notes, setNotes]               = useState('');
  const [lines, setLines]               = useState([{ ...EMPTY_LINE, _itemId: '' }]);
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (!storeId) { setStoreItems([]); setLines([{ ...EMPTY_LINE, _itemId: '' }]); return; }
    setLoadingItems(true);
    api.stores.getItems(storeId)
      .then(res => {
        const data = res?.data?.data?.items ?? res?.data?.items ?? [];
        setStoreItems(Array.isArray(data) ? data : []);
      })
      .catch(() => setStoreItems([]))
      .finally(() => setLoadingItems(false));
    setLines([{ ...EMPTY_LINE, _itemId: '' }]);
  }, [storeId]);

  const addLine    = () => setLines(l => [...l, { ...EMPTY_LINE, _itemId: '' }]);
  const removeLine = (i) => setLines(l => l.filter((_, idx) => idx !== i));
  const updateLine = (i, field, val) => setLines(l => l.map((ln, idx) => idx === i ? { ...ln, [field]: val } : ln));

  const selectStoreItem = (i, itemId) => {
    if (!itemId || itemId === '__custom__') {
      setLines(l => l.map((ln, idx) => idx === i ? { ...EMPTY_LINE, _itemId: '__custom__' } : ln));
      return;
    }
    const item = storeItems.find(it => String(it.id) === String(itemId));
    if (item) {
      setLines(l => l.map((ln, idx) => idx === i ? { ...ln, _itemId: itemId, item_number: item.item_number, description: item.description, uom: item.uom } : ln));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!storeId) { toast.error('Please select a store'); return; }
    const validLines = lines.filter(l => l.description.trim() && parseFloat(l.quantity_requested) > 0);
    if (validLines.length === 0) { toast.error('Add at least one item with description and quantity'); return; }
    setSaving(true);
    try {
      await api.itemRequests.create({
        store_id:       storeId,
        requester_id:   user.id,
        requester_name: user.full_name || user.name || user.username,
        notes,
        lines: validLines.map(({ _itemId, ...rest }) => rest),
      });
      toast.success('Request submitted successfully');
      onCreated();
    } catch {
      toast.error('Failed to submit request');
    } finally {
      setSaving(false);
    }
  };

  const isItemSelected = (line) => line._itemId && line._itemId !== '__custom__';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-xl text-gray-900">New Item Request</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FiX className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Requester + Store */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Requester Name</label>
                <input readOnly value={user?.full_name || user?.name || user?.username || ''}
                  className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Store *</label>
                <select required value={storeId} onChange={e => setStoreId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">Select store…</option>
                  {STORES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Item hint */}
            {storeId && (
              <div className={`text-xs px-3 py-2 rounded-lg ${loadingItems ? 'bg-yellow-50 text-yellow-700' : storeItems.length > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-500'}`}>
                {loadingItems ? '⏳ Loading store items…' : storeItems.length > 0 ? `✅ ${storeItems.length} items found — select from dropdown or choose "Custom item"` : 'ℹ️ No items in this store yet — enter descriptions manually'}
              </div>
            )}

            {/* Line Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item Lines</label>
                <button type="button" onClick={addLine} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                  <FiPlus className="w-3.5 h-3.5" /> Add Line
                </button>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-28">Item No.</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Description *</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-24">UOM</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-28">Qty Requested *</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-28 text-gray-300">Qty Approved</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((line, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                        {/* Item No — auto-filled or manual */}
                        <td className="px-3 py-2">
                          <input value={line.item_number} onChange={e => updateLine(i, 'item_number', e.target.value)}
                            placeholder="auto" readOnly={isItemSelected(line)}
                            className={`w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 ${isItemSelected(line) ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-200'}`} />
                        </td>
                        {/* Description — dropdown when store items exist, text otherwise */}
                        <td className="px-3 py-2">
                          {storeItems.length > 0 && !isItemSelected(line) && line._itemId !== '__custom__' ? (
                            <select value={line._itemId || ''} onChange={e => selectStoreItem(i, e.target.value)} required
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
                              <option value="">— select item —</option>
                              {storeItems.map(item => (
                                <option key={item.id} value={item.id}>{item.item_number} — {item.description}</option>
                              ))}
                              <option value="__custom__">✏️ Custom item…</option>
                            </select>
                          ) : isItemSelected(line) ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-medium text-gray-700 truncate">{line.description}</span>
                              <button type="button" onClick={() => selectStoreItem(i, '')} className="text-xs text-indigo-400 hover:text-indigo-600 flex-shrink-0">✕</button>
                            </div>
                          ) : (
                            <div className="flex gap-1 items-center">
                              <input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)}
                                placeholder="Item description" required
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                              {storeItems.length > 0 && (
                                <button type="button" onClick={() => selectStoreItem(i, '')} className="text-xs text-indigo-400 hover:underline flex-shrink-0">← list</button>
                              )}
                            </div>
                          )}
                        </td>
                        {/* UOM */}
                        <td className="px-3 py-2">
                          {isItemSelected(line) ? (
                            <span className="text-xs font-mono text-gray-500 px-1">{line.uom}</span>
                          ) : (
                            <select value={line.uom} onChange={e => updateLine(i, 'uom', e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
                              {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0.01" step="0.01" value={line.quantity_requested}
                            onChange={e => updateLine(i, 'quantity_requested', e.target.value)} required
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        </td>
                        <td className="px-3 py-2">
                          <input readOnly value="—" className="w-full bg-gray-50 border border-gray-100 rounded px-2 py-1 text-xs text-gray-300 cursor-not-allowed" />
                        </td>
                        <td className="px-3 py-2">
                          {lines.length > 1 && (
                            <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600">
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Any additional notes…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          <div className="flex gap-3 p-5 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
              <FiSend className="w-4 h-4" /> {saving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StoreApproveModal({ req, onClose, onApprove }) {
  const [lines, setLines] = useState(req.lines.map(l => ({ ...l, quantity_approved: l.quantity_requested })));

  const updateApproved = (lineNum, val) =>
    setLines(ls => ls.map(l => l.line_number === lineNum ? { ...l, quantity_approved: val } : l));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <div>
            <h3 className="font-bold text-xl text-gray-900">Step 1 — Store Admin Approval</h3>
            <p className="text-sm text-gray-500 mt-1">{req.request_number} · {req.store_name}</p>
          </div>
          <button onClick={onClose}><FiX className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          <p className="text-sm text-gray-600 mb-4">Review and fill in <span className="font-semibold">Quantity Approved</span> for each line:</p>
          <table className="w-full text-sm border border-gray-100 rounded-xl overflow-hidden">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['#', 'Item No.', 'Description', 'UOM', 'Qty Requested', 'Qty Approved *'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line) => (
                <tr key={line.line_number}>
                  <td className="px-3 py-2 text-gray-400">{line.line_number}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{line.item_number || '—'}</td>
                  <td className="px-3 py-2 font-medium">{line.description}</td>
                  <td className="px-3 py-2 text-gray-500">{line.uom}</td>
                  <td className="px-3 py-2 font-semibold text-gray-700">{line.quantity_requested}</td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="0.01"
                      value={line.quantity_approved}
                      onChange={e => updateApproved(line.line_number, e.target.value)}
                      className="w-24 border-2 border-blue-300 rounded-lg px-2 py-1 text-sm font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 p-5 border-t flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
          <button onClick={() => onApprove(lines)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <FiCheck className="w-4 h-4" /> Approve & Forward to F&B Manager
          </button>
        </div>
      </div>
    </div>
  );
}
