'use strict';

const repos = require('../repositories');
const { withTransaction } = require('../db/withTransaction');
const { getPool } = require('../db/pool');
const capabilityService = require('./capabilityService');
const { Errors } = require('../errors');

function actor(ctx) {
  return { actorId: ctx.userId, actorRole: ctx.userRole, ipAddress: ctx.ip || null };
}

// ---------------- stores ----------------
async function createStore(data, ctx) {
  if (!data.code || !data.name) throw Errors.validation('code and name are required');
  return withTransaction(async (client) => {
    if (await repos.stores.getByCode(client, data.code)) throw Errors.conflict('Store code already exists');
    const store = await repos.stores.insert(client, data);
    await repos.audit.insert(client, { ...actor(ctx), action: 'create',
      entityType: 'store', entityId: store.id, newValue: store });
    return store;
  });
}

async function updateStore(id, patch, ctx) {
  return withTransaction(async (client) => {
    const before = await repos.stores.getById(client, id);
    if (!before) throw Errors.notFound('Store');
    const store = await repos.stores.update(client, id, patch);
    await repos.audit.insert(client, { ...actor(ctx), action: 'update',
      entityType: 'store', entityId: id, oldValue: before, newValue: store });
    return store;
  });
}

/**
 * Permanently (hard) delete a store. Refuses if it still holds stock so
 * inventory can't be silently lost. store_capabilities cascade and the manager
 * link nulls out; if protected history (ledger, transfers, recipes, purchases)
 * still references the store, the FK blocks deletion and we surface a clear
 * message telling the caller to clear those records first.
 */
async function deleteStore(id, ctx) {
  return withTransaction(async (client) => {
    const before = await repos.stores.getById(client, id);
    if (!before) throw Errors.notFound('Store');
    const summary = await repos.stores.summary(client, id);
    if (summary && Number(summary.total_quantity) > 0) {
      throw Errors.businessRule('Store still holds stock — empty or transfer it out before deleting.');
    }
    if (before.manager_id) await repos.usersRepo.setStoreId(client, before.manager_id, null);
    try {
      await repos.stores.hardDelete(client, id);
    } catch (e) {
      if (e && e.code === '23503') {
        throw Errors.businessRule('Store has inventory history or links (ledger, transfers, recipes, purchases) and cannot be permanently deleted. Remove those records first.');
      }
      throw e;
    }
    await repos.audit.insert(client, { ...actor(ctx), action: 'delete',
      entityType: 'store', entityId: id, oldValue: before });
    return before;
  });
}

/**
 * Assign (or clear, with managerId=null) a store's manager. Enforces the
 * one-manager-per-store / one-store-per-manager rule and keeps users.store_id
 * in sync so store-scoping (enforceStoreScope) works automatically.
 */
async function assignManager(storeId, managerId, ctx) {
  return withTransaction(async (client) => {
    const store = await repos.stores.getById(client, storeId);
    if (!store) throw Errors.notFound('Store');

    // Detach the store's previous manager (if any and different).
    if (store.manager_id && Number(store.manager_id) !== Number(managerId)) {
      await repos.usersRepo.setStoreId(client, store.manager_id, null);
    }

    if (managerId) {
      const user = await repos.usersRepo.getById(client, managerId);
      if (!user) throw Errors.validation('Manager user not found');
      if (!['store_manager', 'store_admin'].includes(user.role)) {
        throw Errors.businessRule('Assigned user must have the store_manager role');
      }
      // A manager runs at most one store: detach them elsewhere first.
      await repos.stores.clearManagerForUser(client, managerId);
      await repos.stores.setManager(client, storeId, managerId);
      await repos.usersRepo.setStoreId(client, managerId, storeId);
    } else {
      await repos.stores.setManager(client, storeId, null);
    }

    await repos.audit.insert(client, { ...actor(ctx), action: 'assign_manager',
      entityType: 'store', entityId: storeId, oldValue: { manager_id: store.manager_id }, newValue: { manager_id: managerId || null } });
    return repos.stores.getById(client, storeId);
  });
}

