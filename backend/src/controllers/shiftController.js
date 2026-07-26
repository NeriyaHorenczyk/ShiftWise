import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail, shiftPublishedEmail, shiftUnpublishedEmail, weekPublishedEmail, weekUnpublishedEmail } from '../utils/email.js';
import { getSlot, getOverlappingSlotKeys, toDateStr } from '../utils/slot.js';
import { success, created, updated, deleted, noData, notFound, conflict, validationError, forbidden, serverError } from '../utils/response.js';
import { withTransaction, TransactionError } from '../utils/transaction.js';
import { emitScheduleUpdated } from '../services/socketService.js';

// Resolves which department a shifts/schedule query should be scoped to,
// given the requesting user's role — employees/shift_managers are forced to
// their own department, leads to the one they lead, admins may pass any id
// (or none, for "all departments"). `denied` carries the message to send
// when the user has no department to scope to at all. Shared by
// getAllShifts and the /schedule/overview endpoint so both apply the exact
// same access rules instead of two copies drifting apart.
export const resolveShiftsDepartmentId = async (req, requestedDepartmentId) => {
  if (['employee', 'shift_manager'].includes(req.user.role)) {
    const [[me]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [req.user.id]);
    if (!me?.department_id) return { denied: 'You are not assigned to a department.' };
    return { department_id: me.department_id };
  }
  if (req.user.role === 'lead') {
    const [[dept]] = await pool.query('SELECT id FROM departments WHERE lead_id = ? AND deleted_at IS NULL', [req.user.id]);
    if (!dept?.id) return { denied: 'You are not assigned to lead a department.' };
    return { department_id: dept.id };
  }
  return { department_id: requestedDepartmentId || null };
};

// Runs the shift-list query (+ batched per-shift assignments) for an
// already-resolved department/date range/role. Shared by getAllShifts and
// the /schedule/overview endpoint so there's one source of truth for what a
// shift list response looks like.
export const queryShiftsList = async ({ department_id, week_start, start_date, end_date, status, role }) => {
  let query = `
    SELECT
      s.id, s.title, s.start_time, s.end_time,
      s.required_staff, s.needs_shift_manager, s.status,
      d.name AS department_name,
      u.name AS created_by_name,
      COUNT(sa.user_id) AS assigned_count
    FROM shifts s
    LEFT JOIN departments d ON s.department_id = d.id
    LEFT JOIN users u ON s.created_by = u.id
    LEFT JOIN shift_assignments sa ON s.id = sa.shift_id
  `;

  const conditions = ['s.deleted_at IS NULL'];
  const params = [];

  if (department_id) {
    conditions.push('s.department_id = ?');
    params.push(department_id);
  }
  // start_date/end_date give an explicit inclusive range (used by the
  // month view); week_start keeps its original fixed 7-day-window
  // behavior for existing callers.
  if (start_date && end_date) {
    conditions.push('DATE(s.start_time) >= ? AND DATE(s.start_time) <= ?');
    params.push(start_date, end_date);
  } else if (week_start) {
    conditions.push('DATE(s.start_time) >= ? AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)');
    params.push(week_start, week_start);
  }
  if (status) {
    conditions.push('s.status = ?');
    params.push(status);
  }

  // employees only see published shifts
  if (['employee', 'shift_manager'].includes(role)) {
    conditions.push('s.status = ?');
    params.push('published');
  }

  query += ' WHERE ' + conditions.join(' AND ');
  query += ' GROUP BY s.id ORDER BY s.start_time ASC';

  const [rows] = await pool.query(query, params);
  const shifts = rows.map(s => ({ ...s, needs_shift_manager: !!s.needs_shift_manager }));

  // Batch-fetch every returned shift's assignments in one extra query
  // (rather than N+1 per-shift lookups) so the schedule view has the same
  // per-employee detail getShiftById returns — the assign modal reads it
  // straight from this list instead of fetching a shift's detail on open.
  if (shifts.length > 0) {
    const shiftIds = shifts.map(s => s.id);
    const [assignmentRows] = await pool.query(`
      SELECT sa.shift_id, u.username, u.name, u.avatar_url, sa.is_shift_manager
      FROM shift_assignments sa
      JOIN users u ON sa.user_id = u.id
      WHERE sa.shift_id IN (?)
    `, [shiftIds]);

    const assignmentsByShift = new Map();
    for (const { shift_id, ...assignment } of assignmentRows) {
      if (!assignmentsByShift.has(shift_id)) assignmentsByShift.set(shift_id, []);
      assignmentsByShift.get(shift_id).push(assignment);
    }
    for (const shift of shifts) {
      shift.assignments = assignmentsByShift.get(shift.id) || [];
    }
  }

  return shifts;
};

export const getAllShifts = async (req, res) => {
  try {
    const { department_id, week_start, start_date, end_date, status } = req.query;

    const resolved = await resolveShiftsDepartmentId(req, department_id);
    if (resolved.denied) return noData(res, resolved.denied, []);

    const shifts = await queryShiftsList({
      department_id: resolved.department_id,
      week_start, start_date, end_date, status,
      role: req.user.role,
    });

    if (shifts.length === 0) return noData(res, 'No shifts found.', shifts);
    success(res, shifts);
  } catch (err) {
    serverError(res, err.message);
  }
};

