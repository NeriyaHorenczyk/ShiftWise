import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const getAllShifts = async (req, res) => {
  try {
    const { department_id, week_start, status } = req.query;

    let query = `
      SELECT 
        s.id, s.title, s.start_time, s.end_time,
        s.required_staff, s.status,
        d.name AS department_name,
        u.name AS created_by_name,
        COUNT(sa.user_id) AS assigned_count
      FROM shifts s
      LEFT JOIN departments d ON s.department_id = d.id
      LEFT JOIN users u ON s.created_by = u.id
      LEFT JOIN shift_assignments sa ON s.id = sa.shift_id
    `;

    const conditions = [];
    const params = [];

    if (department_id) {
      conditions.push('s.department_id = ?');
      params.push(department_id);
    }
    if (week_start) {
      conditions.push('DATE(s.start_time) >= ? AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)');
      params.push(week_start, week_start);
    }
    if (status) {
      conditions.push('s.status = ?');
      params.push(status);
    }

    // employees only see published shifts
    if (['employee', 'shift_manager'].includes(req.user.role)) {
      conditions.push('s.status = ?');
      params.push('published');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY s.id ORDER BY s.start_time ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getShiftById = async (req, res) => {
  try {
    const [shifts] = await pool.query(`
      SELECT 
        s.id, s.title, s.start_time, s.end_time,
        s.required_staff, s.status,
        d.name AS department_name,
        u.name AS created_by_name
      FROM shifts s
      LEFT JOIN departments d ON s.department_id = d.id
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = ?
    `, [req.params.id]);

    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });

    // fetch assigned employees separately
    const [assignments] = await pool.query(`
      SELECT 
        u.username, u.name, u.avatar_url,
        sa.is_shift_manager
      FROM shift_assignments sa
      JOIN users u ON sa.user_id = u.id
      WHERE sa.shift_id = ?
    `, [req.params.id]);

    res.json({ ...shifts[0], assignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyShifts = async (req, res) => {
  try {
    const { week_start } = req.query;

    let query = `
      SELECT 
        s.id, s.title, s.start_time, s.end_time,
        s.required_staff, s.status,
        d.name AS department_name,
        sa.is_shift_manager,
        COUNT(sa2.user_id) AS assigned_count
      FROM shift_assignments sa
      JOIN shifts s ON sa.shift_id = s.id
      JOIN departments d ON s.department_id = d.id
      LEFT JOIN shift_assignments sa2 ON s.id = sa2.shift_id
      WHERE sa.user_id = ?
        AND s.status = 'published'
    `;

    const params = [req.user.id];

    if (week_start) {
      query += ` AND DATE(s.start_time) >= ? AND DATE(s.start_time) < DATE_ADD(?, INTERVAL 7 DAY)`;
      params.push(week_start, week_start);
    }

    query += ' GROUP BY s.id, sa.is_shift_manager ORDER BY s.start_time ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createShift = async (req, res) => {
  try {
    const { department_id, title, start_time, end_time, required_staff } = req.body;

    if (!department_id || !title || !start_time || !end_time)
      return res.status(400).json({ error: 'department_id, title, start_time and end_time are required.' });

    if (new Date(start_time) >= new Date(end_time))
      return res.status(400).json({ error: 'start_time must be before end_time.' });

    // leads can only create shifts for their own department
    if (req.user.role === 'lead') {
      const [depts] = await pool.query(
        'SELECT lead_id FROM departments WHERE id = ?',
        [department_id]
      );
      if (depts.length === 0)
        return res.status(404).json({ error: 'Department not found.' });
      if (depts[0].lead_id !== req.user.id)
        return res.status(403).json({ error: 'You can only create shifts for your own department.' });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO shifts (id, department_id, title, start_time, end_time, required_staff, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, department_id, title, start_time, end_time, required_staff || 1, req.user.id]
    );

    res.status(201).json({ message: 'Shift created successfully.', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, start_time, end_time, required_staff } = req.body;

    const [shifts] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id]);
    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });

    if (shifts[0].status === 'published')
      return res.status(400).json({ error: 'Cannot edit a published shift. Unpublish it first.' });

    if (start_time && end_time && new Date(start_time) >= new Date(end_time))
      return res.status(400).json({ error: 'start_time must be before end_time.' });

    await pool.query(
      `UPDATE shifts SET
        title = COALESCE(?, title),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        required_staff = COALESCE(?, required_staff)
      WHERE id = ?`,
      [title || null, start_time || null, end_time || null, required_staff || null, id]
    );

    res.json({ message: 'Shift updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteShift = async (req, res) => {
  try {
    const { id } = req.params;

    const [shifts] = await pool.query('SELECT id FROM shifts WHERE id = ?', [id]);
    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });

    await pool.query('DELETE FROM shifts WHERE id = ?', [id]);
    res.json({ message: 'Shift deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const publishShift = async (req, res) => {
  try {
    const { id } = req.params;

    const [shifts] = await pool.query(
      'SELECT * FROM shifts WHERE id = ?',
      [id]
    );
    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });
    if (shifts[0].status === 'published')
      return res.status(400).json({ error: 'Shift is already published.' });

    const [assignments] = await pool.query(
      'SELECT id FROM shift_assignments WHERE shift_id = ?',
      [id]
    );
    if (assignments.length === 0)
      return res.status(400).json({ error: 'Cannot publish a shift with no assigned employees.' });

    await pool.query(
      'UPDATE shifts SET status = ? WHERE id = ?',
      ['published', id]
    );

    res.json({ message: 'Shift published successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const assignEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, is_shift_manager } = req.body;

    if (!user_id)
      return res.status(400).json({ error: 'user_id is required.' });

    const [shifts] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id]);
    if (shifts.length === 0)
      return res.status(404).json({ error: 'Shift not found.' });

    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [user_id]);
    if (users.length === 0)
      return res.status(404).json({ error: 'User not found.' });

    // only shift_managers can be assigned as shift manager
    if (is_shift_manager && users[0].role !== 'shift_manager')
      return res.status(400).json({ error: 'Only shift managers can be assigned as shift manager for a shift.' });

    // only one shift manager allowed per shift
    if (is_shift_manager) {
      const [existing] = await pool.query(
        'SELECT id FROM shift_assignments WHERE shift_id = ? AND is_shift_manager = true',
        [id]
      );
      if (existing.length > 0)
        return res.status(409).json({ error: 'This shift already has a shift manager assigned.' });
    }

    const assignmentId = uuidv4();
    await pool.query(
      'INSERT INTO shift_assignments (id, shift_id, user_id, is_shift_manager) VALUES (?, ?, ?, ?)',
      [assignmentId, id, user_id, is_shift_manager || false]
    );

    res.status(201).json({ message: 'Employee assigned successfully.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Employee is already assigned to this shift.' });
    res.status(500).json({ error: err.message });
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
      return res.status(404).json({ error: 'Assignment not found.' });

    res.json({ message: 'Employee unassigned successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};