'use strict';

/**
 * Domain error with a stable machine code + HTTP status. Services throw these;
 * the HTTP layer translates them into the standard response envelope.
 */
class InventoryError extends Error {
  constructor(code, message, httpStatus = 400, details = null) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

const Errors = {
  validation: (msg, details) => new InventoryError('VALIDATION', msg, 400, details),
  noUser: () => new InventoryError('NO_USER', 'user_id is required', 401),
  forbidden: (msg = 'Insufficient permissions') => new InventoryError('FORBIDDEN', msg, 403),
  capNotEnabled: (cap) =>
    new InventoryError('CAP_NOT_ENABLED', `Store capability "${cap}" is not enabled`, 403),
  notFound: (what = 'Resource') => new InventoryError('NOT_FOUND', `${what} not found`, 404),
  insufficientStock: (details) =>
    new InventoryError('INSUFFICIENT_STOCK', 'Insufficient stock for one or more items', 409, details),
  idempotentReplay: (transaction) =>
    new InventoryError('IDEMPOTENT_REPLAY', 'Duplicate request (idempotency key already used)', 409, {
      transaction,
    }),
  conflict: (msg) => new InventoryError('CONFLICT', msg, 409),
  segregationOfDuties: (msg) => new InventoryError('SEGREGATION_OF_DUTIES', msg, 422),
  businessRule: (msg, details) => new InventoryError('BUSINESS_RULE', msg, 422, details),
  internal: (msg = 'Internal error') => new InventoryError('INTERNAL', msg, 500),
};

module.exports = { InventoryError, Errors };
