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
exports.verifyOtp = exports.sendOtp = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importStar(require("../models/User"));
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const otpStore = new Map();
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};
const generateToken = (user) => {
    return jsonwebtoken_1.default.sign({ id: user._id, role: user.role, status: user.status }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '7d',
    });
};
const sendOtp = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ message: 'Phone number is required' });
        }
        const otp = generateOTP();
        const expiresAt = Date.now() + 5 * 60 * 1000;
        otpStore.set(phone, { otp, expiresAt });
        const MSG91_API_KEY = process.env.MSG91_API_KEY;
        const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;
        if (MSG91_API_KEY && MSG91_TEMPLATE_ID) {
            try {
                await axios_1.default.post('https://api.msg91.com/api/v5/otp', {
                    mobile: phone.replace('+91', ''),
                    otp: otp,
                    msg: `Your FreshCart verification code is ${otp}. Valid for 5 minutes.`,
                }, {
                    headers: {
                        'authkey': MSG91_API_KEY,
                        'Content-Type': 'application/json',
                    },
                });
                console.log(' OTP sent via MSG91 to:', phone);
            }
            catch (msg91Error) {
                console.error('MSG91 error:', msg91Error.response?.data || msg91Error.message);
                console.log(` OTP for ${phone}: ${otp}`);
            }
        }
        else {
            console.log(` OTP for ${phone}: ${otp} (MSG91 not configured - dev mode)`);
        }
        res.json({ message: 'OTP sent successfully' });
    }
    catch (error) {
        console.error('sendOtp error:', error);
        res.status(500).json({ message: error.message || 'Failed to send OTP' });
    }
};
exports.sendOtp = sendOtp;
const verifyOtp = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        if (!phone || !otp) {
            return res.status(400).json({ message: 'Phone number and OTP are required' });
        }
        const stored = otpStore.get(phone);
        if (!stored) {
            return res.status(400).json({ message: 'OTP not found. Please request a new one.' });
        }
        if (Date.now() > stored.expiresAt) {
            otpStore.delete(phone);
            return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
        }
        if (stored.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
        }
        otpStore.delete(phone);
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
            token: generateToken(user),
        });
    }
    catch (error) {
        console.error('verifyOtp error:', error);
        res.status(500).json({ message: error.message || 'OTP verification failed' });
    }
};
exports.verifyOtp = verifyOtp;
