import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const getLeaveRequests = async (req, res) => {
  try {
    let query = `
      SELECT 
        lr.*,
        u.name AS user_name,
        u.username,
        r.name AS reviewed_by_name
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      LEFT JOIN users r ON lr.reviewed_by = r.id
    `;

    const conditions = [];
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
    }

    if (conditions.length > 0)
      query += ' WHERE ' + conditions.join(' AND ');

    query += ' ORDER BY lr.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createLeaveRequest = async (req, res) => {
  try {
    const { start_date, end_date, reason } = req.body;

    if (!start_date || !end_date)
      return res.status(400).json({ error: 'start_date and end_date are required.' });

    if (new Date(start_date) > new Date(end_date))
      return res.status(400).json({ error: 'start_date must be before or equal to end_date.' });

    // check for overlapping pending/approved leave requests
    const [overlapping] = await pool.query(`
      SELECT id FROM leave_requests
      WHERE user_id = ?
        AND status IN ('pending', 'approved')
        AND start_date <= ? AND end_date >= ?
    `, [req.user.id, end_date, start_date]);

    if (overlapping.length > 0)
      return res.status(409).json({ error: 'You already have a leave request overlapping these dates.' });

    const document_url = req.file ? `/uploads/${req.file.filename}` : null;
    const id = uuidv4();

    await pool.query(
      `INSERT INTO leave_requests (id, user_id, start_date, end_date, reason, document_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, start_date, end_date, reason || null, document_url]
    );

    res.status(201).json({ message: 'Leave request submitted successfully.', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const reviewLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, lead_comment } = req.body;

    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ error: 'action must be approve or reject.' });

    const [requests] = await pool.query(
      'SELECT * FROM leave_requests WHERE id = ?',
      [id]
    );
    if (requests.length === 0)
      return res.status(404).json({ error: 'Leave request not found.' });

    const leave = requests[0];

    if (leave.status !== 'pending')
      return res.status(400).json({ error: 'This leave request has already been reviewed.' });

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
          return res.status(403).json({ error: 'You can only review requests from your own department.' });
      }
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await pool.query(
      `UPDATE leave_requests 
       SET status = ?, reviewed_by = ?, lead_comment = ?
       WHERE id = ?`,
      [newStatus, req.user.id, lead_comment || null, id]
    );

    res.json({ message: `Leave request ${newStatus}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const [requests] = await pool.query(
      'SELECT * FROM leave_requests WHERE id = ?',
      [id]
    );
    if (requests.length === 0)
      return res.status(404).json({ error: 'Leave request not found.' });

    const leave = requests[0];

    // only the owner can delete their own request
    if (leave.user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'You can only delete your own leave requests.' });

    // cannot delete an already reviewed request
    if (leave.status !== 'pending')
      return res.status(400).json({ error: 'You cannot delete a request that has already been reviewed.' });

    await pool.query('DELETE FROM leave_requests WHERE id = ?', [id]);
    res.json({ message: 'Leave request deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};