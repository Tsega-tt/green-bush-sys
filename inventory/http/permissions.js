'use strict';

const repos = require('../repositories');
const { getPool } = require('../db/pool');
const { InventoryError, Errors } = require('../errors');

// Role groups (store_admin is the legacy alias for store_manager).
const STORE_MANAGER = ['store_manager', 'store_admin'];
const FNB = ['fnb_manager'];
const PRIV = ['admin', 'owner'];

const GROUPS = {
  readInventory: [...STORE_MANAGER, ...FNB, ...PRIV, 'purchaser'],
  adjust: [...STORE_MANAGER, ...FNB, 'admin'],
  manageItems: ['admin', ...FNB],
  manageSuppliers: ['admin', ...FNB, 'purchaser'],
  manageStores: ['admin'],
  manageThresholds: ['admin', 'owner'],
  viewAudit: ['admin', 'owner'],
  ops: ['admin'],
  resolveAlerts: [...FNB, ...PRIV],
  ackAlerts: [...STORE_MANAGER, ...FNB, ...PRIV],

  // Phase 2-7
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
  orderConsume: ['cashier', 'waiter', 'cafe_waiter', 'kitchen_staff', ...STORE_MANAGER, ...FNB, ...PRIV],
};

/** Resolve the acting user from user_id (body/query/header) against PG. */
async function resolveUser(req, res, next) {
  try {
    const userId =
      (req.body && req.body.user_id) ||
      (req.query && req.query.user_id) ||
      req.header('x-user-id');
    if (!userId) throw Errors.noUser();
    const user = await repos.usersRepo.getById(getPool(), parseInt(userId, 10));
    if (!user) throw Errors.forbidden('User not found');
    if (!user.is_active) throw Errors.forbidden('User is deactivated');
    req.invUser = {
      id: user.id,
      role: user.role,
      storeId: user.store_id != null ? Number(user.store_id) : null,
    };
    next();
  } catch (err) {
    sendError(res, err);
  }
}

function requireRoles(groupKey) {
  const allowed = GROUPS[groupKey] || [];
  return (req, res, next) => {
    if (!req.invUser) return sendError(res, Errors.noUser());
    if (!allowed.includes(req.invUser.role)) return sendError(res, Errors.forbidden());
    next();
  };
}

/**
 * Store-scope guard: store managers may only act on their own store. Privileged
 * roles (admin/owner/fnb_manager) may act on any store. Resolves the target
 * store id from params/body/query.
 */
function enforceStoreScope(req, res, next) {
  const u = req.invUser;
  const isPrivileged = [...PRIV, ...FNB].includes(u.role);
  if (isPrivileged) return next();
  const target =
    req.params.storeId || (req.body && req.body.store_id) || req.query.store_id;
  if (target == null) return next(); // list endpoints filter by scope elsewhere
  if (u.storeId == null || Number(target) !== u.storeId) {
    return sendError(res, Errors.forbidden('Outside your store scope'));
  }
  next();
}

function sendError(res, err) {
  if (err instanceof InventoryError) {
    return res.status(err.httpStatus).json({
      status: 'error', code: err.code, message: err.message, data: err.details || undefined,
    });
  }
  // Map raw pg errors that escaped the service layer.
  if (err && err.code === '23505') {
    return res.status(409).json({ status: 'error', code: 'CONFLICT', message: 'Duplicate value' });
  }
  if (err && err.code === '23514') {
    return res.status(409).json({ status: 'error', code: 'CHECK_VIOLATION', message: err.message });
  }
  console.error('[inventory] unhandled error:', err);
  return res.status(500).json({ status: 'error', code: 'INTERNAL', message: 'Internal error' });
}

/** Wrap an async handler so thrown InventoryErrors map to the envelope. */
function asyncHandler(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch((err) => sendError(res, err));
}

function ok(res, data, status = 200) {
  return res.status(status).json({ status: 'success', data });
}

module.exports = {
  resolveUser, requireRoles, enforceStoreScope, asyncHandler, sendError, ok, GROUPS,
};
