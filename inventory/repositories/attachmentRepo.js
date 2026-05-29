'use strict';

const attachments = {
  async insert(db, a) {
    const { rows } = await db.query(
      `INSERT INTO attachments
         (entity_type, entity_id, doc_label, file_name, original_name, mime_type,
          file_size, storage_path, checksum_sha256, version, supersedes_id, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [a.entityType, a.entityId, a.docLabel || null, a.fileName, a.originalName, a.mimeType,
       a.fileSize, a.storagePath, a.checksum, a.version || 1, a.supersedesId || null, a.uploadedBy]
    );
    return rows[0];
  },
  async listByEntity(db, entityType, entityId, { activeOnly = true } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM attachments
        WHERE entity_type=$1 AND entity_id=$2 AND ($3::boolean=false OR is_active=true)
        ORDER BY uploaded_at DESC`,
      [entityType, entityId, activeOnly]
    );
    return rows;
  },
  async getById(db, id) {
    const { rows } = await db.query(`SELECT * FROM attachments WHERE id=$1`, [id]);
    return rows[0] || null;
  },
  async softDelete(db, id) {
    const { rows } = await db.query(
      `UPDATE attachments SET is_active=false WHERE id=$1 RETURNING *`, [id]
    );
    return rows[0] || null;
  },
  /** True if an active attachment with the given label exists for the entity. */
  async hasDoc(db, entityType, entityId, docLabel) {
    const { rows } = await db.query(
      `SELECT 1 FROM attachments
        WHERE entity_type=$1 AND entity_id=$2 AND doc_label=$3 AND is_active=true LIMIT 1`,
      [entityType, entityId, docLabel]
    );
    return rows.length > 0;
  },
};

module.exports = { attachments };
