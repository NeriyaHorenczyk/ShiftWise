import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import pool from '../../db/connection.js';

// The single Socket.IO server instance for the whole process. Controllers
// never construct or touch this directly — they only ever call the
// emit* helpers below, so this module is the one place that knows how
// rooms are named and how failures are handled.
let io = null;

// Resolves which rooms a connecting socket should join, mirroring the same
// department-isolation rules enforced everywhere else in this app (see the
// `role === 'lead'` / `role === 'employee'` branches throughout
// shiftController.js etc.): an employee only ever gets broadcasts for their
// own department, a lead's department also gets a `:managers` room for
// manager-only events (e.g. a new swap request), and only admins span every
// department at once.
const resolveRooms = async (user) => {
  const rooms = [`user:${user.id}`]; // always present — personal notifications (leave status, etc.)

  if (user.role === 'admin') {
    rooms.push('role:admin');
    return rooms;
  }

  if (user.role === 'lead') {
    const [[dept]] = await pool.query('SELECT id FROM departments WHERE lead_id = ?', [user.id]);
    if (dept) rooms.push(`dept:${dept.id}`, `dept:${dept.id}:managers`);
    return rooms;
  }

  // employee / shift_manager
  const [[me]] = await pool.query('SELECT department_id FROM users WHERE id = ?', [user.id]);
  if (me?.department_id) rooms.push(`dept:${me.department_id}`);
  return rooms;
};

/**
 * Creates and configures the Socket.IO server, attached to the same HTTP
 * server Express is using (a plain app.listen() call doesn't expose the
 * underlying http.Server socket.io needs, which is why server.js switches
 * to http.createServer(app) + httpServer.listen(...) instead).
 */
export const initSocket = (httpServer, clientUrl) => {
  io = new Server(httpServer, {
    cors: {
      origin: clientUrl,
      credentials: true,
    },
  });

  // Same JWT the REST API uses, just carried differently: there's no
  // Authorization header on a WebSocket handshake, so the client sends the
  // token via the `auth` payload instead. Any missing/invalid token rejects
  // the connection outright, exactly like the authenticate Express
  // middleware does for HTTP requests.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Access denied. No token provided.'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch (err) {
      next(new Error('Invalid or expired token.'));
    }
  });

  io.on('connection', async (socket) => {
    try {
      const rooms = await resolveRooms(socket.user);
      await Promise.all(rooms.map(room => socket.join(room)));
    } catch (err) {
      // A failed room lookup shouldn't crash the connection — the socket
      // just won't receive department-scoped events until it reconnects
      // (e.g. after a transient DB hiccup).
      console.error('[socket] room resolution failed:', err.message);
    }
  });

  io.on('connect_error', (err) => {
    console.error('[socket] connection error:', err.message);
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized. Call initSocket() first.');
  }
  return io;
};

// Every real-time push is a nice-to-have layered on top of an HTTP request
// that already succeeded — it must never be able to fail loudly enough to
// break that request. Every emit* helper below swallows its own errors.
const safeEmit = (label, fn) => {
  try {
    fn();
  } catch (err) {
    console.error(`[socket] failed to emit ${label}:`, err.message);
  }
};

// Broadcast to everyone currently viewing this department's schedule
// (employees, shift managers, the lead) plus all admins — never wider than
// that, so shift data for one department is never pushed to another.
export const emitScheduleUpdated = (departmentId, payload = {}) => {
  if (!departmentId) return;
  safeEmit('schedule:updated', () => {
    getIO().to(`dept:${departmentId}`).to('role:admin').emit('schedule:updated', { department_id: departmentId, ...payload });
  });
};

// Personal notification to the one employee whose leave request changed.
export const emitLeaveStatusChanged = (userId, payload = {}) => {
  if (!userId) return;
  safeEmit('leave:status_changed', () => {
    getIO().to(`user:${userId}`).emit('leave:status_changed', payload);
  });
};

// Manager-only notification (the department's lead + all admins) that a new
// swap request needs attention — regular employees in the department don't
// get this one.
export const emitSwapRequested = (departmentId, payload = {}) => {
  if (!departmentId) return;
  safeEmit('swap:requested', () => {
    getIO().to(`dept:${departmentId}:managers`).to('role:admin').emit('swap:requested', payload);
  });
};
