import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User, { UserRole, UserStatus } from '../models/User';
import dotenv from 'dotenv';

dotenv.config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (id: string) => {
  return jwt.sign({ id, role: 'USER', status: 'APPROVED' }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '7d',
  });
};

// Note: In a real app, we'd fetch the role and status from the DB for the token
const generateTokenWithUser = (user: any) => {
  return jwt.sign({ id: user._id, role: user.role, status: user.status }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '7d',
  });
};

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, phone, address } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || UserRole.USER,
      status: role === UserRole.STORE_MANAGER ? UserStatus.PENDING : UserStatus.APPROVED,
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
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateTokenWithUser(user),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const googleLogin = async (req: Request, res: Response) => {
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

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: name || 'Google User',
        email,
        authProvider: 'google',
        avatar: picture,
        role: UserRole.USER,
        status: UserStatus.APPROVED,
      });
    } else {
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
  } catch (error: any) {
    console.error('Google login error:', error);
    res.status(500).json({ message: error.message || 'Google login failed' });
  }
};

export const getProfile = async (req: any, res: Response) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json(user);
};

export const phoneLogin = async (req: Request, res: Response) => {
  try {
    const { phone, firebaseToken } = req.body;

    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

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
      token: generateTokenWithUser(user),
    });
  } catch (error: any) {
    console.error('Phone login error:', error);
    res.status(500).json({ message: error.message || 'Phone login failed' });
  }
};