// Shift + department/creator columns plus the per-employee assignments
// list, for a single shift. Shared by getShiftById and
// updateShiftAssignments (which returns the freshly-updated detail directly
// in its response, so the frontend never needs a follow-up GET).
//
// getAllShifts computes assigned_count via COUNT(); this fetches
// assignments separately instead, so it must derive the same field here —
// otherwise a caller that swaps a cached shift for this response (e.g.
// Schedule.jsx after saving assignments) loses the capacity ratio it was
// showing on the calendar card.
const fetchShiftDetail = async (id) => {
  const [shifts] = await pool.query(`
    SELECT
      s.id, s.title, s.start_time, s.end_time,
      s.required_staff, s.needs_shift_manager, s.status, s.department_id,
      d.name AS department_name,
      u.name AS created_by_name
    FROM shifts s
    LEFT JOIN departments d ON s.department_id = d.id
    LEFT JOIN users u ON s.created_by = u.id
    WHERE s.id = ? AND s.deleted_at IS NULL
  `, [id]);
  if (shifts.length === 0) return null;
  shifts[0].needs_shift_manager = !!shifts[0].needs_shift_manager;

  const [assignments] = await pool.query(`
    SELECT
      u.username, u.name, u.avatar_url,
      sa.is_shift_manager
    FROM shift_assignments sa
    JOIN users u ON sa.user_id = u.id
    WHERE sa.shift_id = ?
  `, [id]);

  return { ...shifts[0], assigned_count: assignments.length, assignments };
};