async function setCapabilities(storeId, caps, ctx) {
  const result = await withTransaction(async (client) => {
    const store = await repos.stores.getById(client, storeId);
    if (!store) throw Errors.notFound('Store');
    const out = [];
    for (const c of caps) {
      out.push(await repos.capabilities.upsert(client, storeId, c.capabilityKey, c.enabled !== false, c.config || null));
    }
    await repos.audit.insert(client, { ...actor(ctx), action: 'update_capabilities',
      entityType: 'store', entityId: storeId, newValue: caps });
    return out;
  });
  capabilityService.invalidate();
  return result;
}

// ---------------- items ----------------
// ---------------- units of measure (data-driven) ----------------
/**
 * Validate the user-entered uom_attributes against the UOM's schema and return
 * a clean object to persist. Enforces required fields and numeric typing so the
 * stored values are always trustworthy — driven entirely by the DB schema.
 */
async function validateUomAttributes(client, uomCode, raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  if (!uomCode) return {};
  const schema = await repos.uoms.getAttributes(client, uomCode);
  if (!schema.length) return {}; // UOM has no extra fields
  const clean = {};
  for (const a of schema) {
    let v = input[a.attr_key];
    const empty = v === undefined || v === null || v === '';
    if (empty) {
      if (a.is_required) throw Errors.validation(`${a.label} is required for unit "${uomCode}"`);
      continue;
    }
    if (a.input_type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) throw Errors.validation(`${a.label} must be a number`);
      if (n < 0) throw Errors.validation(`${a.label} cannot be negative`);
      v = n;
    } else if (a.input_type === 'select' && Array.isArray(a.options) && a.options.length && !a.options.includes(String(v))) {
      throw Errors.validation(`${a.label} must be one of: ${a.options.join(', ')}`);
    } else {
      v = String(v);
    }
    clean[a.attr_key] = v;
  }
  return clean;
}

const listUoms = (opts) => repos.uoms.listWithAttributes(getPool(), opts);

async function createUom(data, ctx) {
  if (!data.code || !data.name) throw Errors.validation('code and name are required');
  const code = String(data.code).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return withTransaction(async (client) => {
    if (await repos.uoms.getByCode(client, code)) throw Errors.conflict('UOM code already exists');
    const uom = await repos.uoms.insertDefinition(client, { ...data, code });
    for (const a of data.attributes || []) {
      await repos.uoms.insertAttribute(client, { ...a, uomCode: code });
    }
    await repos.audit.insert(client, { ...actor(ctx), action: 'create', entityType: 'uom', entityId: uom.id, newValue: uom });
    return uom;
  });
}

async function addUomAttribute(code, attr, ctx) {
  if (!attr.attrKey || !attr.label) throw Errors.validation('attr_key and label are required');
  return withTransaction(async (client) => {
    if (!(await repos.uoms.getByCode(client, code))) throw Errors.notFound('UOM');
    const row = await repos.uoms.insertAttribute(client, { ...attr, uomCode: code });
    await repos.audit.insert(client, { ...actor(ctx), action: 'update', entityType: 'uom', entityId: code, newValue: row });
    return row;
  });
}

async function createItem(data, ctx) {
  if (!data.description) throw Errors.validation('description is required');
  return withTransaction(async (client) => {
    data.uomAttributes = await validateUomAttributes(client, data.uom, data.uomAttributes);
    let code = data.itemCode && String(data.itemCode).trim();
    if (code && (await repos.items.getByCode(client, code))) throw Errors.conflict('item_code already exists');
    if (!code) {
      // generate ITM-000001 style code from a count (simple, collision-checked)
      const { rows } = await client.query(`SELECT COUNT(*)::int AS c FROM inventory_items`);
      code = `ITM-${String(rows[0].c + 1).padStart(6, '0')}`;
    }
    const item = await repos.items.insert(client, { ...data, itemCode: code });
    await repos.audit.insert(client, { ...actor(ctx), action: 'create',
      entityType: 'inventory_item', entityId: item.id, newValue: item });
    return item;
  });
}

async function updateItem(id, patch, ctx) {
  return withTransaction(async (client) => {
    const before = await repos.items.getById(client, id);
    if (!before) throw Errors.notFound('Item');
    // Re-validate UOM attributes against the effective UOM (new or existing).
    if (patch.uomAttributes !== undefined || patch.uom !== undefined) {
      const effectiveUom = patch.uom || before.uom;
      patch.uomAttributes = await validateUomAttributes(client, effectiveUom, patch.uomAttributes);
    }
    const item = await repos.items.update(client, id, patch);
    await repos.audit.insert(client, { ...actor(ctx), action: 'update',
      entityType: 'inventory_item', entityId: id, oldValue: before, newValue: item });
    return item;
  });
}

