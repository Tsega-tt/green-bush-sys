/**
 * Frontend mirror of inventory/http/permissions.js GROUPS. Keep these two in
 * sync. Used to gate action buttons so staff never click something the API
 * will reject with 403. (store_admin is the legacy alias for store_manager.)
 */
const STORE_MANAGER = ['store_manager', 'store_admin'];
const FNB = ['fnb_manager'];
const PRIV = ['admin', 'owner'];

export const GROUPS = {
  readInventory: [...STORE_MANAGER, ...FNB, ...PRIV, 'purchaser'],
  adjust: [...STORE_MANAGER, ...FNB, 'admin'],
  manageItems: ['admin', ...FNB],
  manageSuppliers: ['admin', ...FNB, 'purchaser'],
  manageStores: ['admin'],
  manageThresholds: ['admin', 'owner'],
  viewAudit: ['admin', 'owner'],
  resolveAlerts: [...FNB, ...PRIV],
  ackAlerts: [...STORE_MANAGER, ...FNB, ...PRIV],
  transfersManage: [...STORE_MANAGER, ...FNB, ...PRIV],
  approveRequests: [...FNB, ...PRIV],
  ownerApprove: ['owner', 'admin'],
  purchasing: ['purchaser', 'admin'],
  receiveGoods: [...STORE_MANAGER, 'admin'],
  recipes: ['admin', ...FNB],
  operations: [...STORE_MANAGER, ...FNB, 'admin'],
  kegs: [...STORE_MANAGER, ...FNB, 'admin'],
  reports: [...STORE_MANAGER, ...FNB, ...PRIV],
  attachmentsUpload: [...STORE_MANAGER, ...FNB, 'purchaser', ...PRIV],
};

/** True if `role` is permitted for the given permission group. */
export const can = (role, group) => (GROUPS[group] || []).includes(role);

export default can;
