'use strict';

/**
 * Allow GRN / receiving documents to be attached to an acceptance batch.
 * Adds 'acceptance_batch' to the attachment_entity enum so the purchaser's
 * "New Receiving" form can upload the GRN file straight onto the batch.
 *
 * Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction, so this
 * migration disables the automatic wrapper.
 */
exports.shorthands = undefined;
exports.disableTransactions = true;

exports.up = (pgm) => {
  pgm.sql(`ALTER TYPE attachment_entity ADD VALUE IF NOT EXISTS 'acceptance_batch';`);
};

// Enum values cannot be dropped in PostgreSQL; down is a no-op.
exports.down = () => {};