async function deleteItem(id, ctx) {
  return withTransaction(async (client) => {
    const before = await repos.items.getById(client, id);
    if (!before) throw Errors.notFound('Item');
    const onHand = Number(await repos.items.totalOnHand(client, id));
    if (onHand > 0) throw Errors.businessRule(`Cannot delete: ${onHand} on hand across stores`);
    const item = await repos.items.softDelete(client, id);
    await repos.audit.insert(client, { ...actor(ctx), action: 'soft_delete',
      entityType: 'inventory_item', entityId: id, oldValue: before });
    return item;
  });
}

// ---------------- suppliers ----------------
async function createSupplier(data, ctx) {
  if (!data.name) throw Errors.validation('name is required');
  return withTransaction(async (client) => {
    const supplier = await repos.suppliers.insert(client, data);
    await repos.audit.insert(client, { ...actor(ctx), action: 'create',
      entityType: 'supplier', entityId: supplier.id, newValue: supplier });
    return supplier;
  });
}

async function updateSupplier(id, patch, ctx) {
  return withTransaction(async (client) => {
    const before = await repos.suppliers.getById(client, id);
    if (!before) throw Errors.notFound('Supplier');
    const supplier = await repos.suppliers.update(client, id, patch);
    await repos.audit.insert(client, { ...actor(ctx), action: 'update',
      entityType: 'supplier', entityId: id, oldValue: before, newValue: supplier });
    return supplier;
  });
}

// ---------------- draft serving sizes ----------------
function slugifyCode(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function createServingSize(data, ctx) {
  if (!data.name) throw Errors.validation('name is required');
  if (!(Number(data.literQuantity) > 0)) throw Errors.validation('liter_quantity must be > 0');
  return withTransaction(async (client) => {
    const code = (data.code && slugifyCode(data.code)) || slugifyCode(data.name);
    if (await repos.servingSizes.getByCode(client, code)) throw Errors.conflict('Serving size code already exists');
    const size = await repos.servingSizes.insert(client, { ...data, code });
    await repos.audit.insert(client, { ...actor(ctx), action: 'create',
      entityType: 'draft_serving_size', entityId: size.id, newValue: size });
    return size;
  });
}

async function updateServingSize(id, patch, ctx) {
  return withTransaction(async (client) => {
    const before = await repos.servingSizes.getById(client, id);
    if (!before) throw Errors.notFound('Serving size');
    if (patch.literQuantity != null && !(Number(patch.literQuantity) > 0)) throw Errors.validation('liter_quantity must be > 0');
    const size = await repos.servingSizes.update(client, id, patch);
    await repos.audit.insert(client, { ...actor(ctx), action: 'update',
      entityType: 'draft_serving_size', entityId: id, oldValue: before, newValue: size });
    return size;
  });
}

// ---------------- thresholds ----------------
async function replaceThresholds(bands, ctx) {
  return withTransaction(async (client) => {
    await repos.thresholds.replaceAll(client, bands);
    await repos.audit.insert(client, { ...actor(ctx), action: 'replace',
      entityType: 'approval_thresholds', newValue: bands });
    return repos.thresholds.listActive(client);
  });
}

// ---------------- reads (pool) ----------------
const reads = {
  listStores: () => repos.stores.list(getPool()),
  getStore: (id) => repos.stores.getById(getPool(), id),
  storeSummary: (id) => repos.stores.summary(getPool(), id),
  listManagers: () => repos.usersRepo.listManagers(getPool()),
  listServingSizes: (opts) => repos.servingSizes.list(getPool(), opts),
  listUoms,
  listCapabilities: (storeId) => repos.capabilities.listByStore(getPool(), storeId),
  listItems: (q) => repos.items.list(getPool(), q),
  listSuppliers: (q) => repos.suppliers.list(getPool(), q),
  listThresholds: () => repos.thresholds.listActive(getPool()),
};

module.exports = {
  createStore, updateStore, deleteStore, assignManager, setCapabilities,
  createServingSize, updateServingSize,
  createUom, addUomAttribute,
  createItem, updateItem, deleteItem,
  createSupplier, updateSupplier,
  replaceThresholds, reads,
};
