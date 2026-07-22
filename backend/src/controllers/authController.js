import pool from '../../db/connection.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

export const register = async (req, res) => {
  try {
    const { username, email, name, password } = req.body;

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing.length > 0)
      return res.status(409).json({ error: 'Username or email already taken.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await pool.query(
      'INSERT INTO users (id, username, email, name) VALUES (?, ?, ?, ?)',
      [userId, username, email, name]
    );
    await pool.query(
      'INSERT INTO passwords (user_id, password) VALUES (?, ?)',
      [userId, hashedPassword]
    );

    res.status(201).json({ message: 'User registered successfully.', username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const [users] = await pool.query(
      'SELECT u.*, p.password AS hashed FROM users u JOIN passwords p ON u.id = p.user_id WHERE u.username = ?',
      [username]
    );
    if (users.length === 0)
      return res.status(401).json({ error: 'Invalid username or password.' });

    const user = users[0];
    const match = await bcrypt.compare(password, user.hashed);
    if (!match)
      return res.status(401).json({ error: 'Invalid username or password.' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        department_id: user.department_id,
        avatar_url: user.avatar_url,
        created_at: user.created_at
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};