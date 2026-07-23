import jwt from 'jsonwebtoken';
import { unauthorized, forbidden } from '../utils/response.js';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return unauthorized(res, 'Access denied. No token provided.');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    unauthorized(res, 'Invalid or expired token.');
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return forbidden(res, 'Access denied. Insufficient permissions.');
  }
  next();
};

export const requireSelfOrAdmin = (req, res, next) => {
  if (req.params.id !== req.user.id && req.user.role !== 'admin') {
    return forbidden(res, 'Access denied. You can only manage your own data.');
  }
  next();
};