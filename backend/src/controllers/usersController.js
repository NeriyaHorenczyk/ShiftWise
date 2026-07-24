import pool from '../../db/connection.js';
import bcrypt from 'bcrypt';
import { success, updated, deleted, noData, notFound, conflict, validationError, forbidden, serverError } from '../utils/response.js';

export const getAllUsers = async (req, res) => {
  try {
    const { department_id } = req.query;
    const params = [];
    let query;

    if (req.user.role === 'admin') {
      query = `
        SELECT id, username, email, name, role,
          department_id, avatar_url, created_at
        FROM users
        WHERE deleted_at IS NULL
      `;
      if (department_id) {
        query += ' AND department_id = ?';
        params.push(department_id);
      }
    } else if (req.user.role === 'lead') {
      query = `
        SELECT id, username, name, role,
          department_id, avatar_url
        FROM users
        WHERE deleted_at IS NULL
          AND department_id = (
            SELECT id FROM departments WHERE lead_id = ?
          )
      `;
      params.push(req.user.id);
    } else {
      query = `
        SELECT username, role
        FROM users
        WHERE deleted_at IS NULL
          AND department_id = (
            SELECT department_id FROM users WHERE id = ?
          )
      `;
      params.push(req.user.id);
    }

    const [rows] = await pool.query(query, params);
    if (rows.length === 0) return noData(res, 'No users found.', rows);
    success(res, rows);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const getUserById = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, email, name, role, department_id, avatar_url, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );
    if (rows.length === 0) return notFound(res, 'User not found.');
    success(res, rows[0]);
  } catch (err) {
    serverError(res, err.message);
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, currentPassword } = req.body;

    const [users] = await pool.query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
    if (users.length === 0) return notFound(res, 'User not found.');
    const user = users[0];

    if (email && email.trim() !== user.email) {
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email.trim(), id]
      );
      if (existing.length > 0) return conflict(res, 'Email already taken.');
    }

    if (password && password.trim() !== '') {
      const isSelf = id === req.user.id;
      const isAdmin = req.user.role === 'admin';

      if (!isAdmin || isSelf) {
        if (!currentPassword)
          return validationError(res, 'Current password is required to change password.');

        const [passwords] = await pool.query(
          'SELECT password FROM passwords WHERE user_id = ?',
          [id]
        );
        const match = await bcrypt.compare(currentPassword, passwords[0].password);
        if (!match) return validationError(res, 'Current password is incorrect.');
      }

      const hashed = await bcrypt.hash(password.trim(), 10);
      await pool.query('UPDATE passwords SET password = ? WHERE user_id = ?', [hashed, id]);
    }

    await pool.query(
      'UPDATE users SET name = ?, email = ? WHERE id = ?',
      [
        name !== undefined ? name.trim() : user.name,
        email !== undefined ? email.trim() : user.email,
        id
      ]
    );

    updated(res, null, 'User updated successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, department_id } = req.body;

    const validRoles = ['admin', 'lead', 'shift_manager', 'employee'];
    if (!validRoles.includes(role))
      return validationError(res, 'Invalid role.');

    if (req.user.role === 'lead') {
      if (!['employee', 'shift_manager'].includes(role))
        return forbidden(res, 'Leads can only promote to shift manager or demote to employee.');
    }
    const [users] = await pool.query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
    if (users.length === 0) return notFound(res, 'User not found.');

    await pool.query(
      'UPDATE users SET role = ?, department_id = ? WHERE id = ?',
      [role, department_id || null, id]
    );

    updated(res, null, 'User role updated successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return validationError(res, 'No image file provided.');

    const avatarUrl = `/uploads/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.params.id]);

    updated(res, { avatar_url: avatarUrl }, 'Avatar updated.');
  } catch (err) {
    serverError(res, err.message);
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id)
      return validationError(res, 'You cannot delete your own account.');

    const [users] = await pool.query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
    if (users.length === 0) return notFound(res, 'User not found.');

    // Soft delete — historical shift/leave/swap records reference this user
    // by id and must keep resolving their name correctly; a hard DELETE
    // would cascade (per the FK constraints) and silently blank those out.
    await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [id]);
    deleted(res, 'User deleted successfully.');
  } catch (err) {
    serverError(res, err.message);
  }
};