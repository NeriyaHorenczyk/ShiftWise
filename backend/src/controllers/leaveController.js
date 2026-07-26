import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { success, created, updated, deleted, noData, notFound, conflict, validationError, forbidden, serverError } from '../utils/response.js';
import { emitLeaveStatusChanged, emitLeaveUpdated } from '../services/socketService.js';

const LEAVE_BASE_FROM = `
  FROM leave_requests lr
  JOIN users u ON lr.user_id = u.id
  LEFT JOIN users r ON lr.reviewed_by = r.id
`;
const LEAVE_SELECT_COLUMNS = `
  lr.id, lr.start_date, lr.end_date, lr.reason,
  lr.document_url, lr.status, lr.lead_comment, lr.created_at,
  u.name AS user_name,
  u.username,
  r.name AS reviewed_by_name
`;

// Builds the WHERE clause + params applying the same role-based scoping
// every leave-requests caller must respect: employees/shift_managers see
// only their own requests, leads only their department's, admins see
// everything unless narrowed via department_id. Shared by getLeaveRequests
// (paginated and not) and the /schedule/overview endpoint.
const resolveLeaveConditions = async (req, { department_id, search } = {}) => {
  const conditions = ['lr.deleted_at IS NULL'];
  const params = [];

  // employees and shift managers only see their own requests
  if (['employee', 'shift_manager'].includes(req.user.role)) {
    conditions.push('lr.user_id = ?');
    params.push(req.user.id);
  }

  // leads only see requests from their department
  if (req.user.role === 'lead') {
    const [depts] = await pool.query(
      'SELECT id FROM departments WHERE lead_id = ?',
      [req.user.id]
    );
    if (depts.length > 0) {
      conditions.push('u.department_id = ?');
      params.push(depts[0].id);
    }
  } else if (req.user.role === 'admin' && department_id) {
    // admins see everything by default; this just narrows the view when
    // they've picked a specific department from the filter dropdown
    conditions.push('u.department_id = ?');
    params.push(department_id);
  }

  // employee-name filter on the Leave Requests page (admin/lead only)
  if (search && ['admin', 'lead'].includes(req.user.role)) {
    conditions.push('(u.name LIKE ? OR u.username LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }

  return { whereClause: ' WHERE ' + conditions.join(' AND '), params };
};

// The plain unpaginated query — reused by getLeaveRequests (when no `limit`
// is passed) and by /schedule/overview.
export const queryLeaveRequestsForRequester = async (req, opts = {}) => {
  const { whereClause, params } = await resolveLeaveConditions(req, opts);
  const [rows] = await pool.query(
    `SELECT ${LEAVE_SELECT_COLUMNS} ${LEAVE_BASE_FROM}${whereClause} ORDER BY lr.created_at DESC`,
    params
  );
  return rows;
};

export const getLeaveRequests = async (req, res) => {
  try {
    const { department_id, search, limit, offset } = req.query;

    // Pagination is opt-in via `limit` — Schedule.jsx also calls this
    // endpoint (for its leave overlay) expecting the full unpaginated array
    // for the week it's rendering; only the Leave Requests admin/lead list
    // view passes limit/offset, so a large organization's full leave history
    // is never pulled into the browser at once.
    if (limit !== undefined) {
      const { whereClause, params } = await resolveLeaveConditions(req, { department_id, search });
      const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
      const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

      // The page's Pending/Resolved sections are status buckets of one
      // shared paginated list, so a section's badge count can't just be the
      // length of whatever slice of that status happens to have landed on
      // the current page — it needs the true count across every page, under
      // the same filters.
      const [[totalRows], [statusRows]] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS total FROM leave_requests lr JOIN users u ON lr.user_id = u.id${whereClause}`,
          params
        ),
        pool.query(
          `SELECT lr.status, COUNT(*) AS count FROM leave_requests lr JOIN users u ON lr.user_id = u.id${whereClause} GROUP BY lr.status`,
          params
        ),
      ]);
      const total = totalRows[0].total;
      const counts = { pending: 0, approved: 0, rejected: 0 };
      for (const row of statusRows) counts[row.status] = row.count;

      const [rows] = await pool.query(
        `SELECT ${LEAVE_SELECT_COLUMNS} ${LEAVE_BASE_FROM}${whereClause} ORDER BY lr.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limitNum, offsetNum]
      );
      return success(res, { items: rows, total, limit: limitNum, offset: offsetNum, counts });
    }

    const rows = await queryLeaveRequestsForRequester(req, { department_id, search });
    if (rows.length === 0) return noData(res, 'No leave requests found.', rows);
    success(res, rows);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const createLeaveRequest = async (req, res) => {

  try {
    const { start_date, end_date, reason } = req.body;

    if (!start_date || !end_date)
      return validationError(res, 'start_date and end_date are required.');

    if (new Date(start_date) > new Date(end_date))
      return validationError(res, 'start_date must be before or equal to end_date.');

    if (!req.files || req.files.length === 0)
      return validationError(res, 'A supporting document (medical certificate) is required.');

    // check for overlapping pending/approved leave requests
    const [overlapping] = await pool.query(`
      SELECT id FROM leave_requests
      WHERE user_id = ?
        AND status IN ('pending', 'approved')
        AND start_date <= ? AND end_date >= ?
        AND deleted_at IS NULL
    `, [req.user.id, end_date, start_date]);

    if (overlapping.length > 0)
      return conflict(res, 'You already have a leave request overlapping these dates.');

      const document_url = req.files && req.files.length > 0
    ? `/uploads/${req.files[0].filename}`
    : null;
    const id = uuidv4();

    await pool.query(
      `INSERT INTO leave_requests (id, user_id, start_date, end_date, reason, document_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, start_date, end_date, reason || null, document_url]
    );

    const [[me]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [req.user.id]);
    emitLeaveUpdated(me?.department_id, { reason: 'created', leaveId: id });

    created(res, { id }, 'Leave request submitted successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const reviewLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, lead_comment } = req.body;

    if (!['approve', 'reject'].includes(action))
      return validationError(res, 'action must be approve or reject.');

    const [requests] = await pool.query(
      'SELECT * FROM leave_requests WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (requests.length === 0)
      return notFound(res, 'Leave request not found.');

    const leave = requests[0];

    if (leave.status !== 'pending')
      return validationError(res, 'This leave request has already been reviewed.');

    // leads can only review requests from their own department
    if (req.user.role === 'lead') {
      const [depts] = await pool.query(
        'SELECT id FROM departments WHERE lead_id = ?',
        [req.user.id]
      );
      if (depts.length === 0 || depts[0].id !== leave.department_id) {
        const [userDept] = await pool.query(
          'SELECT department_id FROM users WHERE id = ?',
          [leave.user_id]
        );
        if (userDept.length === 0 || userDept[0].department_id !== depts[0]?.id)
          return forbidden(res, 'You can only review requests from your own department.');
      }
    }

    // don't approve leave over dates the employee is already scheduled to work
    if (action === 'approve') {
      const [conflicts] = await pool.query(
        `SELECT s.id FROM shifts s
         JOIN shift_assignments sa ON sa.shift_id = s.id
         WHERE sa.user_id = ? AND s.status = 'published'
           AND DATE(s.start_time) <= ? AND DATE(s.end_time) >= ?`,
        [leave.user_id, leave.end_date, leave.start_date]
      );
      if (conflicts.length > 0)
        return conflict(res, 'Cannot approve leave: employee is currently scheduled for shifts during this period.');
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await pool.query(
      `UPDATE leave_requests
       SET status = ?, reviewed_by = ?, lead_comment = ?
       WHERE id = ?`,
      [newStatus, req.user.id, lead_comment || null, id]
    );

    emitLeaveStatusChanged(leave.user_id, {
      leaveId: id,
      status: newStatus,
      lead_comment: lead_comment || null,
      start_date: leave.start_date,
      end_date: leave.end_date,
    });

    const [[requester]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [leave.user_id]);
    emitLeaveUpdated(requester?.department_id, { reason: 'reviewed', leaveId: id, status: newStatus });

    updated(res, null, `Leave request ${newStatus}.`);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const deleteLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const [requests] = await pool.query(
      'SELECT * FROM leave_requests WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (requests.length === 0)
      return notFound(res, 'Leave request not found.');

    const leave = requests[0];

    // only the owner can delete their own request
    if (leave.user_id !== req.user.id && req.user.role !== 'admin')
      return forbidden(res, 'You can only delete your own leave requests.');

    // cannot delete an already reviewed request
    if (leave.status !== 'pending')
      return validationError(res, 'You cannot delete a request that has already been reviewed.');

    // Soft delete — keeps the record around for historical reporting instead
    // of erasing it outright.
    await pool.query('UPDATE leave_requests SET deleted_at = NOW() WHERE id = ?', [id]);

    const [[requester]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [leave.user_id]);
    emitLeaveUpdated(requester?.department_id, { reason: 'withdrawn', leaveId: id });

    deleted(res, 'Leave request deleted successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const restoreLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const [requests] = await pool.query(
      'SELECT * FROM leave_requests WHERE id = ? AND deleted_at IS NOT NULL',
      [id]
    );
    if (requests.length === 0)
      return notFound(res, 'Deleted leave request not found.');

    await pool.query('UPDATE leave_requests SET deleted_at = NULL WHERE id = ?', [id]);
    updated(res, null, 'Leave request restored successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};