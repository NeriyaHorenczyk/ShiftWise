import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { authenticate } from './middleware/auth.middleware.js';
import { notFound, forbidden, serverError } from './utils/response.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js'
import departmentsRouter from './routes/departments.js';
import shiftsRouter from './routes/shifts.js'
import availabilityRouter from './routes/availability.js';
import swapsRouter from './routes/swaps.js';
import leaveRouter from './routes/leave.js';
import reportsRouter from './routes/reports.js';
import blueprintRouter from './routes/blueprint.js';
import dashboardRouter from './routes/dashboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Only the frontend's own origin may talk to this API — anything else
// (another port, another domain) gets a hard 403 rather than the default
// cors() behavior of silently omitting the Access-Control-Allow-Origin
// header. Requests carrying no Origin header at all (direct address-bar
// navigation, curl, server-to-server calls) aren't cross-origin requests in
// the browser sense, so they skip this check and fall through to the JWT
// `authenticate` middleware below, which is what actually rejects them
// (401) if they have no valid bearer token — CORS itself never blocks a
// same-origin or header-less request.
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin !== CLIENT_URL) {
    return forbidden(res, 'This origin is not permitted to access this API.');
  }
  next();
});

app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Serve uploaded files as static. Every upload gets a fresh UUID filename
// (see upload.middleware.js) and is never overwritten in place — a changed
// avatar gets a brand-new URL rather than new bytes at the old one — so it's
// safe to cache each file's bytes forever under its current URL.
app.use('/uploads', express.static(join(__dirname, '../uploads'), {
  maxAge: '1y',
  immutable: true,
}));

// Public routes
app.use('/auth', authRouter);

// Protected routes — more routers added here as we build each layer
app.use(authenticate);

app.use('/users', usersRouter);
app.use('/departments', departmentsRouter);
app.use('/shifts', shiftsRouter);
app.use('/availability', availabilityRouter);
app.use('/swaps', swapsRouter);
app.use('/leave', leaveRouter);
app.use('/reports', reportsRouter);
app.use('/blueprints', blueprintRouter);
app.use('/dashboard', dashboardRouter);

// 404s and thrown/passed-through errors still need to come back as JSON,
// otherwise the frontend gets Express's default HTML page and fails to parse it.
app.use((req, res) => {
  notFound(res, 'Not found.');
});

app.use((err, req, res, next) => {
  console.error(err);
  serverError(res, err.message || 'Something went wrong.');
});

export default app;