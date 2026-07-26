import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { getOverlappingSlotKeys } from '../utils/slot.js';
import { success, created, noData, forbidden, validationError, serverError } from '../utils/response.js';
import { emitAvailabilityUpdated } from '../services/socketService.js';
import { withTransaction } from '../utils/transaction.js';

const getDepartmentId = async (userId) => {
  const [[row]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [userId]);
  return row?.department_id ?? null;
};

// Once a shift is published, the assigned employee's availability for that
// day/slot is locked in — it can no longer be changed via availability edits.
const getLockedSlotKeys = async (userId, weekStart) => {
  const [publishedShifts] = await pool.query(
    `SELECT s.start_time, s.end_time FROM shifts s
     JOIN shift_assignments sa ON sa.shift_id = s.id
     WHERE sa.user_id = ? AND s.status = 'published'
       AND DATE(s.start_time) >= ? AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
       AND s.deleted_at IS NULL`,
    [userId, weekStart, weekStart]
  );
  const keys = new Set();
  // A shift spanning multiple slots (e.g. afternoon into evening) must lock
  // every slot it overlaps, not just the one its start time falls into.
  publishedShifts.forEach(s => {
    getOverlappingSlotKeys(s.start_time, s.end_time).forEach(k => keys.add(k));
  });
  return keys;
};

export const getAvailability = async (req, res) => {
  try {
    const { user_id, week_start } = req.query;

    // employees can only see their own availability
    if (['employee', 'shift_manager'].includes(req.user.role) && user_id !== req.user.id)
      return forbidden(res, 'Access denied. You can only view your own availability.');

    let query = 'SELECT * FROM availability WHERE 1=1';
    const params = [];

    if (user_id) {
      query += ' AND user_id = ?';
      params.push(user_id);
    }
    if (week_start) {
      query += ' AND week_start = ?';
      params.push(week_start);
    }

    query += ' ORDER BY week_start ASC, day_of_week ASC, slot ASC';

    const [rows] = await pool.query(query, params);
    if (rows.length === 0) return noData(res, 'No availability records found.', rows);
    success(res, rows);
  } catch (err) {
    serverError(res, err.message);
  }
};

// Resolves which department a team-availability query should be scoped to —
// leads can only see their own department; admins see every department by
// default and may optionally narrow to one via the department_id filter.
// `denied` carries the message to send when a lead has no department at
// all. Shared by getTeamAvailability and the /schedule/overview endpoint.
export const resolveTeamDepartmentId = async (req, requestedDepartmentId) => {
  if (req.user.role === 'lead') {
    const [depts] = await pool.query(
      'SELECT id FROM departments WHERE lead_id = ?',
      [req.user.id]
    );
    if (depts.length === 0)
      return { denied: 'You are not assigned as lead of any department.' };
    return { department_id: depts[0].id };
  }
  return { department_id: requestedDepartmentId || null };
};

// Runs the team-availability query for an already-resolved department.
// Shared by getTeamAvailability and /schedule/overview (which calls this
// once per week the current schedule view spans).
//
// Team Availability's roster is paginated (an org can have far more staff
// than fit on screen), so this resolves its own page of relevant users
// server-side — via the same department/role/search/LIMIT/OFFSET a caller
// would otherwise have to fetch from GET /users first — rather than
// requiring a precomputed user_ids list. That's what lets the frontend fire
// the roster and availability requests in parallel instead of a waterfall.
export const queryTeamAvailability = async ({ week_start, department_id, role, search, limit, offset }) => {
  const userConditions = ['deleted_at IS NULL'];
  const userParams = [];
  if (department_id) {
    userConditions.push('department_id = ?');
    userParams.push(department_id);
  }
  if (role) {
    const roles = role.split(',').filter(Boolean);
    if (roles.length > 0) {
      userConditions.push(`role IN (${roles.map(() => '?').join(',')})`);
      userParams.push(...roles);
    }
  }
  if (search) {
    userConditions.push('(name LIKE ? OR username LIKE ?)');
    const like = `%${search}%`;
    userParams.push(like, like);
  }

  let userSubquery = `SELECT id FROM users WHERE ${userConditions.join(' AND ')} ORDER BY name ASC`;
  if (limit !== undefined) {
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);
    userSubquery += ' LIMIT ? OFFSET ?';
    userParams.push(limitNum, offsetNum);
  }

  const [rows] = await pool.query(`
    SELECT
      a.week_start, a.day_of_week, a.slot, a.status,
      u.name AS user_name,
      u.username,
      u.department_id,
      u.avatar_url
    FROM availability a
    JOIN (${userSubquery}) up ON a.user_id = up.id
    JOIN users u ON a.user_id = u.id
    WHERE a.week_start = ?
    ORDER BY a.day_of_week ASC, a.slot ASC, u.name ASC
  `, [...userParams, week_start]);

  return rows;
};

