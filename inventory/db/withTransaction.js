'use strict';

const { getPool } = require('./pool');

/**
 * Postgres SQLSTATE codes that are safe to retry: serialization failure and
 * deadlock detected. With our consistent lock ordering (always by item_id asc)
 * deadlocks should not occur, but retrying is cheap insurance.
 */
const RETRYABLE = new Set(['40001', '40P01']);

/**
 * Run `fn(client)` inside a single DB transaction.
 *
 * Guarantees:
 *  - BEGIN before fn, COMMIT on success, ROLLBACK on any throw.
 *  - The client is always released back to the pool.
 *  - Transient serialization/deadlock errors are retried (bounded).
 *
 * IMPORTANT: keep the work inside `fn` short. Never perform file I/O, HTTP
 * calls, printing or sleeps inside the transaction — those belong outside the
 * lock window. The ledger engine relies on this to avoid lock contention.
 *
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 * @param {{ isolation?: 'READ COMMITTED'|'REPEATABLE READ'|'SERIALIZABLE', retries?: number }} [opts]
 */
async function withTransaction(fn, opts = {}) {
  const isolation = opts.isolation || 'READ COMMITTED';
  const maxRetries = Number.isInteger(opts.retries) ? opts.retries : 3;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const client = await getPool().connect();
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[inventory] ROLLBACK failed:', rollbackErr.message);
      }
      if (RETRYABLE.has(err.code) && attempt < maxRetries) {
        attempt += 1;
        // brief backoff with jitter
        await new Promise((r) => setTimeout(r, 25 * attempt + Math.random() * 25));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = { withTransaction, RETRYABLE };
