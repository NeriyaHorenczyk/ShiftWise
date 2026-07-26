import pool from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { success, created, updated, deleted, noData, notFound, conflict, validationError, forbidden, serverError } from '../utils/response.js';
import { withTransaction } from '../utils/transaction.js';

export const getAllDepartments = async (req, res) => {
  try {
    // member_count is a correlated subquery rather than a LEFT JOIN + COUNT/
    // GROUP BY so it can't inflate — a JOIN against users would multiply each
    // department row by its member count instead of aggregating it. Admin
    // Departments.jsx needs this inline so the grid (member counts included)
    // renders from this one request, without a separate GET /users.
    let query = `
      SELECT d.id, d.name, d.created_at,
        u.name AS lead_name,
        u.username AS lead_username,
        (SELECT COUNT(*) FROM users m WHERE m.department_id = d.id AND m.deleted_at IS NULL) AS member_count
      FROM departments d
      LEFT JOIN users u ON d.lead_id = u.id
      WHERE d.deleted_at IS NULL
    `;
    const params = [];

    // employees and shift managers should not be aware other departments exist
    if (['employee', 'shift_manager'].includes(req.user.role)) {
      query += ' AND d.id = (SELECT department_id FROM users WHERE id = ?)';
      params.push(req.user.id);
    } else if (req.user.role === 'lead') {
      // a lead only manages their own department — no reason for their
      // browser to ever receive every other department's name/lead
      query += ' AND d.lead_id = ?';
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
      WHERE d.id = ? AND d.deleted_at IS NULL
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
      'SELECT id FROM departments WHERE name = ? AND deleted_at IS NULL',
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

    const [departments] = await pool.query('SELECT id, lead_id FROM departments WHERE id = ? AND deleted_at IS NULL', [id]);
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
        'SELECT id FROM departments WHERE name = ? AND id != ? AND deleted_at IS NULL',
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
    // Explicit opt-in — without it, a caller (UI or direct API use) gets a
    // 409 reporting how many active members would be unassigned instead of
    // silently moving people out of their department.
    const confirmed = req.query.confirm === 'true' || req.body?.confirm === true;

    const [departments] = await pool.query(
      'SELECT id FROM departments WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (departments.length === 0)
      return notFound(res, 'Department not found.');

    const [members] = await pool.query(
      'SELECT id FROM users WHERE department_id = ? AND deleted_at IS NULL',
      [id]
    );

    if (members.length > 0 && !confirmed) {
      return conflict(
        res,
        `This department has ${members.length} active member${members.length !== 1 ? 's' : ''}. Deleting it will unassign them from this department. Confirm to proceed.`,
        { requiresConfirmation: true, memberCount: members.length }
      );
    }

    // Soft delete the department — historical shifts/reports reference it by
    // id and must keep resolving its name correctly; a hard DELETE's ON
    // DELETE CASCADE would wipe those shifts along with it. Unassigning the
    // members and soft-deleting the department must land together — a
    // failure between them would otherwise leave members pointing at a
    // department that no longer resolves, or a "deleted" department that
    // still counts active members.
    await withTransaction(async (conn) => {
      if (members.length > 0) {
        await conn.query('UPDATE users SET department_id = NULL WHERE department_id = ?', [id]);
      }
      await conn.query('UPDATE departments SET deleted_at = NOW() WHERE id = ?', [id]);
    });

    deleted(res, 'Department deleted successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const restoreDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const [departments] = await pool.query(
      'SELECT id FROM departments WHERE id = ? AND deleted_at IS NOT NULL',
      [id]
    );
    if (departments.length === 0)
      return notFound(res, 'Deleted department not found.');

    const [existing] = await pool.query(
      'SELECT id FROM departments WHERE id != ? AND name = (SELECT name FROM departments WHERE id = ?) AND deleted_at IS NULL',
      [id, id]
    );
    if (existing.length > 0)
      return conflict(res, 'Another active department already uses this name — rename it before restoring.');

    await pool.query('UPDATE departments SET deleted_at = NULL WHERE id = ?', [id]);
    updated(res, null, 'Department restored successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};