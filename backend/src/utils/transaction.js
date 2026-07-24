import pool from '../../db/connection.js';

// Runs `fn(conn)` inside a single DB transaction: BEGIN, run fn, COMMIT on
// success or ROLLBACK on any thrown error — then always releases the
// connection back to the pool. `fn` must issue every query it wants
// included in the transaction through the `conn` it's given, not the
// shared `pool` (pool.query() would run outside the transaction entirely).
export const withTransaction = async (fn) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// Lets a validation/business-rule failure discovered *inside* a transaction
// (where throwing is the only way to trigger a rollback) carry which
// response envelope helper the controller should call once back outside —
// distinct from `err.code`, which mysql2 itself uses for driver errors like
// 'ER_DUP_ENTRY', so it can't double as a marker without risking collision.
export class TransactionError extends Error {
  constructor(message, kind = 'validationError') {
    super(message);
    this.kind = kind; // one of the response.js helper names, e.g. 'conflict'
  }
}
