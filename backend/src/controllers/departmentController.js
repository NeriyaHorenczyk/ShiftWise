import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { success, created, updated, deleted, noData, notFound, conflict, validationError, forbidden, serverError } from '../utils/response.js';

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
    } else if (req.user.role === 'lead') {
      // a lead only manages their own department — no reason for their
      // browser to ever receive every other department's name/lead
      query += ' WHERE d.lead_id = ?';
      params.push(req.user.id);
    }

    const [rows] = await pool.query(query, params);
    if (rows.length === 0) return noData(res, 'No departments found.', rows);
    success(res, rows);
  } catch (err) {
    serverError(res, err.message);
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
    if (rows.length === 0) return notFound(res, 'Department not found.');
    success(res, rows[0]);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const createDepartment = async (req, res) => {
  try {
    const { name, lead_id } = req.body;
    if (!name) return validationError(res, 'Department name is required.');

    const [existing] = await pool.query(
      'SELECT id FROM departments WHERE name = ?',
      [name.trim()]
    );
    if (existing.length > 0)
      return conflict(res, 'Department name already exists.');

    if (lead_id) {
      const [users] = await pool.query(
        'SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL',
        [lead_id]
      );
      if (users.length === 0)
        return notFound(res, 'Lead user not found.');
      if (users[0].role !== 'lead' && users[0].role !== 'admin')
        return validationError(res, 'Assigned lead must have role lead or admin.');
    }

    const id = uuidv4();
    await pool.query(
      'INSERT INTO departments (id, name, lead_id) VALUES (?, ?, ?)',
      [id, name.trim(), lead_id || null]
    );

    created(res, { id }, 'Department created successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    let { name, lead_id } = req.body;

    const [departments] = await pool.query('SELECT id, lead_id FROM departments WHERE id = ?', [id]);
    if (departments.length === 0)
      return notFound(res, 'Department not found.');

    // leads can only rename their own department — not reassign leadership
    if (req.user.role === 'lead') {
      if (departments[0].lead_id !== req.user.id)
        return forbidden(res, 'You can only update your own department.');
      lead_id = undefined;
      delete req.body.lead_id;
    }

    if (name !== undefined && name.trim()) {
      const [existing] = await pool.query(
        'SELECT id FROM departments WHERE name = ? AND id != ?',
        [name.trim(), id]
      );
      if (existing.length > 0)
        return conflict(res, 'Department name already exists.');
    }

    if (lead_id) {
      const [users] = await pool.query('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL', [lead_id]);
      if (users.length === 0)
        return notFound(res, 'Lead user not found.');
      if (!['lead', 'admin'].includes(users[0].role))
        return validationError(res, 'Assigned lead must have role lead or admin.');
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
      return validationError(res, 'No fields to update.');

    params.push(id);
    await pool.query(`UPDATE departments SET ${setClauses.join(', ')} WHERE id = ?`, params);

    updated(res, null, 'Department updated successfully.');
  } catch (err) {
    serverError(res, err.message);
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
      return notFound(res, 'Department not found.');

    const [members] = await pool.query(
      'SELECT id FROM users WHERE department_id = ?',
      [id]
    );
    if (members.length > 0)
      return validationError(res, 'Cannot delete a department that still has members.');

    await pool.query('DELETE FROM departments WHERE id = ?', [id]);
    deleted(res, 'Department deleted successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};