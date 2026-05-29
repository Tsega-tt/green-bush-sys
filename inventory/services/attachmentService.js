'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const repos = require('../repositories');
const { getPool } = require('../db/pool');
const { withTransaction } = require('../db/withTransaction');
const { Errors } = require('../errors');

const STORAGE_ROOT = path.resolve(process.env.INVENTORY_STORAGE_ROOT || './data/inventory_attachments');

const VALID_ENTITIES = new Set([
  'purchase_requisition', 'purchase_order', 'goods_receipt', 'transfer',
  'stock_count', 'waste', 'audit', 'invoice', 'other',
]);

function sha256(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

/**
 * Persist an uploaded file (already written to a temp path by multer) as a
 * permanent, checksummed, versioned attachment. Files are never overwritten.
 */
async function save(file, meta) {
  if (!file) throw Errors.validation('No file uploaded');
  if (!VALID_ENTITIES.has(meta.entityType)) throw Errors.validation('Invalid entity_type');
  if (!meta.entityId) throw Errors.validation('entity_id required');

  const destDir = path.join(STORAGE_ROOT, meta.entityType, String(meta.entityId));
  fs.mkdirSync(destDir, { recursive: true });
  const ext = path.extname(file.originalname) || '';
  const storedName = `${crypto.randomUUID()}${ext}`;
  const destPath = path.join(destDir, storedName);
  fs.renameSync(file.path, destPath);

  const checksum = sha256(destPath);

  return withTransaction(async (client) => {
    // version = prior count for (entity, doc_label) + 1
    const prior = await repos.attachments.listByEntity(client, meta.entityType, meta.entityId, { activeOnly: false });
    const sameLabel = prior.filter((a) => a.doc_label === (meta.docLabel || null));
    const version = sameLabel.length + 1;
    const supersedesId = sameLabel.length ? sameLabel[0].id : null;

    const row = await repos.attachments.insert(client, {
      entityType: meta.entityType, entityId: meta.entityId, docLabel: meta.docLabel,
      fileName: storedName, originalName: file.originalname, mimeType: file.mimetype,
      fileSize: file.size, storagePath: path.relative(process.cwd(), destPath),
      checksum, version, supersedesId, uploadedBy: meta.userId,
    });
    await repos.audit.insert(client, {
      actorId: meta.userId, actorRole: meta.userRole, action: 'upload',
      entityType: meta.entityType, entityId: meta.entityId,
      newValue: { attachment_id: row.id, doc_label: meta.docLabel, checksum },
    });
    return row;
  });
}

async function list(entityType, entityId) {
  return repos.attachments.listByEntity(getPool(), entityType, entityId);
}

async function remove(id, ctx) {
  return withTransaction(async (client) => {
    const a = await repos.attachments.getById(client, id);
    if (!a) throw Errors.notFound('Attachment');
    const removed = await repos.attachments.softDelete(client, id);
    await repos.audit.insert(client, { actorId: ctx.userId, actorRole: ctx.userRole,
      action: 'soft_delete_attachment', entityType: a.entity_type, entityId: a.entity_id,
      oldValue: { attachment_id: id } });
    return removed;
  });
}

function streamPath(row) {
  const abs = path.isAbsolute(row.storage_path) ? row.storage_path : path.join(process.cwd(), row.storage_path);
  if (!fs.existsSync(abs)) throw Errors.notFound('File');
  return abs;
}

module.exports = { save, list, remove, streamPath, STORAGE_ROOT };