export const getShiftById = async (req, res) => {
  try {
    const detail = await fetchShiftDetail(req.params.id);
    if (!detail) return notFound(res, 'Shift not found.');

    // employees and shift managers can only view published shifts in their own department
    if (['employee', 'shift_manager'].includes(req.user.role)) {
      const [[me]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [req.user.id]);
      if (detail.department_id !== me?.department_id || detail.status !== 'published')
        return forbidden(res, 'Access denied.');
    } else if (req.user.role === 'lead') {
      // a lead can view drafts too, but only within their own department
      const [[dept]] = await pool.query('SELECT id FROM departments WHERE lead_id = ? AND deleted_at IS NULL', [req.user.id]);
      if (detail.department_id !== dept?.id)
        return forbidden(res, 'Access denied.');
    }

    success(res, detail);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const getMyShifts = async (req, res) => {
  try {
    const { week_start, start_date, end_date } = req.query;

    let query = `
      SELECT
        s.id, s.title, s.start_time, s.end_time,
        s.required_staff, s.status,
        d.name AS department_name,
        sa.is_shift_manager,
        COUNT(sa2.user_id) AS assigned_count,
        EXISTS(
          SELECT 1 FROM swap_requests swr
          WHERE swr.shift_id = s.id AND swr.requester_id = ? AND swr.status = 'pending' AND swr.deleted_at IS NULL
        ) AS has_pending_swap
      FROM shift_assignments sa
      JOIN shifts s ON sa.shift_id = s.id
      JOIN departments d ON s.department_id = d.id
      LEFT JOIN shift_assignments sa2 ON s.id = sa2.shift_id
      WHERE sa.user_id = ?
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    `;

    // A correlated EXISTS subquery (rather than a LEFT JOIN onto
    // swap_requests) so it can never fan out the sa2 join above and inflate
    // assigned_count — has_pending_swap lets the swap-request modal show a
    // "pending" state and skip re-opening a duplicate form for a shift that
    // already has one outstanding, instead of only finding out via a 409
    // from the server after the fact.
    const params = [req.user.id, req.user.id];

    // start_date/end_date give an explicit inclusive range (used by the
    // month view, which spans a variable number of days); week_start keeps
    // its original fixed 7-day-window behavior for existing callers.
    if (start_date && end_date) {
      query += ` AND DATE(s.start_time) >= ? AND DATE(s.start_time) <= ?`;
      params.push(start_date, end_date);
    } else if (week_start) {
      query += ` AND DATE(s.start_time) >= ? AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)`;
      params.push(week_start, week_start);
    }

    query += ' GROUP BY s.id, sa.is_shift_manager ORDER BY s.start_time ASC';

    const [rawRows] = await pool.query(query, params);
    const rows = rawRows.map(r => ({ ...r, has_pending_swap: !!r.has_pending_swap }));

    // Batch-fetch each returned shift's assigned usernames (rather than a
    // per-shift lookup) so the swap-request modal can filter out colleagues
    // already on the shift straight from this list — same reasoning as
    // getAllShifts's assignments batch — instead of it fetching
    // GET /shifts/:id itself when opened. createSwap re-validates this
    // server-side regardless, so this list only needs to be good enough to
    // drive the dropdown, not a security boundary.
    if (rows.length > 0) {
      const shiftIds = rows.map(s => s.id);
      const [assignmentRows] = await pool.query(
        `SELECT sa.shift_id, u.username
         FROM shift_assignments sa
         JOIN users u ON sa.user_id = u.id
         WHERE sa.shift_id IN (?)`,
        [shiftIds]
      );

      const assignedUsernamesByShift = new Map();
      for (const { shift_id, username } of assignmentRows) {
        if (!assignedUsernamesByShift.has(shift_id)) assignedUsernamesByShift.set(shift_id, []);
        assignedUsernamesByShift.get(shift_id).push(username);
      }
      for (const row of rows) {
        row.assigned_usernames = assignedUsernamesByShift.get(row.id) || [];
      }
    }

    if (rows.length === 0) return noData(res, 'No shifts found.', rows);
    success(res, rows);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const createShift = async (req, res) => {
  try {
    const { department_id, title, start_time, end_time, required_staff } = req.body;

    if (!department_id || !title || !start_time || !end_time)
      return validationError(res, 'department_id, title, start_time and end_time are required.');

    if (new Date(start_time) >= new Date(end_time))
      return validationError(res, 'start_time must be before end_time.');

    if (new Date(end_time) <= new Date())
      return validationError(res, 'Cannot create a shift that has already ended.');

    // verify the target department exists and hasn't been soft-deleted, and
    // (for a lead) that it's the one they manage
    const [depts] = await pool.query(
      'SELECT lead_id FROM departments WHERE id = ? AND deleted_at IS NULL',
      [department_id]
    );
    if (depts.length === 0)
      return notFound(res, 'Department not found.');
    if (req.user.role === 'lead') {
      if (depts[0].lead_id !== req.user.id)
        return forbidden(res, 'You can only create shifts for your own department.');
    }

    const [overlapping] = await pool.query(
      `SELECT id FROM shifts WHERE department_id = ? AND start_time < ? AND end_time > ? AND deleted_at IS NULL`,
      [department_id, end_time, start_time]
    );
    if (overlapping.length > 0)
      return conflict(res, 'This shift overlaps with an existing shift in this department.');

    const id = uuidv4();
    // Every shift requires a shift manager — there is no per-shift opt-out,
    // so this is always 1 regardless of what the client sends.
    await pool.query(
      `INSERT INTO shifts (id, department_id, title, start_time, end_time, required_staff, needs_shift_manager, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, department_id, title, start_time, end_time, required_staff || 1, req.user.id]
    );

    emitScheduleUpdated(department_id, { reason: 'created', shiftId: id });
    created(res, { id }, 'Shift created successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const updateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, start_time, end_time, required_staff } = req.body;

    const [shifts] = await pool.query('SELECT * FROM shifts WHERE id = ? AND deleted_at IS NULL', [id]);
    if (shifts.length === 0)
      return notFound(res, 'Shift not found.');

    if (shifts[0].status === 'published')
      return validationError(res, 'Cannot edit a published shift. Unpublish it first.');

    if (start_time && end_time && new Date(start_time) >= new Date(end_time))
      return validationError(res, 'start_time must be before end_time.');

    const effectiveStart = start_time || shifts[0].start_time;
    const effectiveEnd = end_time || shifts[0].end_time;

    if (new Date(effectiveEnd) <= new Date())
      return validationError(res, 'Cannot set a shift to end in the past.');

    const [overlapping] = await pool.query(
      `SELECT id FROM shifts WHERE department_id = ? AND id != ? AND start_time < ? AND end_time > ? AND deleted_at IS NULL`,
      [shifts[0].department_id, id, effectiveEnd, effectiveStart]
    );
    if (overlapping.length > 0)
      return conflict(res, 'This shift overlaps with an existing shift in this department.');

    // Every shift requires a shift manager, forced true on every update too —
    // this corrects any shift left over from before this was mandatory.
    await pool.query(
      `UPDATE shifts SET
        title = COALESCE(?, title),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        required_staff = COALESCE(?, required_staff),
        needs_shift_manager = 1
      WHERE id = ?`,
      [title || null, start_time || null, end_time || null, required_staff || null, id]
    );

    emitScheduleUpdated(shifts[0].department_id, { reason: 'updated', shiftId: id });
    updated(res, null, 'Shift updated successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const deleteShift = async (req, res) => {
  try {
    const { id } = req.params;

    const [shifts] = await pool.query('SELECT id, department_id FROM shifts WHERE id = ? AND deleted_at IS NULL', [id]);
    if (shifts.length === 0)
      return notFound(res, 'Shift not found.');

    // Soft delete — swap_requests/shift_assignments reference this shift by
    // id and a hard DELETE's ON DELETE CASCADE would silently wipe those
    // historical records along with it.
    await pool.query('UPDATE shifts SET deleted_at = NOW() WHERE id = ?', [id]);
    emitScheduleUpdated(shifts[0].department_id, { reason: 'deleted', shiftId: id });
    deleted(res, 'Shift deleted successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const restoreShift = async (req, res) => {
  try {
    const { id } = req.params;

    const [shifts] = await pool.query(
      'SELECT * FROM shifts WHERE id = ? AND deleted_at IS NOT NULL',
      [id]
    );
    if (shifts.length === 0)
      return notFound(res, 'Deleted shift not found.');
    const shift = shifts[0];

    const [overlapping] = await pool.query(
      'SELECT id FROM shifts WHERE department_id = ? AND id != ? AND start_time < ? AND end_time > ? AND deleted_at IS NULL',
      [shift.department_id, id, shift.end_time, shift.start_time]
    );
    if (overlapping.length > 0)
      return conflict(res, 'This shift overlaps with an existing shift in this department — cannot restore.');

    await pool.query('UPDATE shifts SET deleted_at = NULL WHERE id = ?', [id]);
    emitScheduleUpdated(shift.department_id, { reason: 'restored', shiftId: id });
    updated(res, null, 'Shift restored successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const publishShift = async (req, res) => {
  try {
    const { id } = req.params;

    const [shifts] = await pool.query(
      'SELECT * FROM shifts WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (shifts.length === 0)
      return notFound(res, 'Shift not found.');
    if (shifts[0].status === 'published')
      return validationError(res, 'Shift is already published.');

    const [assignments] = await pool.query(
      'SELECT id, is_shift_manager FROM shift_assignments WHERE shift_id = ?',
      [id]
    );
    if (assignments.length === 0)
      return validationError(res, 'Cannot publish a shift with no assigned employees.');
    // Every shift requires a shift manager — there is no per-shift opt-out.
    if (!assignments.some(a => a.is_shift_manager))
      return validationError(res, 'Cannot publish — assign a shift manager first.');

    await pool.query(
      'UPDATE shifts SET status = ? WHERE id = ?',
      ['published', id]
    );

    // email assigned employees (skip any who've since been deleted)
    const [employees] = await pool.query(
      `SELECT u.email, u.name FROM shift_assignments sa
       JOIN users u ON sa.user_id = u.id WHERE sa.shift_id = ? AND u.deleted_at IS NULL`,
      [id]
    );
    await Promise.all(employees.map((emp) =>
      sendEmail(emp.email, `Shift published — ${shifts[0].title}`, shiftPublishedEmail(emp.name, shifts[0]))
    ));

    emitScheduleUpdated(shifts[0].department_id, { reason: 'published', shiftId: id });
    updated(res, null, 'Shift published successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
}

export const unpublishShift = async (req, res) => {
  try {
    const { id } = req.params;
    const [shifts] = await pool.query('SELECT * FROM shifts WHERE id = ? AND deleted_at IS NULL', [id]);
    if (shifts.length === 0)
      return notFound(res, 'Shift not found.');
    if (shifts[0].status === 'draft')
      return validationError(res, 'Shift is already a draft.');

    // email assigned employees before status changes (shifts[0] still has the
    // data); skip any who've since been deleted
    const [employees] = await pool.query(
      `SELECT u.email, u.name FROM shift_assignments sa
       JOIN users u ON sa.user_id = u.id WHERE sa.shift_id = ? AND u.deleted_at IS NULL`,
      [id]
    );

    await pool.query('UPDATE shifts SET status = ? WHERE id = ?', ['draft', id]);

    await Promise.all(employees.map((emp) =>
      sendEmail(emp.email, `Shift update — ${shifts[0].title}`, shiftUnpublishedEmail(emp.name, shifts[0]))
    ));

    emitScheduleUpdated(shifts[0].department_id, { reason: 'unpublished', shiftId: id });
    updated(res, null, 'Shift unpublished successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const assignEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, is_shift_manager } = req.body;

    if (!user_id)
      return validationError(res, 'user_id is required.');

    const [shifts] = await pool.query('SELECT * FROM shifts WHERE id = ? AND deleted_at IS NULL', [id]);
    if (shifts.length === 0)
      return notFound(res, 'Shift not found.');

    const [users] = await pool.query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [user_id]);
    if (users.length === 0)
      return notFound(res, 'User not found.');

    const shiftStart = new Date(shifts[0].start_time);
    const shiftEnd = new Date(shifts[0].end_time);
    const shiftDateStr = toDateStr(shiftStart);
    const weekStart = new Date(shiftStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    // A shift can span more than one slot (e.g. starting in the afternoon
    // and ending in the evening) — the employee must be available across
    // every slot it overlaps, not just the one its start time falls into.
    const overlappingKeys = getOverlappingSlotKeys(shiftStart, shiftEnd);
    const [avail] = await pool.query(
      `SELECT day_of_week, slot, status FROM availability
       WHERE user_id = ? AND week_start = ?`,
      [user_id, toDateStr(weekStart)]
    );
    const isUnavailable = avail.some(a =>
      overlappingKeys.has(`${a.day_of_week}_${a.slot}`) && a.status === 'unavailable'
    );
    if (isUnavailable)
      return validationError(res, 'This employee marked themselves unavailable for this shift.');

    const [onLeave] = await pool.query(
      `SELECT id FROM leave_requests
       WHERE user_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ? AND deleted_at IS NULL`,
      [user_id, shiftDateStr, shiftDateStr]
    );
    if (onLeave.length > 0)
      return validationError(res, 'This employee is on approved leave for this date.');

    // reject a double-booking onto any other (non-deleted) shift whose time
    // range overlaps this one — autoAssign already enforces this via its
    // own busyMap/overlaps() check, but the manual path had no equivalent.
    const [overlapping] = await pool.query(
      `SELECT sa.id FROM shift_assignments sa
       JOIN shifts s ON sa.shift_id = s.id
       WHERE sa.user_id = ? AND s.id != ? AND s.deleted_at IS NULL
         AND s.start_time < ? AND s.end_time > ?`,
      [user_id, id, shifts[0].end_time, shifts[0].start_time]
    );
    if (overlapping.length > 0)
      return validationError(res, 'This employee is already assigned to another shift that overlaps this time window.');

    // only shift_managers can be assigned as shift manager
    if (is_shift_manager && users[0].role !== 'shift_manager')
      return validationError(res, 'Only shift managers can be assigned as shift manager for a shift.');

    try {
      await withTransaction(async (conn) => {
        // Lock the shift row itself first — that's what actually serializes
        // two concurrent assign calls against each other, including the
        // case where the shift currently has zero assignments (locking only
        // the shift_assignments rows wouldn't block a concurrent INSERT,
        // since there'd be no existing row for that lock to apply to).
        const [[lockedShift]] = await conn.query(
          'SELECT required_staff FROM shifts WHERE id = ? FOR UPDATE',
          [id]
        );

        const [existingAssignments] = await conn.query(
          'SELECT is_shift_manager FROM shift_assignments WHERE shift_id = ?',
          [id]
        );

        if (existingAssignments.length >= lockedShift.required_staff)
          throw new TransactionError('This shift is already at full capacity.', 'validationError');

        if (is_shift_manager && existingAssignments.some(a => a.is_shift_manager))
          throw new TransactionError('This shift already has a shift manager assigned.', 'conflict');

        await conn.query(
          'INSERT INTO shift_assignments (id, shift_id, user_id, is_shift_manager) VALUES (?, ?, ?, ?)',
          [uuidv4(), id, user_id, is_shift_manager || false]
        );
      });
    } catch (err) {
      if (err instanceof TransactionError) {
        return err.kind === 'conflict' ? conflict(res, err.message) : validationError(res, err.message);
      }
      throw err;
    }

    emitScheduleUpdated(shifts[0].department_id, { reason: 'assigned', shiftId: id });
    created(res, null, 'Employee assigned successfully.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return conflict(res, 'Employee is already assigned to this shift.');
    serverError(res, err.message);
  }
};

// Replaces a shift's entire assignment list — and optionally publishes it —
// in a single transaction/request, instead of the Schedule assign modal's
// old Save/Publish flow, which looped one POST /assign or DELETE /assign
// per changed employee (each separately broadcasting a schedule:updated
// event and triggering every connected client's live-sync listener to
// refetch GET /shifts) followed by a second request just to flip the
// status. Runs the same per-employee validation assignEmployee does
// (availability, approved leave, double-booking, shift-manager role), just
// batched against the desired end state instead of one HTTP call at a time.
export const updateShiftAssignments = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignments, publish } = req.body;

    if (!Array.isArray(assignments))
      return validationError(res, 'assignments must be an array.');
    if (assignments.some(a => !a.user_id))
      return validationError(res, 'Each assignment requires a user_id.');

    const desiredUserIds = assignments.map(a => a.user_id);
    if (new Set(desiredUserIds).size !== desiredUserIds.length)
      return validationError(res, 'Duplicate user_id in assignments.');
    if (assignments.filter(a => a.is_shift_manager).length > 1)
      return validationError(res, 'A shift can only have one shift manager.');

    const [shifts] = await pool.query('SELECT * FROM shifts WHERE id = ? AND deleted_at IS NULL', [id]);
    if (shifts.length === 0) return notFound(res, 'Shift not found.');
    const shift = shifts[0];

    if (publish && shift.status === 'published')
      return validationError(res, 'Shift is already published.');

    const shiftStart = new Date(shift.start_time);
    const shiftEnd = new Date(shift.end_time);
    const shiftDateStr = toDateStr(shiftStart);
    const weekStart = new Date(shiftStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = toDateStr(weekStart);
    const overlappingKeys = getOverlappingSlotKeys(shiftStart, shiftEnd);

    try {
      await withTransaction(async (conn) => {
        // Same row lock assignEmployee takes — serializes concurrent
        // assignment changes against this shift, including the case where
        // it currently has zero assignments.
        const [[lockedShift]] = await conn.query(
          'SELECT required_staff FROM shifts WHERE id = ? FOR UPDATE',
          [id]
        );

        if (assignments.length > lockedShift.required_staff)
          throw new TransactionError('This shift is already at full capacity.', 'validationError');

        const [currentAssignments] = await conn.query(
          'SELECT user_id FROM shift_assignments WHERE shift_id = ?',
          [id]
        );
        const currentUserIds = new Set(currentAssignments.map(a => a.user_id));
        const toAdd = assignments.filter(a => !currentUserIds.has(a.user_id));
        const toRemove = [...currentUserIds].filter(uid => !desiredUserIds.includes(uid));

        // Only newly-added employees need (re-)validating — anyone already
        // assigned and staying assigned already passed these checks when
        // they were originally added.
        if (toAdd.length > 0) {
          const toAddIds = toAdd.map(a => a.user_id);

          const [users] = await conn.query(
            'SELECT id, name, role FROM users WHERE id IN (?) AND deleted_at IS NULL',
            [toAddIds]
          );
          const usersById = new Map(users.map(u => [u.id, u]));

          for (const a of toAdd) {
            const user = usersById.get(a.user_id);
            if (!user)
              throw new TransactionError('User not found.', 'validationError');
            if (a.is_shift_manager && user.role !== 'shift_manager')
              throw new TransactionError('Only shift managers can be assigned as shift manager for a shift.', 'validationError');
          }

          const [avail] = await conn.query(
            'SELECT user_id, day_of_week, slot, status FROM availability WHERE week_start = ? AND user_id IN (?)',
            [weekStartStr, toAddIds]
          );
          const [onLeave] = await conn.query(
            `SELECT DISTINCT user_id FROM leave_requests
             WHERE status = 'approved' AND start_date <= ? AND end_date >= ? AND deleted_at IS NULL AND user_id IN (?)`,
            [shiftDateStr, shiftDateStr, toAddIds]
          );
          const onLeaveIds = new Set(onLeave.map(r => r.user_id));
          const [overlapping] = await conn.query(
            `SELECT DISTINCT sa.user_id FROM shift_assignments sa
             JOIN shifts s ON sa.shift_id = s.id
             WHERE sa.user_id IN (?) AND s.id != ? AND s.deleted_at IS NULL
               AND s.start_time < ? AND s.end_time > ?`,
            [toAddIds, id, shift.end_time, shift.start_time]
          );
          const overlappingIds = new Set(overlapping.map(r => r.user_id));

          for (const a of toAdd) {
            const isUnavailable = avail.some(row =>
              row.user_id === a.user_id &&
              overlappingKeys.has(`${row.day_of_week}_${row.slot}`) &&
              row.status === 'unavailable'
            );
            if (isUnavailable)
              throw new TransactionError(
                `${usersById.get(a.user_id)?.name || 'This employee'} marked themselves unavailable for this shift.`,
                'validationError'
              );
            if (onLeaveIds.has(a.user_id))
              throw new TransactionError('This employee is on approved leave for this date.', 'validationError');
            if (overlappingIds.has(a.user_id))
              throw new TransactionError('This employee is already assigned to another shift that overlaps this time window.', 'validationError');
          }
        }

        if (toRemove.length > 0) {
          await conn.query('DELETE FROM shift_assignments WHERE shift_id = ? AND user_id IN (?)', [id, toRemove]);
        }
        for (const a of toAdd) {
          await conn.query(
            'INSERT INTO shift_assignments (id, shift_id, user_id, is_shift_manager) VALUES (?, ?, ?, ?)',
            [uuidv4(), id, a.user_id, !!a.is_shift_manager]
          );
        }

        if (publish) {
          if (assignments.length === 0)
            throw new TransactionError('Cannot publish a shift with no assigned employees.', 'validationError');
          if (!assignments.some(a => a.is_shift_manager))
            throw new TransactionError('Cannot publish — assign a shift manager first.', 'validationError');
          await conn.query('UPDATE shifts SET status = ? WHERE id = ?', ['published', id]);
        }
      });
    } catch (err) {
      if (err instanceof TransactionError) {
        return err.kind === 'conflict' ? conflict(res, err.message) : validationError(res, err.message);
      }
      throw err;
    }

    if (publish) {
      // email newly-published shift's assigned employees (skip any who've
      // since been deleted) — same as the standalone publishShift endpoint.
      const [employees] = await pool.query(
        `SELECT u.email, u.name FROM shift_assignments sa
         JOIN users u ON sa.user_id = u.id WHERE sa.shift_id = ? AND u.deleted_at IS NULL`,
        [id]
      );
      await Promise.all(employees.map((emp) =>
        sendEmail(emp.email, `Shift published — ${shift.title}`, shiftPublishedEmail(emp.name, shift))
      ));
    }

    // One event for the whole batched operation — not one per assignment —
    // so every connected client (including this one, via its own live-sync
    // listener) refetches exactly once.
    emitScheduleUpdated(shift.department_id, { reason: publish ? 'published' : 'assigned', shiftId: id });

    const detail = await fetchShiftDetail(id);
    success(res, detail, publish ? 'Shift published successfully.' : 'Assignments updated successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

const overlaps = (busyList, start, end) =>
  busyList.some(b => b.start < end && b.end > start);

// Hard ceiling on hours auto-assign will pile onto one person in a single
// week, regardless of how strongly they prefer every remaining open slot —
// without this, the greedy preference-first pass has no reason not to keep
// stacking the same high-preference employee across the whole week.
const MAX_WEEKLY_HOURS = 40;

const hoursBetween = (start, end) => (end - start) / (1000 * 60 * 60);

export const autoAssign = async (req, res) => {
  try {
    const { department_id, week_start } = req.body;
    if (!department_id || !week_start) {
      return validationError(res, 'department_id and week_start are required.');
    }

    const [[lead]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [req.user.id]);
    if (!lead || lead.department_id !== department_id) {
      return forbidden(res, 'You do not manage this department.');
    }

    // 1. Draft shifts that still need more staff
    const [shifts] = await pool.query(
      `SELECT s.id, s.title, s.start_time, s.end_time, s.required_staff,
              COUNT(sa.id) AS assigned_count,
              COALESCE(SUM(sa.is_shift_manager), 0) AS sm_count
       FROM shifts s
       LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
       WHERE s.department_id = ?
         AND s.status = 'draft'
         AND s.deleted_at IS NULL
         AND DATE(s.start_time) >= ?
         AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
       GROUP BY s.id
       HAVING assigned_count < s.required_staff
       ORDER BY s.start_time`,
      [department_id, week_start, week_start]
    );

    if (shifts.length === 0) {
      // `message` is deliberately kept inside `data` here (not just the
      // envelope's own message) — the frontend reads result.message as a
      // fallback display string when there's nothing else to show.
      return success(res, { assigned: 0, message: 'All draft shifts are already fully staffed.' }, 'All draft shifts are already fully staffed.');
    }

    // 2. Employees in the department
    const [employees] = await pool.query(
      `SELECT id, role FROM users
       WHERE department_id = ? AND role IN ('employee', 'shift_manager') AND deleted_at IS NULL`,
      [department_id]
    );

    if (employees.length === 0) {
      return success(res, { assigned: 0, message: 'No employees in this department.' }, 'No employees in this department.');
    }

    const employeeIds = employees.map(e => e.id);

    // 3. Availability for the week
    const [availability] = await pool.query(
      `SELECT user_id, day_of_week, slot, status
       FROM availability
       WHERE week_start = ? AND user_id IN (?)`,
      [week_start, employeeIds]
    );

    // availMap: `${userId}_${dayOfWeek}_${slot}` -> raw status string
    const availMap = {};
    for (const a of availability) {
      availMap[`${a.user_id}_${a.day_of_week}_${a.slot}`] = a.status;
    }

    // 3b. Employees on approved leave any day this week must never be auto-assigned that day
    const [approvedLeave] = await pool.query(
      `SELECT user_id, start_date, end_date FROM leave_requests
       WHERE status = 'approved' AND user_id IN (?)
         AND start_date <= DATE_ADD(?, INTERVAL 6 DAY) AND end_date >= ? AND deleted_at IS NULL`,
      [employeeIds, week_start, week_start]
    );
    const isOnApprovedLeave = (userId, date) => {
      const dateStr = toDateStr(date);
      return approvedLeave.some(l => l.user_id === userId && l.start_date <= dateStr && l.end_date >= dateStr);
    };

    // 4. All shifts this week to detect overlaps with already-assigned shifts
    const [allWeekShifts] = await pool.query(
      `SELECT id, start_time, end_time FROM shifts
       WHERE department_id = ?
         AND deleted_at IS NULL
         AND DATE(start_time) >= ?
         AND DATE(start_time) < DATE_ADD(?, INTERVAL 7 DAY)`,
      [department_id, week_start, week_start]
    );

    // busyMap: userId -> [{start, end}]
    const busyMap = {};
    for (const e of employees) busyMap[e.id] = [];

    if (allWeekShifts.length > 0) {
      const allIds = allWeekShifts.map(s => s.id);
      const [existing] = await pool.query(
        `SELECT sa.user_id, s.start_time, s.end_time
         FROM shift_assignments sa
         JOIN shifts s ON sa.shift_id = s.id
         WHERE sa.shift_id IN (?)`,
        [allIds]
      );
      for (const a of existing) {
        if (busyMap[a.user_id]) {
          busyMap[a.user_id].push({ start: new Date(a.start_time), end: new Date(a.end_time) });
        }
      }
    }

    const empRole = {};
    const workload = {}; // tracks total HOURS assigned this week per employee — a
    // shift-count tally would treat a 2-hour and a 10-hour shift as equally
    // "fair", which is exactly the imbalance this is meant to prevent.
    for (const e of employees) {
      empRole[e.id] = e.role;
      // pre-load with hours already committed via existing assignments
      workload[e.id] = busyMap[e.id].reduce((sum, b) => sum + hoursBetween(b.start, b.end), 0);
    }

    // Precompute each shift's slot/day/remaining-openings/duration once.
    const shiftMeta = shifts.map(shift => {
      const shiftStart = new Date(shift.start_time);
      const shiftEnd = new Date(shift.end_time);
      return {
        shift,
        shiftStart,
        shiftEnd,
        dayOfWeek: shiftStart.getDay(),
        slot: getSlot(shiftStart.getHours()),
        openSlots: shift.required_staff - Number(shift.assigned_count),
        hasSmAssigned: Number(shift.sm_count) > 0,
        durationHours: hoursBetween(shiftStart, shiftEnd),
      };
    });

    const scoreFor = (userId, dayOfWeek, slot) => {
      const status = availMap[`${userId}_${dayOfWeek}_${slot}`];
      if (status === 'preferred') return 3;
      if (status === 'available') return 2;
      return 0;
    };

    const newAssignments = [];

    // Pass 1: every shift still missing a shift manager gets one first —
    // matched to whichever eligible shift manager prefers that slot most —
    // so a hard business requirement (a shift needs an SM to publish) is
    // never left to chance in the general preference-matching pass below.
    for (const meta of shiftMeta) {
      if (meta.hasSmAssigned || meta.openSlots <= 0) continue;

      const smCandidates = employees
        .filter(e => empRole[e.id] === 'shift_manager')
        .filter(e => !overlaps(busyMap[e.id] || [], meta.shiftStart, meta.shiftEnd))
        .filter(e => availMap[`${e.id}_${meta.dayOfWeek}_${meta.slot}`] !== 'unavailable')
        .filter(e => !isOnApprovedLeave(e.id, meta.shiftStart))
        .filter(e => (workload[e.id] || 0) + meta.durationHours <= MAX_WEEKLY_HOURS)
        .map(e => ({ id: e.id, score: scoreFor(e.id, meta.dayOfWeek, meta.slot), workload: workload[e.id] || 0 }))
        .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.workload - b.workload));

      const chosen = smCandidates[0];
      if (!chosen) continue;

      newAssignments.push([uuidv4(), meta.shift.id, chosen.id, 1]);
      busyMap[chosen.id].push({ start: meta.shiftStart, end: meta.shiftEnd });
      workload[chosen.id] = (workload[chosen.id] || 0) + meta.durationHours;
      meta.hasSmAssigned = true;
      meta.openSlots--;
    }

    // Pass 2: fill remaining openings with a global preference-first greedy
    // match. Building every (shift, employee) pair and always taking the
    // single best-scoring pair next — rather than filling one shift
    // completely before moving to the next — is what lets someone who
    // prefers evenings land there even when a morning shift happens to be
    // processed first, freeing that morning slot for someone else.
    let pairs = [];
    for (const meta of shiftMeta) {
      if (meta.openSlots <= 0) continue;
      for (const e of employees) {
        if (overlaps(busyMap[e.id] || [], meta.shiftStart, meta.shiftEnd)) continue;
        const status = availMap[`${e.id}_${meta.dayOfWeek}_${meta.slot}`];
        if (status === 'unavailable') continue;
        if (isOnApprovedLeave(e.id, meta.shiftStart)) continue;
        if ((workload[e.id] || 0) + meta.durationHours > MAX_WEEKLY_HOURS) continue;
        pairs.push({ meta, employeeId: e.id, score: scoreFor(e.id, meta.dayOfWeek, meta.slot) });
      }
    }

    while (pairs.length > 0) {
      pairs.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (workload[a.employeeId] || 0) - (workload[b.employeeId] || 0);
      });

      const best = pairs[0];
      newAssignments.push([uuidv4(), best.meta.shift.id, best.employeeId, 0]);
      busyMap[best.employeeId].push({ start: best.meta.shiftStart, end: best.meta.shiftEnd });
      workload[best.employeeId] = (workload[best.employeeId] || 0) + best.meta.durationHours;
      best.meta.openSlots--;

      // drop pairs that are no longer valid: this shift is now full, this
      // employee now conflicts with a shift they were just assigned to, or
      // this assignment would push them over the weekly hours cap
      pairs = pairs.filter(p =>
        p.meta.openSlots > 0 &&
        !overlaps(busyMap[p.employeeId] || [], p.meta.shiftStart, p.meta.shiftEnd) &&
        (workload[p.employeeId] || 0) + p.meta.durationHours <= MAX_WEEKLY_HOURS
      );
    }

    // Auto-assign is all-or-nothing per shift: a shift that still can't get a
    // shift manager, or still can't reach required_staff even after both
    // passes above, is skipped entirely — any tentative assignments made for
    // it in this run are dropped rather than left half-staffed. Whoever would
    // have filled it just stays unused for this run instead of being
    // reshuffled onto other shifts, which keeps this a simple, predictable
    // one-pass filter instead of a cascading re-solve.
    const byShift = {};
    for (const a of newAssignments) {
      const shiftId = a[1];
      if (!byShift[shiftId]) byShift[shiftId] = [];
      byShift[shiftId].push(a);
    }

    const failures = [];
    const finalAssignments = [];
    for (const meta of shiftMeta) {
      if (!meta.hasSmAssigned) {
        failures.push({ title: meta.shift.title, reason: 'no eligible shift manager available' });
        continue;
      }
      if (meta.openSlots > 0) {
        failures.push({ title: meta.shift.title, reason: 'not enough available workers to meet required staff' });
        continue;
      }
      finalAssignments.push(...(byShift[meta.shift.id] || []));
    }

    if (finalAssignments.length > 0) {
      // A single statement is already atomic, but running it through the
      // same transaction helper keeps this consistent with every other
      // multi-row write and gives it an explicit rollback path if the
      // driver throws partway (e.g. a dropped connection mid-insert).
      await withTransaction(async (conn) => {
        await conn.query(
          'INSERT INTO shift_assignments (id, shift_id, user_id, is_shift_manager) VALUES ?',
          [finalAssignments]
        );
      });
    }

    if (finalAssignments.length > 0) {
      emitScheduleUpdated(department_id, { reason: 'auto-assigned' });
    }

    success(res, {
      assigned: finalAssignments.length,
      noAvailability: availability.length === 0,
      failures,
    }, 'Auto-assign complete.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const bulkClear = async (req, res) => {
  try {
    const { department_id, week_start } = req.body;
    if (!department_id || !week_start) {
      return validationError(res, 'department_id and week_start are required.');
    }

    const [[user]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [req.user.id]);
    if (!user || user.department_id !== department_id) {
      return forbidden(res, 'You do not manage this department.');
    }

    // Soft delete — same reasoning as deleteShift: preserves audit/recovery
    // capability for bulk-cleared drafts instead of hard-wiping them.
    const [result] = await pool.query(
      `UPDATE shifts
       SET deleted_at = NOW()
       WHERE department_id = ?
         AND status = 'draft'
         AND deleted_at IS NULL
         AND DATE(start_time) >= ?
         AND DATE(start_time) < DATE_ADD(?, INTERVAL 7 DAY)`,
      [department_id, week_start, week_start]
    );

    if (result.affectedRows > 0) {
      emitScheduleUpdated(department_id, { reason: 'bulk-cleared' });
    }
    success(res, { deleted: result.affectedRows }, 'Draft shifts cleared.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const bulkPublish = async (req, res) => {
  try {
    const { department_id, week_start } = req.body;
    if (!department_id || !week_start) {
      return validationError(res, 'department_id and week_start are required.');
    }

    const [[user]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [req.user.id]);
    if (!user || user.department_id !== department_id) {
      return forbidden(res, 'You do not manage this department.');
    }

    const [result] = await pool.query(
      `UPDATE shifts s
       SET s.status = 'published'
       WHERE s.department_id = ?
         AND s.status = 'draft'
         AND s.deleted_at IS NULL
         AND DATE(s.start_time) >= ?
         AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
         AND EXISTS (SELECT 1 FROM shift_assignments sa WHERE sa.shift_id = s.id AND sa.is_shift_manager = 1)`,
      [department_id, week_start, week_start]
    );

    const [[{ skipped }]] = await pool.query(
      `SELECT COUNT(*) AS skipped FROM shifts
       WHERE department_id = ?
         AND status = 'draft'
         AND deleted_at IS NULL
         AND DATE(start_time) >= ?
         AND DATE(start_time) < DATE_ADD(?, INTERVAL 7 DAY)`,
      [department_id, week_start, week_start]
    );

    // email each employee once listing all their shifts for the week
    // (skip any who've since been deleted)
    if (result.affectedRows > 0) {
      const [rows] = await pool.query(
        `SELECT s.title, s.start_time, s.end_time,
                u.id AS user_id, u.email, u.name AS user_name
         FROM shifts s
         JOIN shift_assignments sa ON sa.shift_id = s.id
         JOIN users u ON u.id = sa.user_id
         WHERE s.department_id = ?
           AND s.status = 'published'
           AND s.deleted_at IS NULL
           AND u.deleted_at IS NULL
           AND DATE(s.start_time) >= ?
           AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
         ORDER BY s.start_time`,
        [department_id, week_start, week_start]
      );
      // group shifts by employee
      const byEmployee = {};
      for (const r of rows) {
        if (!byEmployee[r.user_id]) {
          byEmployee[r.user_id] = { email: r.email, name: r.user_name, shifts: [] };
        }
        byEmployee[r.user_id].shifts.push({ title: r.title, start_time: r.start_time, end_time: r.end_time });
      }
      await Promise.all(Object.values(byEmployee).map((emp) =>
        sendEmail(emp.email, 'Your schedule has been published', weekPublishedEmail(emp.name, emp.shifts))
      ));
    }

    if (result.affectedRows > 0) {
      emitScheduleUpdated(department_id, { reason: 'bulk-published' });
    }
    success(res, { published: result.affectedRows, skipped: Number(skipped) }, 'Shifts published.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const bulkUnpublish = async (req, res) => {
  try {
    const { department_id, week_start } = req.body;
    if (!department_id || !week_start) {
      return validationError(res, 'department_id and week_start are required.');
    }

    const [[user]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [req.user.id]);
    if (!user || user.department_id !== department_id) {
      return forbidden(res, 'You do not manage this department.');
    }

    // collect affected employees BEFORE updating (skip any since-deleted users)
    const [rows] = await pool.query(
      `SELECT s.title, s.start_time, s.end_time,
              u.id AS user_id, u.email, u.name AS user_name
       FROM shifts s
       JOIN shift_assignments sa ON sa.shift_id = s.id
       JOIN users u ON u.id = sa.user_id
       WHERE s.department_id = ?
         AND s.status = 'published'
         AND s.deleted_at IS NULL
         AND u.deleted_at IS NULL
         AND DATE(s.start_time) >= ?
         AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)
       ORDER BY s.start_time`,
      [department_id, week_start, week_start]
    );

    const [result] = await pool.query(
      `UPDATE shifts SET status = 'draft'
       WHERE department_id = ?
         AND status = 'published'
         AND deleted_at IS NULL
         AND DATE(start_time) >= ?
         AND DATE(start_time) < DATE_ADD(?, INTERVAL 7 DAY)`,
      [department_id, week_start, week_start]
    );

    if (result.affectedRows > 0 && rows.length > 0) {
      const byEmployee = {};
      for (const r of rows) {
        if (!byEmployee[r.user_id]) {
          byEmployee[r.user_id] = { email: r.email, name: r.user_name, shifts: [] };
        }
        byEmployee[r.user_id].shifts.push({ title: r.title, start_time: r.start_time, end_time: r.end_time });
      }
      await Promise.all(Object.values(byEmployee).map((emp) =>
        sendEmail(emp.email, 'Schedule update — shifts taken offline', weekUnpublishedEmail(emp.name, emp.shifts))
      ));
    }

    if (result.affectedRows > 0) {
      emitScheduleUpdated(department_id, { reason: 'bulk-unpublished' });
    }
    success(res, { unpublished: result.affectedRows }, 'Shifts unpublished.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const unassignEmployee = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const [result] = await pool.query(
      'DELETE FROM shift_assignments WHERE shift_id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0)
      return notFound(res, 'Assignment not found.');

    const [[shift]] = await pool.query('SELECT department_id FROM shifts WHERE id = ?', [id]);
    if (shift) emitScheduleUpdated(shift.department_id, { reason: 'unassigned', shiftId: id });

    deleted(res, 'Employee unassigned successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};