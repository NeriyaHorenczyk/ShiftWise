import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import authenticate from './middleware/auth.middleware.js';
import authRouter from './routes/auth.js';

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

export default app;