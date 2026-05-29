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
async function createItem(data, ctx) {
  if (!data.description) throw Errors.validation('description is required');
  return withTransaction(async (client) => {
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
  listCapabilities: (storeId) => repos.capabilities.listByStore(getPool(), storeId),
  listItems: (q) => repos.items.list(getPool(), q),
  listSuppliers: (q) => repos.suppliers.list(getPool(), q),
  listThresholds: () => repos.thresholds.listActive(getPool()),
};

module.exports = {
  createStore, updateStore, setCapabilities,
  createItem, updateItem, deleteItem,
  createSupplier, updateSupplier,
  replaceThresholds, reads,
};
