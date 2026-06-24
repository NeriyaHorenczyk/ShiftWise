import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const getAvailability = async (req, res) => {
  try {
    const { user_id, week_start } = req.query;

    // employees can only see their own availability
    if (['employee', 'shift_manager'].includes(req.user.role) && user_id !== req.user.id)
      return res.status(403).json({ error: 'Access denied. You can only view your own availability.' });

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
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getTeamAvailability = async (req, res) => {
  try {
    const { week_start, department_id } = req.query;

    if (!week_start)
      return res.status(400).json({ error: 'week_start is required.' });

    // leads can only see their own department
    let deptId = department_id;
    if (req.user.role === 'lead') {
      const [depts] = await pool.query(
        'SELECT id FROM departments WHERE lead_id = ?',
        [req.user.id]
      );
      if (depts.length === 0)
        return res.status(403).json({ error: 'You are not assigned as lead of any department.' });
      deptId = depts[0].id;
    }

    const [rows] = await pool.query(`
      SELECT 
        a.week_start, a.day_of_week, a.slot, a.status,
        u.name AS user_name,
        u.username,
        u.avatar_url
      FROM availability a
      JOIN users u ON a.user_id = u.id
      WHERE a.week_start = ?
        AND u.department_id = ?
      ORDER BY a.day_of_week ASC, a.slot ASC, u.name ASC
    `, [week_start, deptId]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const submitAvailability = async (req, res) => {
  try {
    const { week_start, slots } = req.body;

    // slots is an array of { day_of_week, slot, status }
    if (!week_start || !Array.isArray(slots) || slots.length === 0)
      return res.status(400).json({ error: 'week_start and slots array are required.' });

    // validate week_start is a Sunday
    const date = new Date(week_start);
    if (date.getDay() !== 0)
      return res.status(400).json({ error: 'week_start must be a Sunday.' });

    const validSlots = ['morning', 'afternoon', 'evening'];
    const validStatuses = ['available', 'preferred'];

    for (const s of slots) {
      if (s.day_of_week < 0 || s.day_of_week > 6)
        return res.status(400).json({ error: 'day_of_week must be between 0 and 6.' });
      if (!validSlots.includes(s.slot))
        return res.status(400).json({ error: `Invalid slot: ${s.slot}` });
      if (!validStatuses.includes(s.status))
        return res.status(400).json({ error: `Invalid status: ${s.status}` });
    }

    // upsert each slot — insert or update if already exists
    for (const s of slots) {
      const id = uuidv4();
      await pool.query(`
        INSERT INTO availability (id, user_id, week_start, day_of_week, slot, status)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status)
      `, [id, req.user.id, week_start, s.day_of_week, s.slot, s.status]);
    }

    res.status(201).json({ message: 'Availability submitted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteAvailability = async (req, res) => {
  try {
    const { week_start } = req.query;

    if (!week_start)
      return res.status(400).json({ error: 'week_start is required.' });

    await pool.query(
      'DELETE FROM availability WHERE user_id = ? AND week_start = ?',
      [req.user.id, week_start]
    );

    res.json({ message: 'Availability cleared for that week.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};