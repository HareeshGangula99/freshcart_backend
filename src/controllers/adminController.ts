import { Request, Response } from 'express';
import User, { UserRole, UserStatus } from '../models/User';
import bcrypt from 'bcryptjs';

export const getPendingApprovals = async (req: Request, res: Response) => {
  try {
    const users = await User.find({ status: UserStatus.PENDING });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const approveUser = async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: UserStatus.APPROVED },
      { returnDocument: 'after' }
    );
    res.json({ message: 'User approved', user });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createDeliveryPartner = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const partner = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      role: UserRole.DELIVERY_PARTNER,
      status: UserStatus.APPROVED,
    });
    res.status(201).json({ message: 'Delivery partner created', partner });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ New: Get all approved delivery partners (for manager dispatch dropdown)
export const getDeliveryPartners = async (req: Request, res: Response) => {
  try {
    const partners = await User.find({
      role: UserRole.DELIVERY_PARTNER,
      status: UserStatus.APPROVED,
    }).select('_id name email phone');
    res.json(partners);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
