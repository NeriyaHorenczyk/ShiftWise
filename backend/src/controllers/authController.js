import pool from '../../db/connection.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { created, success, conflict, unauthorized, serverError } from '../utils/response.js';
import { withTransaction } from '../utils/transaction.js';

export const register = async (req, res) => {
  try {
    const { username, email, name, password } = req.body;

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE (username = ? OR email = ?) AND deleted_at IS NULL',
      [username, email]
    );
    if (existing.length > 0)
      return conflict(res, 'Username or email already taken.');

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // The account row and its password row must land together — if the
    // second insert failed after the first committed, the account would
    // exist with no password and could never log in.
    await withTransaction(async (conn) => {
      await conn.query(
        'INSERT INTO users (id, username, email, name) VALUES (?, ?, ?, ?)',
        [userId, username, email, name]
      );
      await conn.query(
        'INSERT INTO passwords (user_id, password) VALUES (?, ?)',
        [userId, hashedPassword]
      );
    });

    created(res, { username }, 'User registered successfully.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return conflict(res, 'Username or email already taken.');
    serverError(res, err.message);
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // department name is joined in here (rather than a separate lookup) so
    // it lands in the login response's user object and can be cached client
    // -side in AuthContext — Profile.jsx's department-name field reads it
    // straight from there instead of firing its own GET /departments/:id.
    const [users] = await pool.query(
      `SELECT u.*, p.password AS hashed, d.name AS department
       FROM users u
       JOIN passwords p ON u.id = p.user_id
       LEFT JOIN departments d ON u.department_id = d.id AND d.deleted_at IS NULL
       WHERE u.username = ? AND u.deleted_at IS NULL`,
      [username]
    );
    if (users.length === 0)
      return unauthorized(res, 'Invalid username or password.');

    const user = users[0];
    const match = await bcrypt.compare(password, user.hashed);
    if (!match)
      return unauthorized(res, 'Invalid username or password.');

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    success(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        department_id: user.department_id,
        department: user.department,
        avatar_url: user.avatar_url,
        created_at: user.created_at
      }
    }, 'Login successful.');
  } catch (err) {
    serverError(res, err.message);
  }
};