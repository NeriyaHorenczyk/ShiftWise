import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { authenticate } from './middleware/auth.middleware.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js'
import departmentsRouter from './routes/departments.js';
import shiftsRouter from './routes/shifts.js'
import availabilityRouter from './routes/availability.js';
import swapsRouter from './routes/swaps.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded files as static
app.use('/uploads', express.static(join(__dirname, '../uploads')));

// Public routes
app.use('/auth', authRouter);

// Protected routes — more routers added here as we build each layer
app.use(authenticate);

app.use('/users', usersRouter);
app.use('/departments', departmentsRouter);
app.use('/shifts', shiftsRouter);
app.use('/availability', availabilityRouter);
app.use('/swaps', swapsRouter);

export default app;