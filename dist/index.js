"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const apiRoutes_1 = __importDefault(require("./routes/apiRoutes"));
const chatHandler_1 = require("./socket/chatHandler");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',');
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
};
const io = new socket_io_1.Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            }
            else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 60000,
});
// Rate limiting
const generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { message: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: 'Too many auth attempts, please try again later' },
});
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json({ limit: '10kb' }));
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
app.use('/api', generalLimiter);
// ✅ Attach io to every request so controllers can emit socket events
app.use((req, _res, next) => {
    req.io = io;
    next();
});
// Routes
app.use('/api', apiRoutes_1.default);
// Socket.io logic
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    (0, chatHandler_1.setupChatHandler)(io, socket);
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/freshcart';
mongoose_1.default.connect(MONGODB_URI)
    .then(() => {
    console.log('Connected to MongoDB');
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        // Verify SMTP on startup
        if (process.env.SMTP_HOST) {
            console.log('📧 SMTP config found, verifying...');
            const t = nodemailer_1.default.createTransport({
                host: process.env.SMTP_HOST,
                port: 465,
                secure: true,
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
                tls: { rejectUnauthorized: false },
                connectionTimeout: 10000,
                family: 4,
            });
            t.verify()
                .then(() => console.log('✅ SMTP connection verified'))
                .catch((e) => console.error('❌ SMTP connection failed:', e.message));
        }
        else {
            console.log('⚠️ SMTP not configured - emails disabled');
        }
    });
})
    .catch((err) => console.error('MongoDB connection error:', err));
