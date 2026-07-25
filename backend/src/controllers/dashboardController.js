import pool from '../../db/connection.js';
import { success, noData, serverError } from '../utils/response.js';

// Single targeted endpoint for the Dashboard view — returns only the
// precomputed slices each role's dashboard card actually renders (5 upcoming
// shifts, a handful of pending swaps/leave, and — for admins — a few COUNT()
// aggregates) instead of the previous approach of the frontend pulling every
// shift/swap/leave/user/department row and slicing/filtering it client-side.
export const getDashboard = async (req, res) => {
  try {
    const { id: userId, role } = req.user;

    let deptId = null;
    if (role === 'lead') {
      const [[dept]] = await pool.query('SELECT id FROM departments WHERE lead_id = ?', [userId]);
      deptId = dept?.id || null;
    }

    // Upcoming shifts
    let upcomingShifts;
    if (role === 'employee' || role === 'shift_manager') {
      [upcomingShifts] = await pool.query(
        `SELECT s.id, s.title, s.start_time, s.end_time, s.status, d.name AS department_name
         FROM shift_assignments sa
         JOIN shifts s ON sa.shift_id = s.id
         JOIN departments d ON s.department_id = d.id
         WHERE sa.user_id = ? AND s.status = 'published' AND s.start_time >= NOW() AND s.deleted_at IS NULL
         ORDER BY s.start_time ASC LIMIT 5`,
        [userId]
      );
    } else if (role === 'lead' && deptId) {
      [upcomingShifts] = await pool.query(
        `SELECT s.id, s.title, s.start_time, s.end_time, s.status, d.name AS department_name
         FROM shifts s
         JOIN departments d ON s.department_id = d.id
         WHERE s.department_id = ? AND s.start_time >= NOW() AND s.deleted_at IS NULL
         ORDER BY s.start_time ASC LIMIT 5`,
        [deptId]
      );
    } else {
      // admin (or a lead not yet assigned to a department)
      [upcomingShifts] = await pool.query(
        `SELECT s.id, s.title, s.start_time, s.end_time, s.status, d.name AS department_name
         FROM shifts s
         JOIN departments d ON s.department_id = d.id
         WHERE s.start_time >= NOW() AND s.deleted_at IS NULL
         ORDER BY s.start_time ASC LIMIT 5`
      );
    }

    // Pending swap requests
    const swapConditions = [`sr.status IN ('pending', 'accepted')`];
    const swapParams = [];
    if (role === 'employee' || role === 'shift_manager') {
      swapConditions.push('(sr.requester_id = ? OR sr.target_id = ?)');
      swapParams.push(userId, userId);
    } else if (role === 'lead' && deptId) {
      swapConditions.push('s.department_id = ?');
      swapParams.push(deptId);
    }
    const [pendingSwaps] = await pool.query(
      `SELECT sr.id, sr.status, requester.username AS requester_username,
              target.username AS target_username, s.title AS shift_title
       FROM swap_requests sr
       JOIN users requester ON sr.requester_id = requester.id
       JOIN users target ON sr.target_id = target.id
       JOIN shifts s ON sr.shift_id = s.id
       WHERE ${swapConditions.join(' AND ')}
       ORDER BY sr.created_at DESC LIMIT 5`,
      swapParams
    );

    // Pending leave requests — a lead sees only their own department's,
    // matching how the Leave Requests page itself scopes things for them.
    const leaveConditions = [`lr.status = 'pending'`];
    const leaveParams = [];
    if (role === 'employee' || role === 'shift_manager') {
      leaveConditions.push('lr.user_id = ?');
      leaveParams.push(userId);
    } else if (role === 'lead' && deptId) {
      leaveConditions.push('u.department_id = ?');
      leaveParams.push(deptId);
    }
    const [pendingLeave] = await pool.query(
      `SELECT lr.id, lr.start_date, lr.end_date, u.name AS user_name
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE ${leaveConditions.join(' AND ')}
       ORDER BY lr.created_at DESC LIMIT 5`,
      leaveParams
    );

    let stats = null;
    if (role === 'admin') {
      const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) AS totalUsers FROM users WHERE deleted_at IS NULL');
      const [[{ totalDepartments }]] = await pool.query('SELECT COUNT(*) AS totalDepartments FROM departments');
      const [[{ totalShifts }]] = await pool.query('SELECT COUNT(*) AS totalShifts FROM shifts WHERE deleted_at IS NULL');
      const [[{ pendingSwapCount }]] = await pool.query(
        `SELECT COUNT(*) AS pendingSwapCount FROM swap_requests WHERE status = 'pending'`
      );
      const [[{ pendingLeaveCount }]] = await pool.query(
        `SELECT COUNT(*) AS pendingLeaveCount FROM leave_requests WHERE status = 'pending'`
      );
      stats = {
        totalUsers,
        totalDepartments,
        totalShifts,
        pendingRequests: pendingSwapCount + pendingLeaveCount,
      };
    }

    // Sub-fields always stay arrays (never null) so the frontend's existing
    // .map()/.length empty-state rendering keeps working untouched — only
    // the envelope's top-level status flags a dashboard with nothing at all
    // to show. `stats` isn't part of this check: for an admin it's always a
    // set of real counts (even if some are 0), not an absent list.
    const payload = { upcomingShifts, pendingSwaps, pendingLeave, stats };
    const isEmpty = upcomingShifts.length === 0 && pendingSwaps.length === 0 && pendingLeave.length === 0;

    if (isEmpty) return noData(res, 'No dashboard activity to show.', payload);
    success(res, payload);
  } catch (err) {
    serverError(res, err.message);
  }
};
