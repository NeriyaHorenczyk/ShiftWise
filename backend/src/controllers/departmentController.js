import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const getAllDepartments = async (req, res) => {
  try {
    let query = `
      SELECT d.id, d.name, d.created_at,
        u.name AS lead_name,
        u.username AS lead_username
      FROM departments d
      LEFT JOIN users u ON d.lead_id = u.id
    `;
    const params = [];

    // employees and shift managers should not be aware other departments exist
    if (['employee', 'shift_manager'].includes(req.user.role)) {
      query += ' WHERE d.id = (SELECT department_id FROM users WHERE id = ?)';
      params.push(req.user.id);
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getDepartmentById = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.id, d.name, d.created_at,
        u.name AS lead_name,
        u.username AS lead_username
      FROM departments d
      LEFT JOIN users u ON d.lead_id = u.id
      WHERE d.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Department not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createDepartment = async (req, res) => {
  try {
    const { name, lead_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Department name is required.' });

    const [existing] = await pool.query(
      'SELECT id FROM departments WHERE name = ?',
      [name.trim()]
    );
    if (existing.length > 0)
      return res.status(409).json({ error: 'Department name already exists.' });

    if (lead_id) {
      const [users] = await pool.query(
        'SELECT id, role FROM users WHERE id = ?',
        [lead_id]
      );
      if (users.length === 0)
        return res.status(404).json({ error: 'Lead user not found.' });
      if (users[0].role !== 'lead' && users[0].role !== 'admin')
        return res.status(400).json({ error: 'Assigned lead must have role lead or admin.' });
    }

    const id = uuidv4();
    await pool.query(
      'INSERT INTO departments (id, name, lead_id) VALUES (?, ?, ?)',
      [id, name.trim(), lead_id || null]
    );

    res.status(201).json({ message: 'Department created successfully.', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, lead_id } = req.body;

    const [departments] = await pool.query('SELECT id FROM departments WHERE id = ?', [id]);
    if (departments.length === 0)
      return res.status(404).json({ error: 'Department not found.' });

    if (name !== undefined && name.trim()) {
      const [existing] = await pool.query(
        'SELECT id FROM departments WHERE name = ? AND id != ?',
        [name.trim(), id]
      );
      if (existing.length > 0)
        return res.status(409).json({ error: 'Department name already exists.' });
    }

    if (lead_id) {
      const [users] = await pool.query('SELECT id, role FROM users WHERE id = ?', [lead_id]);
      if (users.length === 0)
        return res.status(404).json({ error: 'Lead user not found.' });
      if (!['lead', 'admin'].includes(users[0].role))
        return res.status(400).json({ error: 'Assigned lead must have role lead or admin.' });
    }

    // Build SET clause dynamically so lead_id = null can actually clear the field
    // (COALESCE would silently keep the old value when null is passed)
    const setClauses = [];
    const params = [];

    if (name !== undefined) {
      setClauses.push('name = ?');
      params.push(name.trim());
    }
    if ('lead_id' in req.body) {
      setClauses.push('lead_id = ?');
      params.push(lead_id || null);
    }

    if (setClauses.length === 0)
      return res.status(400).json({ error: 'No fields to update.' });

    params.push(id);
    await pool.query(`UPDATE departments SET ${setClauses.join(', ')} WHERE id = ?`, params);

    res.json({ message: 'Department updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const [departments] = await pool.query(
      'SELECT id FROM departments WHERE id = ?',
      [id]
    );
    if (departments.length === 0)
      return res.status(404).json({ error: 'Department not found.' });

    const [members] = await pool.query(
      'SELECT id FROM users WHERE department_id = ?',
      [id]
    );
    if (members.length > 0)
      return res.status(400).json({ error: 'Cannot delete a department that still has members.' });

    await pool.query('DELETE FROM departments WHERE id = ?', [id]);
    res.json({ message: 'Department deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};