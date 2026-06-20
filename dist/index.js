import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/apiRoutes';
import { setupChatHandler } from './socket/chatHandler';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
// ✅ Attach io to every request so controllers can emit socket events
app.use((req, _res, next) => {
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
