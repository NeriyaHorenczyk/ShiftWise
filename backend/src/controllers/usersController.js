import pool from '../../db/connection.js';
import bcrypt from 'bcrypt';

export const getAllUsers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, email, name, role, department_id, avatar_url, created_at FROM users'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getUserById = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, email, name, role, department_id, avatar_url, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, currentPassword } = req.body;

    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found.' });
    const user = users[0];

    if (email && email.trim() !== user.email) {
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email.trim(), id]
      );
      if (existing.length > 0) return res.status(409).json({ error: 'Email already taken.' });
    }

    if (password && password.trim() !== '') {
      const isSelf = id === req.user.id;
      const isAdmin = req.user.role === 'admin';

      if (!isAdmin || isSelf) {
        if (!currentPassword)
          return res.status(400).json({ error: 'Current password is required to change password.' });

        const [passwords] = await pool.query(
          'SELECT password FROM passwords WHERE user_id = ?',
          [id]
        );
        const match = await bcrypt.compare(currentPassword, passwords[0].password);
        if (!match) return res.status(400).json({ error: 'Current password is incorrect.' });
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

    res.json({ message: 'User updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, department_id } = req.body;

    const validRoles = ['admin', 'lead', 'shift_manager', 'employee'];
    if (!validRoles.includes(role))
      return res.status(400).json({ error: 'Invalid role.' });

    const [users] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found.' });

    await pool.query(
      'UPDATE users SET role = ?, department_id = ? WHERE id = ?',
      [role, department_id || null, id]
    );

    res.json({ message: 'User role updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id)
      return res.status(400).json({ error: 'You cannot delete your own account.' });

    const [users] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found.' });

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};