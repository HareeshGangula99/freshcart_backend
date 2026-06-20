import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User, { UserRole, UserStatus } from '../models/User';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const otpStore = new Map<string, { otp: string; expiresAt: number }>();

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateToken = (user: any) => {
  return jwt.sign({ id: user._id, role: user.role, status: user.status }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '7d',
  });
};

export const sendOtp = async (req: Request, res: Response) => {
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
        await axios.post('https://api.msg91.com/api/v5/otp', {
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
      } catch (msg91Error: any) {
        console.error('MSG91 error:', msg91Error.response?.data || msg91Error.message);
        console.log(` OTP for ${phone}: ${otp}`);
      }
    } else {
      console.log(` OTP for ${phone}: ${otp} (MSG91 not configured - dev mode)`);
    }

    res.json({ message: 'OTP sent successfully' });
  } catch (error: any) {
    console.error('sendOtp error:', error);
    res.status(500).json({ message: error.message || 'Failed to send OTP' });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
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

    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        name: `User ${phone.slice(-4)}`,
        phone,
        email: `${phone}@freshcart.phone`,
        authProvider: 'phone',
        role: UserRole.USER,
        status: UserStatus.APPROVED,
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
  } catch (error: any) {
    console.error('verifyOtp error:', error);
    res.status(500).json({ message: error.message || 'OTP verification failed' });
  }
};
