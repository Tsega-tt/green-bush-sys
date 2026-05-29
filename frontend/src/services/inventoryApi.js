import { api, API_BASE_URL } from './api';

/**
 * Client for the PostgreSQL inventory module (/api/inv/*). Reuses the shared
 * axios instance (which injects the x-user-id header + user_id body). All
 * methods return the axios promise; callers read res.data.data.
 */
const P = '/inv';

const inventoryApi = {
  // ---- master data ----
  stores: {
    list: () => api.get(`${P}/stores`),
    get: (id) => api.get(`${P}/stores/${id}`),
    create: (data) => api.post(`${P}/stores`, data),
    update: (id, data) => api.put(`${P}/stores/${id}`, data),
    capabilities: (id) => api.get(`${P}/stores/${id}/capabilities`),
    setCapabilities: (id, capabilities) => api.put(`${P}/stores/${id}/capabilities`, { capabilities }),
    capabilityCatalog: () => api.get(`${P}/capabilities-catalog`),
    managers: () => api.get(`${P}/store-managers`),
    assignManager: (id, managerId) => api.patch(`${P}/stores/${id}/manager`, { manager_id: managerId }),
    summary: (id) => api.get(`${P}/stores/${id}/summary`),
  },

  // ---- draft serving sizes (configurable) ----
  servingSizes: {
    list: (params) => api.get(`${P}/draft-serving-sizes`, { params }),
    create: (data) => api.post(`${P}/draft-serving-sizes`, data),
    update: (id, data) => api.put(`${P}/draft-serving-sizes/${id}`, data),
  },
  items: {
    list: (params) => api.get(`${P}/items`, { params }),
    create: (data) => api.post(`${P}/items`, data),
    update: (id, data) => api.put(`${P}/items/${id}`, data),
    remove: (id) => api.delete(`${P}/items/${id}`),
    ledger: (id, params) => api.get(`${P}/items/${id}/ledger`, { params }),
    priceHistory: (id) => api.get(`${P}/items/${id}/price-history`),
  },
  suppliers: {
    list: (params) => api.get(`${P}/suppliers`, { params }),
    create: (data) => api.post(`${P}/suppliers`, data),
    update: (id, data) => api.put(`${P}/suppliers/${id}`, data),
  },
  thresholds: {
    list: () => api.get(`${P}/approval-thresholds`),
    replace: (bands) => api.put(`${P}/approval-thresholds`, { bands }),
  },

  // ---- balances / ledger ----
  balances: (params) => api.get(`${P}/balances`, { params }),
  valuation: (params) => api.get(`${P}/valuation`, { params }),
  storeLedger: (storeId, params) => api.get(`${P}/stores/${storeId}/ledger`, { params }),
  batches: (params) => api.get(`${P}/batches`, { params }),
  adjust: (data) => api.post(`${P}/adjustments`, data),
  deduct: (data) => api.post(`${P}/deductions`, data),
  openingBalance: (data) => api.post(`${P}/opening-balances`, data),

  // ---- snapshots / alerts / audit ----
  snapshots: (params) => api.get(`${P}/snapshots`, { params }),
  runSnapshot: (date) => api.post(`${P}/snapshots/run`, { date }),
  alerts: {
    list: (params) => api.get(`${P}/alerts`, { params }),
    ack: (id) => api.patch(`${P}/alerts/${id}/ack`),
    resolve: (id) => api.patch(`${P}/alerts/${id}/resolve`),
  },
  auditLogs: (params) => api.get(`${P}/audit-logs`, { params }),

  // ---- transfers (Phase 2) ----
  transfers: {
    list: (params) => api.get(`${P}/transfers`, { params }),
    get: (id) => api.get(`${P}/transfers/${id}`),
    create: (data) => api.post(`${P}/transfers`, data),
    approve: (id, lines) => api.patch(`${P}/transfers/${id}/approve`, { lines }),
    reject: (id, reason) => api.patch(`${P}/transfers/${id}/reject`, { reason }),
    send: (id) => api.patch(`${P}/transfers/${id}/send`),
    receive: (id, lines) => api.patch(`${P}/transfers/${id}/receive`, { lines }),
    close: (id) => api.patch(`${P}/transfers/${id}/close`),
  },

  // ---- purchasing (Phase 3) ----
  pr: {
    list: (params) => api.get(`${P}/purchase-requisitions`, { params }),
    get: (id) => api.get(`${P}/purchase-requisitions/${id}`),
    create: (data) => api.post(`${P}/purchase-requisitions`, data),
    approve: (id, lines) => api.patch(`${P}/purchase-requisitions/${id}/approve`, { lines }),
    ownerApprove: (id) => api.patch(`${P}/purchase-requisitions/${id}/owner-approve`),
    reject: (id, reason) => api.patch(`${P}/purchase-requisitions/${id}/reject`, { reason }),
  },
  po: {
    list: (params) => api.get(`${P}/purchase-orders`, { params }),
    get: (id) => api.get(`${P}/purchase-orders/${id}`),
    create: (data) => api.post(`${P}/purchase-orders`, data),
  },
  grn: {
    list: (params) => api.get(`${P}/goods-receipts`, { params }),
    get: (id) => api.get(`${P}/goods-receipts/${id}`),
    create: (data) => api.post(`${P}/goods-receipts`, data),
    post: (id) => api.patch(`${P}/goods-receipts/${id}/post`),
  },
  attachments: {
    list: (entityType, entityId) => api.get(`${P}/attachments`, { params: { entity_type: entityType, entity_id: entityId } }),
    upload: (formData) => api.post(`${P}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    downloadUrl: (id) => `${API_BASE_URL}${P}/attachments/${id}/download`,
    remove: (id) => api.delete(`${P}/attachments/${id}`),
  },

  // ---- recipes / availability (Phase 4) ----
  recipes: {
    list: () => api.get(`${P}/recipes`),
    get: (menuItemId) => api.get(`${P}/recipes/${menuItemId}`),
    set: (menuItemId, data) => api.put(`${P}/recipes/${menuItemId}`, data),
    availability: (menuItemId) => api.get(`${P}/menu/${menuItemId}/availability`),
    availabilityMany: (ids) => api.post(`${P}/menu/availability`, { menu_item_ids: ids }),
    validateOrder: (items) => api.post(`${P}/orders/validate`, { items }),
    consume: (orderId, items) => api.post(`${P}/orders/${orderId}/consume`, { items }),
    profitability: () => api.get(`${P}/reports/menu-profitability`),
  },

  // ---- operations (Phase 5) ----
  waste: {
    list: (params) => api.get(`${P}/waste`, { params }),
    record: (data) => api.post(`${P}/waste`, data),
  },
  counts: {
    list: (params) => api.get(`${P}/stock-counts`, { params }),
    get: (id) => api.get(`${P}/stock-counts/${id}`),
    create: (data) => api.post(`${P}/stock-counts`, data),
    enter: (id, lines) => api.patch(`${P}/stock-counts/${id}/enter`, { lines }),
    finalize: (id) => api.patch(`${P}/stock-counts/${id}/finalize`),
  },
  closing: {
    list: (params) => api.get(`${P}/daily-closing`, { params }),
    generate: (data) => api.post(`${P}/daily-closing/generate`, data),
    confirm: (data) => api.post(`${P}/daily-closing/confirm`, data),
  },
  kegs: {
    list: (params) => api.get(`${P}/kegs`, { params }),
    get: (id) => api.get(`${P}/kegs/${id}`),
    receive: (data) => api.post(`${P}/kegs`, data),
    event: (id, data) => api.patch(`${P}/kegs/${id}/event`, data),
  },

  // ---- reporting (Phase 7) + fraud (Phase 6) ----
  reports: {
    valuation: (params) => api.get(`${P}/reports/valuation`, { params }),
    valuationTrend: (params) => api.get(`${P}/reports/valuation-trend`, { params }),
    currentStock: (params) => api.get(`${P}/reports/current-stock`, { params }),
    lowStock: (params) => api.get(`${P}/reports/low-stock`, { params }),
    outOfStock: (params) => api.get(`${P}/reports/out-of-stock`, { params }),
    consumption: (params) => api.get(`${P}/reports/consumption`, { params }),
    waste: (params) => api.get(`${P}/reports/waste`, { params }),
    transfers: (params) => api.get(`${P}/reports/transfers`, { params }),
    purchases: (params) => api.get(`${P}/reports/purchases`, { params }),
    supplierPerformance: () => api.get(`${P}/reports/supplier-performance`),
    variance: (params) => api.get(`${P}/reports/variance`, { params }),
    expiry: (params) => api.get(`${P}/reports/expiry`, { params }),
    kegs: (params) => api.get(`${P}/reports/kegs`, { params }),
    dailyClosings: (params) => api.get(`${P}/reports/daily-closings`, { params }),
  },
  fraudScan: () => api.post(`${P}/fraud/scan`),

  /** Open the SSE stream for live inventory/transfer/alert events. */
  openEventStream(userId) {
    const url = `${API_BASE_URL}${P}/events?user_id=${encodeURIComponent(userId)}`;
    return new EventSource(url);
  },
};

export default inventoryApi;
