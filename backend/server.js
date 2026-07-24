import 'dotenv/config';
import http from 'http';
import validateEnv from './src/utils/validateEnv.js';
import app from './src/app.js';
import { initSocket } from './src/services/socketService.js';

validateEnv()

const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';

// Socket.io needs the raw http.Server instance to attach to — a plain
// app.listen() creates one internally but never hands it back, so we create
// it explicitly here and let Express handle requests exactly as before.
const httpServer = http.createServer(app);
initSocket(httpServer, CLIENT_URL);

httpServer.listen(PORT, () => {
  console.log(`ShiftWise server running on port ${PORT}`);
});