export const getTeamAvailability = async (req, res) => {
  try {
    const { week_start, department_id, role, search, limit, offset } = req.query;

    if (!week_start)
      return validationError(res, 'week_start is required.');

    const resolved = await resolveTeamDepartmentId(req, department_id);
    if (resolved.denied) return forbidden(res, resolved.denied);

    const rows = await queryTeamAvailability({
      week_start, department_id: resolved.department_id, role, search, limit, offset,
    });

    if (rows.length === 0) return noData(res, 'No team availability records found.', rows);
    success(res, rows);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const submitAvailability = async (req, res) => {
  try {
    const { week_start, slots } = req.body;

    // slots is an array of { day_of_week, slot, status }
    if (!week_start || !Array.isArray(slots) || slots.length === 0)
      return validationError(res, 'week_start and slots array are required.');

    // validate week_start is a Sunday
    const date = new Date(week_start);
    if (date.getDay() !== 0)
      return validationError(res, 'week_start must be a Sunday.');

    const validSlots = ['morning', 'afternoon', 'evening'];
    const validStatuses = ['available', 'preferred', 'unavailable'];

    for (const s of slots) {
      if (s.day_of_week < 0 || s.day_of_week > 6)
        return validationError(res, 'day_of_week must be between 0 and 6.');
      if (!validSlots.includes(s.slot))
        return validationError(res, `Invalid slot: ${s.slot}`);
      if (!validStatuses.includes(s.status))
        return validationError(res, `Invalid status: ${s.status}`);
    }

    // block actual changes to slots locked by a published shift assignment.
    // The frontend always resubmits the full week's grid, so an unchanged
    // locked slot must still pass through untouched — only reject if the
    // submitted value actually differs from what's currently stored.
    const lockedKeys = await getLockedSlotKeys(req.user.id, week_start);
    if (lockedKeys.size > 0) {
      const [existingRows] = await pool.query(
        'SELECT day_of_week, slot, status FROM availability WHERE user_id = ? AND week_start = ?',
        [req.user.id, week_start]
      );
      const existingMap = {};
      existingRows.forEach(r => { existingMap[`${r.day_of_week}_${r.slot}`] = r.status; });

      for (const s of slots) {
        const key = `${s.day_of_week}_${s.slot}`;
        if (lockedKeys.has(key) && (existingMap[key] || 'available') !== s.status) {
          return validationError(res, 'Cannot modify availability for a date with a published shift assignment.');
        }
      }
    }

    // the frontend always sends the full week's grid, so replace rather than
    // upsert — otherwise a slot cleared back to the default status would
    // never actually be removed and would reappear as stale data on reload.
    // Wrapped in a transaction — otherwise a failure partway through the
    // insert loop would leave the week's availability partially wiped (old
    // rows already deleted, only some new ones written) with no rollback.
    await withTransaction(async (conn) => {
      await conn.query(
        'DELETE FROM availability WHERE user_id = ? AND week_start = ?',
        [req.user.id, week_start]
      );

      for (const s of slots) {
        const id = uuidv4();
        await conn.query(`
          INSERT INTO availability (id, user_id, week_start, day_of_week, slot, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [id, req.user.id, week_start, s.day_of_week, s.slot, s.status]);
      }
    });

    const departmentId = await getDepartmentId(req.user.id);
    emitAvailabilityUpdated(departmentId, { user_id: req.user.id, week_start });

    created(res, null, 'Availability submitted successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const deleteAvailability = async (req, res) => {
  try {
    const { week_start } = req.query;

    if (!week_start)
      return validationError(res, 'week_start is required.');

    const lockedKeys = await getLockedSlotKeys(req.user.id, week_start);
    if (lockedKeys.size > 0) {
      const [existingRows] = await pool.query(
        'SELECT day_of_week, slot FROM availability WHERE user_id = ? AND week_start = ?',
        [req.user.id, week_start]
      );
      const hasLockedRow = existingRows.some(r => lockedKeys.has(`${r.day_of_week}_${r.slot}`));
      if (hasLockedRow)
        return validationError(res, 'Cannot modify availability for a date with a published shift assignment.');
    }

    await pool.query(
      'DELETE FROM availability WHERE user_id = ? AND week_start = ?',
      [req.user.id, week_start]
    );

    const departmentId = await getDepartmentId(req.user.id);
    emitAvailabilityUpdated(departmentId, { user_id: req.user.id, week_start });

    success(res, null, 'Availability cleared for that week.');
  } catch (err) {
    serverError(res, err.message);
  }
};