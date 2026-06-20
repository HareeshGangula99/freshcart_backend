import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';
import apiRoutes from './routes/apiRoutes';
import { setupChatHandler } from './socket/chatHandler';

dotenv.config();

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',');

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
  pingInterval: 25000,
  pingTimeout: 60000,
});

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many auth attempts, please try again later' },
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10kb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api', generalLimiter);

// ✅ Attach io to every request so controllers can emit socket events
app.use((req: any, _res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api', apiRoutes);

// Socket.io logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  setupChatHandler(io, socket);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/freshcart';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => console.error('MongoDB connection error:', err));
