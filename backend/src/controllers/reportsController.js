import pool from '../../db/connection.js';
import { success, noData, validationError, serverError } from '../utils/response.js';

export const getShiftCoverage = async (req, res) => {
  try {
    const { from, to, department_id } = req.query;

    if (!from || !to) {
      return validationError(res, 'from and to date parameters are required.');
    }

    const conditions = ['s.status = ?', 'DATE(s.start_time) >= ?', 'DATE(s.start_time) <= ?'];
    const params = ['published', from, to];

    if (req.user.role === 'lead') {
      const [depts] = await pool.query('SELECT id FROM departments WHERE lead_id = ?', [req.user.id]);
      if (depts.length > 0) {
        conditions.push('s.department_id = ?');
        params.push(depts[0].id);
      }
    } else if (req.user.role === 'admin' && department_id) {
      conditions.push('s.department_id = ?');
      params.push(department_id);
    }

    const query = `
      SELECT
        DATE_SUB(DATE(s.start_time), INTERVAL (DAYOFWEEK(s.start_time) - 1) DAY) AS week_start,
        COUNT(s.id) AS total_shifts,
        SUM(CASE WHEN COALESCE(sa_cnt.cnt, 0) >= s.required_staff THEN 1 ELSE 0 END) AS fully_staffed,
        SUM(CASE WHEN COALESCE(sa_cnt.cnt, 0) < s.required_staff THEN 1 ELSE 0 END) AS understaffed,
        SUM(TIMESTAMPDIFF(HOUR, s.start_time, s.end_time)) AS total_hours
      FROM shifts s
      LEFT JOIN (
        SELECT shift_id, COUNT(*) AS cnt FROM shift_assignments GROUP BY shift_id
      ) sa_cnt ON s.id = sa_cnt.shift_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY week_start
      ORDER BY week_start ASC
    `;

    const [rows] = await pool.query(query, params);
    if (rows.length === 0) return noData(res, 'No shift coverage data found.', rows);
    success(res, rows);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const getEmployeeStats = async (req, res) => {
  try {
    const { from, to, department_id } = req.query;

    if (!from || !to) {
      return validationError(res, 'from and to date parameters are required.');
    }

    const whereConditions = ["u.role IN ('employee', 'shift_manager')"];
    const whereParams = [];

    let deptId = department_id;

    if (req.user.role === 'lead') {
      const [depts] = await pool.query('SELECT id FROM departments WHERE lead_id = ?', [req.user.id]);
      if (depts.length > 0) deptId = depts[0].id;
    }

    if (deptId) {
      whereConditions.push('u.department_id = ?');
      whereParams.push(deptId);
    }

    // ON-clause params appear before WHERE params in the query
    const allParams = [from, to, from, to, from, to, ...whereParams];

    const query = `
      SELECT
        u.name,
        u.username,
        u.role,
        COUNT(DISTINCT sa.shift_id) AS shifts_worked,
        COALESCE(SUM(TIMESTAMPDIFF(MINUTE, sh.start_time, sh.end_time)), 0) / 60.0 AS total_hours,
        COUNT(DISTINCT sr_req.id) AS swaps_requested,
        COUNT(DISTINCT sr_target.id) AS swaps_received
      FROM users u
      LEFT JOIN shift_assignments sa ON u.id = sa.user_id
      LEFT JOIN shifts sh ON sa.shift_id = sh.id
        AND sh.status = 'published'
        AND DATE(sh.start_time) >= ?
        AND DATE(sh.start_time) <= ?
      LEFT JOIN swap_requests sr_req ON u.id = sr_req.requester_id
        AND DATE(sr_req.created_at) >= ?
        AND DATE(sr_req.created_at) <= ?
      LEFT JOIN swap_requests sr_target ON u.id = sr_target.target_id
        AND DATE(sr_target.created_at) >= ?
        AND DATE(sr_target.created_at) <= ?
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY u.id, u.name, u.username, u.role
      ORDER BY total_hours DESC, u.name ASC
    `;

    const [rows] = await pool.query(query, allParams);
    if (rows.length === 0) return noData(res, 'No employee stats found.', rows);
    success(res, rows);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const getLeaveReport = async (req, res) => {
  try {
    const { from, to, department_id } = req.query;

    if (!from || !to) {
      return validationError(res, 'from and to date parameters are required.');
    }

    // overlapping date range: leave overlaps [from,to] if start <= to AND end >= from
    const conditions = ['lr.start_date <= ?', 'lr.end_date >= ?'];
    const params = [to, from];

    if (req.user.role === 'lead') {
      const [depts] = await pool.query('SELECT id FROM departments WHERE lead_id = ?', [req.user.id]);
      if (depts.length > 0) {
        conditions.push('u.department_id = ?');
        params.push(depts[0].id);
      }
    } else if (req.user.role === 'admin' && department_id) {
      conditions.push('u.department_id = ?');
      params.push(department_id);
    }

    const query = `
      SELECT
        lr.start_date, lr.end_date, lr.reason,
        lr.document_url, lr.status, lr.lead_comment,
        DATEDIFF(lr.end_date, lr.start_date) + 1 AS days,
        u.name AS user_name,
        u.username,
        d.name AS department_name,
        r.name AS reviewed_by_name
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users r ON lr.reviewed_by = r.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY lr.start_date DESC
    `;

    const [rows] = await pool.query(query, params);
    if (rows.length === 0) return noData(res, 'No leave report data found.', rows);
    success(res, rows);
  } catch (err) {
    serverError(res, err.message);
  }
};
