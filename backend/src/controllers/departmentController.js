import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const getAllDepartments = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, u.name AS lead_name
      FROM departments d
      LEFT JOIN users u ON d.lead_id = u.id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getDepartmentById = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, u.name AS lead_name
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

    const [departments] = await pool.query(
      'SELECT id FROM departments WHERE id = ?',
      [id]
    );
    if (departments.length === 0)
      return res.status(404).json({ error: 'Department not found.' });

    if (name) {
      const [existing] = await pool.query(
        'SELECT id FROM departments WHERE name = ? AND id != ?',
        [name.trim(), id]
      );
      if (existing.length > 0)
        return res.status(409).json({ error: 'Department name already exists.' });
    }

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

    await pool.query(
      `UPDATE departments SET
        name = COALESCE(?, name),
        lead_id = COALESCE(?, lead_id)
      WHERE id = ?`,
      [name?.trim() || null, lead_id || null, id]
    );

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