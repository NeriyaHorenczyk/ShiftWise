import pool from '../../db/connection.js';
import bcrypt from 'bcrypt';
import { success, updated, deleted, noData, notFound, conflict, validationError, forbidden, serverError } from '../utils/response.js';

export const getAllUsers = async (req, res) => {
  try {
    const { department_id, search, role, exclude_id, limit, offset } = req.query;
    const conditions = ['deleted_at IS NULL'];
    const params = [];
    let columns;

    if (req.user.role === 'admin') {
      columns = 'id, username, email, name, role, department_id, avatar_url, created_at';
      // 'unassigned' is a frontend-only sentinel (Team.jsx's "Unassigned"
      // filter tab) — a real department is always a UUID, so it can never
      // collide with one.
      if (department_id === 'unassigned') {
        conditions.push('department_id IS NULL');
      } else if (department_id) {
        conditions.push('department_id = ?');
        params.push(department_id);
      }
    } else if (req.user.role === 'lead') {
      columns = 'id, username, name, role, department_id, avatar_url';
      conditions.push('department_id = (SELECT id FROM departments WHERE lead_id = ?)');
      params.push(req.user.id);
    } else {
      columns = 'username, role';
      conditions.push('department_id = (SELECT department_id FROM users WHERE id = ?)');
      params.push(req.user.id);
    }

    // Only admin/lead roster views (e.g. Team Availability, admin Users)
    // ever pass these.
    if (search && ['admin', 'lead'].includes(req.user.role)) {
      conditions.push('(name LIKE ? OR username LIKE ? OR email LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (role && ['admin', 'lead'].includes(req.user.role)) {
      const roles = role.split(',').filter(Boolean);
      if (roles.length > 0) {
        conditions.push(`role IN (${roles.map(() => '?').join(',')})`);
        params.push(...roles);
      }
    }
    // admin Users.jsx excludes the viewing admin from their own user list
    if (exclude_id && req.user.role === 'admin') {
      conditions.push('id != ?');
      params.push(exclude_id);
    }

    const whereClause = conditions.join(' AND ');

    // Pagination is opt-in via `limit` — Team.jsx, admin Users.jsx,
    // Schedule.jsx and others all call this endpoint expecting the full
    // unpaginated array they've always gotten. Only Team Availability's
    // roster fetch passes limit/offset, switching to the paginated envelope
    // so a large organization's full user list is never pulled at once.
    if (limit !== undefined) {
      const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
      const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM users WHERE ${whereClause}`,
        params
      );
      const [rows] = await pool.query(
        `SELECT ${columns} FROM users WHERE ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`,
        [...params, limitNum, offsetNum]
      );
      return success(res, { items: rows, total, limit: limitNum, offset: offsetNum });
    }

    const [rows] = await pool.query(`SELECT ${columns} FROM users WHERE ${whereClause}`, params);
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
    const { name, email, password, currentPassword, department_id } = req.body;

    const [users] = await pool.query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
    if (users.length === 0) return notFound(res, 'User not found.');
    const user = users[0];

    // Department assignment/transfer is admin-only — silently ignored for a
    // self-edit or a lead editing one of their own people, rather than
    // erroring the whole request over a field they had no business sending.
    let nextDepartmentId = user.department_id;
    if (req.user.role === 'admin' && 'department_id' in req.body) {
      if (department_id) {
        const [depts] = await pool.query('SELECT id FROM departments WHERE id = ?', [department_id]);
        if (depts.length === 0) return notFound(res, 'Department not found.');
        nextDepartmentId = department_id;
      } else {
        nextDepartmentId = null;
      }
    }

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
      'UPDATE users SET name = ?, email = ?, department_id = ? WHERE id = ?',
      [
        name !== undefined ? name.trim() : user.name,
        email !== undefined ? email.trim() : user.email,
        nextDepartmentId,
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