import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail, swapApprovedEmail } from '../utils/email.js';
import { success, created, updated, deleted, noData, notFound, conflict, validationError, forbidden, serverError } from '../utils/response.js';
import { withTransaction } from '../utils/transaction.js';
import { emitSwapRequested, emitSwapUpdated, emitScheduleUpdated } from '../services/socketService.js';
import { getOverlappingSlotKeys, toDateStr } from '../utils/slot.js';

export const getSwaps = async (req, res) => {
  try {
    const { department_id, from_search, to_search, limit, offset } = req.query;

    const baseFrom = `
      FROM swap_requests sr
      JOIN users requester ON sr.requester_id = requester.id
      JOIN users target ON sr.target_id = target.id
      JOIN shifts s ON sr.shift_id = s.id
    `;
    const selectColumns = `
      sr.id, sr.status, sr.message, sr.lead_comment, sr.created_at,
      requester.name AS requester_name,
      requester.username AS requester_username,
      target.name AS target_name,
      target.username AS target_username,
      s.title AS shift_title,
      s.start_time, s.end_time
    `;

    const conditions = ['sr.deleted_at IS NULL'];
    const params = [];

    // Hide stale requests whose shift has already started — an unresolved
    // pending/accepted swap for a shift that's already begun no longer makes
    // sense to act on. Resolved swaps (approved/rejected) stay visible for
    // history regardless of the shift's start time.
    conditions.push("(sr.status NOT IN ('pending', 'accepted') OR s.start_time >= NOW())");

    // employees only see swaps they are involved in
    if (['employee', 'shift_manager'].includes(req.user.role)) {
      conditions.push('(sr.requester_id = ? OR sr.target_id = ?)');
      params.push(req.user.id, req.user.id);
    }

    // leads only see swaps in their department
    if (req.user.role === 'lead') {
      const [depts] = await pool.query(
        'SELECT id FROM departments WHERE lead_id = ?',
        [req.user.id]
      );
      if (depts.length > 0) {
        conditions.push('s.department_id = ?');
        params.push(depts[0].id);
      }
    } else if (req.user.role === 'admin' && department_id) {
      // admins see everything by default; this just narrows the view when
      // they've picked a specific department from the filter dropdown
      conditions.push('s.department_id = ?');
      params.push(department_id);
    }

    // "From employee" / "To employee" filters on the Swap Requests page
    // (admin/lead only)
    if (from_search && ['admin', 'lead'].includes(req.user.role)) {
      conditions.push('(requester.name LIKE ? OR requester.username LIKE ?)');
      const like = `%${from_search}%`;
      params.push(like, like);
    }
    if (to_search && ['admin', 'lead'].includes(req.user.role)) {
      conditions.push('(target.name LIKE ? OR target.username LIKE ?)');
      const like = `%${to_search}%`;
      params.push(like, like);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    // Pagination is opt-in via `limit` — only the Swap Requests admin/lead
    // list view passes limit/offset, so a large organization's full swap
    // history is never pulled into the browser at once.
    if (limit !== undefined) {
      const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
      const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

      // The page's three sections (pending/accepted/resolved) are status
      // buckets of one shared paginated list, so a section's badge count
      // can't just be the length of whatever slice of that status happens
      // to have landed on the current page — it needs the true count across
      // every page, under the same filters.
      const [[totalRows], [statusRows]] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS total ${baseFrom}${whereClause}`, params),
        pool.query(`SELECT sr.status, COUNT(*) AS count ${baseFrom}${whereClause} GROUP BY sr.status`, params),
      ]);
      const total = totalRows[0].total;
      const counts = { pending: 0, accepted: 0, approved: 0, rejected: 0 };
      for (const row of statusRows) counts[row.status] = row.count;

      const [rows] = await pool.query(
        `SELECT ${selectColumns} ${baseFrom}${whereClause} ORDER BY sr.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limitNum, offsetNum]
      );
      return success(res, { items: rows, total, limit: limitNum, offset: offsetNum, counts });
    }

    const [rows] = await pool.query(
      `SELECT ${selectColumns} ${baseFrom}${whereClause} ORDER BY sr.created_at DESC`,
      params
    );
    if (rows.length === 0) return noData(res, 'No swap requests found.', rows);
    success(res, rows);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const createSwap = async (req, res) => {
  try {
    const { target_username, shift_id, message } = req.body;

    if (!target_username || !shift_id)
      return validationError(res, 'target_username and shift_id are required.');

    if (target_username === req.user.username)
      return validationError(res, 'You cannot request a swap with yourself.');

    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    if (trimmedMessage.length > 500)
      return validationError(res, 'Message must be 500 characters or fewer.');

    // verify the shift exists and is published
    const [shifts] = await pool.query(
      'SELECT * FROM shifts WHERE id = ? AND deleted_at IS NULL',
      [shift_id]
    );
    if (shifts.length === 0)
      return notFound(res, 'Shift not found.');
    if (shifts[0].status !== 'published')
      return validationError(res, 'You can only swap published shifts.');

    // verify requester is actually assigned to this shift
    const [assignment] = await pool.query(
      'SELECT id FROM shift_assignments WHERE shift_id = ? AND user_id = ?',
      [shift_id, req.user.id]
    );
    if (assignment.length === 0)
      return forbidden(res, 'You are not assigned to this shift.');

    // resolve target_username to a user record
    const [targets] = await pool.query(
      'SELECT * FROM users WHERE username = ? AND deleted_at IS NULL',
      [target_username]
    );
    if (targets.length === 0)
      return notFound(res, 'Target user not found.');
    if (targets[0].department_id !== shifts[0].department_id)
      return validationError(res, 'You can only swap with employees in the same department.');

    // can't request a swap with someone already assigned to this shift
    const [targetAssignment] = await pool.query(
      'SELECT id FROM shift_assignments WHERE shift_id = ? AND user_id = ?',
      [shift_id, targets[0].id]
    );
    if (targetAssignment.length > 0)
      return validationError(res, 'This employee is already assigned to this shift.');

    // if requester is acting as shift manager in this shift,
    // target must also be a shift_manager
    const [requesterAssignment] = await pool.query(
      'SELECT is_shift_manager FROM shift_assignments WHERE shift_id = ? AND user_id = ?',
      [shift_id, req.user.id]
    );

    if (requesterAssignment[0].is_shift_manager && targets[0].role !== 'shift_manager')
      return validationError(res, 'You are acting as shift manager in this shift. You can only swap with another shift manager.');

    // regular requesters can swap with another employee or a shift manager,
    // but not with department leadership (lead/admin)
    if (!requesterAssignment[0].is_shift_manager && ['lead', 'admin'].includes(targets[0].role))
      return validationError(res, 'You cannot request a swap with an employee in a managerial position.');

    // check no pending swap already exists for this shift by this requester
    const [existing] = await pool.query(
      `SELECT id FROM swap_requests
       WHERE shift_id = ? AND requester_id = ? AND status = 'pending' AND deleted_at IS NULL`,
      [shift_id, req.user.id]
    );
    if (existing.length > 0)
      return conflict(res, 'You already have a pending swap request for this shift.');

    const id = uuidv4();
    await pool.query(
      `INSERT INTO swap_requests (id, requester_id, target_id, shift_id, message)
       VALUES (?, ?, ?, ?, ?)`,
      [id, req.user.id, targets[0].id, shift_id, trimmedMessage || null]
    );

    emitSwapRequested(shifts[0].department_id, {
      swapId: id,
      shiftTitle: shifts[0].title,
      requesterUsername: req.user.username,
      targetUsername: target_username,
      message: trimmedMessage || null,
    });

    created(res, { id }, 'Swap request created successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const respondToSwap = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action))
      return validationError(res, 'action must be accept or reject.');

    const [swaps] = await pool.query(
      'SELECT * FROM swap_requests WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (swaps.length === 0)
      return notFound(res, 'Swap request not found.');

    const swap = swaps[0];

    // only the target employee can respond
    if (swap.target_id !== req.user.id)
      return forbidden(res, 'Only the target employee can respond to this request.');

    if (swap.status !== 'pending')
      return validationError(res, 'This swap request is no longer pending.');

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    await pool.query(
      'UPDATE swap_requests SET status = ? WHERE id = ?',
      [newStatus, id]
    );

    const [[shiftInfo]] = await pool.query('SELECT department_id FROM shifts WHERE id = ?', [swap.shift_id]);
    emitSwapUpdated(shiftInfo?.department_id, [swap.requester_id, swap.target_id], {
      swapId: id, status: newStatus,
    });

    updated(res, null, `Swap request ${newStatus}.`);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const approveSwap = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, lead_comment } = req.body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action))
      return validationError(res, 'action must be approve or reject.');

    const [swaps] = await pool.query(
      'SELECT * FROM swap_requests WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (swaps.length === 0)
      return notFound(res, 'Swap request not found.');

    const swap = swaps[0];

    if (swap.status !== 'accepted')
      return validationError(res, 'You can only approve a swap that has been accepted by both employees.');

    const [[shiftInfo]] = await pool.query(
      'SELECT title, start_time, end_time, department_id FROM shifts WHERE id = ?',
      [swap.shift_id]
    );
    if (!shiftInfo) return notFound(res, 'Shift not found.');

    // Both employees accepting a swap only confirms they're each willing to
    // make it — it never re-checks whether the target can actually legally
    // work the shift (their availability/leave could easily have changed
    // since they accepted). Approving hands the shift straight to them, so
    // this runs the same eligibility checks a manual assignment goes
    // through (shiftController.assignEmployee) right before that handoff.
    let target;
    if (action === 'approve') {
      [[target]] = await pool.query('SELECT name, email FROM users WHERE id = ?', [swap.target_id]);

      const shiftStart = new Date(shiftInfo.start_time);
      const shiftEnd = new Date(shiftInfo.end_time);
      const shiftDateStr = toDateStr(shiftStart);
      const weekStart = new Date(shiftStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      // a) marked unavailable for this shift's slot(s) — a shift can span
      // more than one (e.g. afternoon into evening), so every slot it
      // overlaps must be checked, not just the one its start time falls into
      const overlappingKeys = getOverlappingSlotKeys(shiftStart, shiftEnd);
      const [avail] = await pool.query(
        'SELECT day_of_week, slot, status FROM availability WHERE user_id = ? AND week_start = ?',
        [swap.target_id, toDateStr(weekStart)]
      );
      const isUnavailable = avail.some(a =>
        overlappingKeys.has(`${a.day_of_week}_${a.slot}`) && a.status === 'unavailable'
      );
      if (isUnavailable) {
        return validationError(res, `Cannot approve swap: ${target.name} is marked unavailable for this shift's time slot.`);
      }

      // b) on approved leave covering this shift's date
      const [onLeave] = await pool.query(
        `SELECT id FROM leave_requests
         WHERE user_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ? AND deleted_at IS NULL`,
        [swap.target_id, shiftDateStr, shiftDateStr]
      );
      if (onLeave.length > 0) {
        return validationError(res, `Cannot approve swap: ${target.name} is on approved leave during this shift.`);
      }

      // c) already assigned to another (non-deleted) shift whose time range
      // overlaps this one
      const [overlapping] = await pool.query(
        `SELECT sa.id FROM shift_assignments sa
         JOIN shifts s ON sa.shift_id = s.id
         WHERE sa.user_id = ? AND s.id != ? AND s.deleted_at IS NULL
           AND s.start_time < ? AND s.end_time > ?`,
        [swap.target_id, swap.shift_id, shiftInfo.end_time, shiftInfo.start_time]
      );
      if (overlapping.length > 0) {
        return validationError(res, `Cannot approve swap: ${target.name} is already assigned to an overlapping shift during this time.`);
      }
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Swapping the assignment and updating the request's status must land
    // together — if the DELETE (or the following INSERT) succeeded but a
    // later statement failed, the shift could end up with no one assigned
    // at all, or the request could stay 'accepted' despite the swap having
    // already happened.
    await withTransaction(async (conn) => {
      if (action === 'approve') {
        // execute the swap — remove requester, add target
        await conn.query(
          'DELETE FROM shift_assignments WHERE shift_id = ? AND user_id = ?',
          [swap.shift_id, swap.requester_id]
        );
        await conn.query(
          'INSERT INTO shift_assignments (id, shift_id, user_id) VALUES (?, ?, ?)',
          [uuidv4(), swap.shift_id, swap.target_id]
        );
      }

      await conn.query(
        'UPDATE swap_requests SET status = ?, lead_comment = ? WHERE id = ?',
        [newStatus, lead_comment || null, id]
      );
    });

    if (action === 'approve') {
      const [[requester]] = await pool.query(
        'SELECT email, name FROM users WHERE id = ?',
        [swap.requester_id]
      );
      await Promise.all([
        sendEmail(requester.email, `Swap approved — ${shiftInfo.title}`, swapApprovedEmail(requester.name, true, shiftInfo, target.name)),
        sendEmail(target.email, `Swap approved — ${shiftInfo.title}`, swapApprovedEmail(target.name, false, shiftInfo, requester.name)),
      ]);

      // an approved swap changes who's assigned to the shift, so anyone
      // viewing this department's schedule needs the same live-update as
      // a direct assign/unassign would trigger
      emitScheduleUpdated(shiftInfo.department_id, { reason: 'swap-approved', shiftId: swap.shift_id });
    }

    emitSwapUpdated(shiftInfo?.department_id, [swap.requester_id, swap.target_id], {
      swapId: id, status: newStatus,
    });

    updated(res, null, `Swap request ${newStatus}.`);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const deleteSwap = async (req, res) => {
  try {
    const { id } = req.params;

    const [swaps] = await pool.query(
      'SELECT * FROM swap_requests WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (swaps.length === 0)
      return notFound(res, 'Swap request not found.');

    const swap = swaps[0];

    // only the requester can withdraw their own request
    if (swap.requester_id !== req.user.id)
      return forbidden(res, 'You can only withdraw your own swap requests.');

    if (swap.status !== 'pending')
      return validationError(res, 'You cannot withdraw a request that has already been responded to.');

    // Soft delete — keeps the record around for historical reporting instead
    // of erasing it outright.
    await pool.query('UPDATE swap_requests SET deleted_at = NOW() WHERE id = ?', [id]);

    const [[shiftInfo2]] = await pool.query('SELECT department_id FROM shifts WHERE id = ?', [swap.shift_id]);
    emitSwapUpdated(shiftInfo2?.department_id, [swap.requester_id, swap.target_id], {
      swapId: id, status: 'withdrawn',
    });

    deleted(res, 'Swap request withdrawn successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const restoreSwap = async (req, res) => {
  try {
    const { id } = req.params;

    const [swaps] = await pool.query(
      'SELECT * FROM swap_requests WHERE id = ? AND deleted_at IS NOT NULL',
      [id]
    );
    if (swaps.length === 0)
      return notFound(res, 'Deleted swap request not found.');

    await pool.query('UPDATE swap_requests SET deleted_at = NULL WHERE id = ?', [id]);
    updated(res, null, 'Swap request restored successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};