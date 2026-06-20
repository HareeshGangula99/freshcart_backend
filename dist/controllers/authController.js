"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.phoneLogin = exports.getProfile = exports.googleLogin = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const google_auth_library_1 = require("google-auth-library");
const User_1 = __importStar(require("../models/User"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const googleClient = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const generateToken = (id) => {
    return jsonwebtoken_1.default.sign({ id, role: 'USER', status: 'APPROVED' }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '7d',
    });
};
// Note: In a real app, we'd fetch the role and status from the DB for the token
const generateTokenWithUser = (user) => {
    return jsonwebtoken_1.default.sign({ id: user._id, role: user.role, status: user.status }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '7d',
    });
};
const register = async (req, res) => {
    try {
        const { name, email, password, role, phone, address } = req.body;
        const userExists = await User_1.default.findOne({ email });
        if (userExists)
            return res.status(400).json({ message: 'User already exists' });
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await User_1.default.create({
            name,
            email,
            password: hashedPassword,
            role: role || User_1.UserRole.USER,
            status: role === User_1.UserRole.STORE_MANAGER ? User_1.UserStatus.PENDING : User_1.UserStatus.APPROVED,
            phone,
            address,
        });
        res.status(201).json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateTokenWithUser(user),
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User_1.default.findOne({ email });
        if (!user)
            return res.status(400).json({ message: 'Invalid email or password' });
        const isMatch = await bcryptjs_1.default.compare(password, user.password || '');
        if (!isMatch)
            return res.status(400).json({ message: 'Invalid email or password' });
        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateTokenWithUser(user),
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.login = login;
const googleLogin = async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ message: 'Google credential is required' });
        }
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload) {
            return res.status(400).json({ message: 'Invalid Google credential' });
        }
        const { sub: googleId, email, name, picture } = payload;
        let user = await User_1.default.findOne({ email });
        if (!user) {
            user = await User_1.default.create({
                name: name || 'Google User',
                email,
                authProvider: 'google',
                avatar: picture,
                role: User_1.UserRole.USER,
                status: User_1.UserStatus.APPROVED,
            });
        }
        else {
            if (!user.authProvider) {
                user.authProvider = 'local';
            }
            if (picture && !user.avatar) {
                user.avatar = picture;
            }
            await user.save();
        }
        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateTokenWithUser(user),
        });
    }
    catch (error) {
        console.error('Google login error:', error);
        res.status(500).json({ message: error.message || 'Google login failed' });
    }
};
exports.googleLogin = googleLogin;
const getProfile = async (req, res) => {
    const user = await User_1.default.findById(req.user.id).select('-password');
    res.json(user);
};
exports.getProfile = getProfile;
const phoneLogin = async (req, res) => {
    try {
        const { phone, firebaseToken } = req.body;
        if (!phone) {
            return res.status(400).json({ message: 'Phone number is required' });
        }
        let user = await User_1.default.findOne({ phone });
        if (!user) {
            user = await User_1.default.create({
                name: `User ${phone.slice(-4)}`,
                phone,
                email: `${phone}@freshcart.phone`,
                authProvider: 'phone',
                role: User_1.UserRole.USER,
                status: User_1.UserStatus.APPROVED,
            });
        }
        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            token: generateTokenWithUser(user),
        });
    }
    catch (error) {
        console.error('Phone login error:', error);
        res.status(500).json({ message: error.message || 'Phone login failed' });
    }
};
exports.phoneLogin = phoneLogin;
