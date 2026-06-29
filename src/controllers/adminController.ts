import { Request, Response } from 'express';
import User, { UserRole, UserStatus } from '../models/User';
import DeliveryPartner from '../models/DeliveryPartner';
import Order from '../models/Order';
import UserOffer from '../models/UserOffer';
import PremiumPlan, { UserPremium, PremiumType } from '../models/Premium';
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
    const { name, email, password, phone, vehicleType } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const partner = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      role: UserRole.DELIVERY_PARTNER,
      status: UserStatus.APPROVED,
    });
    await DeliveryPartner.create({
      userId: partner._id,
      vehicleType: vehicleType || 'Bike',
    });
    res.status(201).json({ message: 'Delivery partner created', partner });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Delivery partners
export const getDeliveryPartners = async (req: Request, res: Response) => {
  try {
    const partners = await User.find({
      role: UserRole.DELIVERY_PARTNER,
      status: UserStatus.APPROVED,
    }).select('_id name email phone isBlocked createdAt');
    const partnerDocs = await DeliveryPartner.find({});
    const partnerMap = new Map(partnerDocs.map(p => [p.userId.toString(), p]));

    // Check active orders to determine free/busy status
    const activeOrders = await (Order as any).find({
      orderStatus: { $in: ['DISPATCHED', 'OUT_FOR_DELIVERY'] },
    }).select('deliveryPartnerId');
    const busyPartnerIds = new Set(activeOrders.map((o: any) => o.deliveryPartnerId?.toString()).filter(Boolean));

    const result = partners.map(p => ({
      ...p.toObject(),
      vehicleType: partnerMap.get(p._id.toString())?.vehicleType || 'Bike',
      rating: partnerMap.get(p._id.toString())?.rating || 5,
      isPartnerBlocked: partnerMap.get(p._id.toString())?.isBlocked || false,
      availability: busyPartnerIds.has(p._id.toString()) ? 'busy' : 'free',
    }));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const blockDeliveryPartner = async (req: Request, res: Response) => {
  try {
    const { blocked } = req.body;
    await DeliveryPartner.findOneAndUpdate(
      { userId: req.params.id },
      { isBlocked: blocked }
    );
    await User.findByIdAndUpdate(req.params.id, { isBlocked: blocked });
    res.json({ message: blocked ? 'Partner blocked' : 'Partner unblocked' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Users
export const getAllUsers = async (_req: Request, res: Response) => {
  try {
    const users = await User.find({ role: UserRole.USER })
      .select('_id name email phone isBlocked createdAt')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const blockUser = async (req: Request, res: Response) => {
  try {
    const { blocked } = req.body;
    await User.findByIdAndUpdate(req.params.id, { isBlocked: blocked });
    res.json({ message: blocked ? 'User blocked' : 'User unblocked' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// User Offers
export const getUserOffers = async (_req: Request, res: Response) => {
  try {
    const offers = await UserOffer.find({}).populate('userIds', 'name email').sort({ createdAt: -1 });
    res.json(offers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createUserOffer = async (req: Request, res: Response) => {
  try {
    const { name, userIds, freeDeliveryAbove, deliveryFee, priceOverrides, expiresAt } = req.body;
    const offer = await UserOffer.create({ name, userIds, freeDeliveryAbove, deliveryFee, priceOverrides, expiresAt });
    res.status(201).json(offer);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteUserOffer = async (req: Request, res: Response) => {
  try {
    await UserOffer.findByIdAndDelete(req.params.id);
    res.json({ message: 'Offer deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleUserOffer = async (req: Request, res: Response) => {
  try {
    const offer = await UserOffer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    offer.isActive = !offer.isActive;
    await offer.save();
    res.json(offer);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Premium Plans
export const getPremiumPlans = async (_req: Request, res: Response) => {
  try {
    const plans = await PremiumPlan.find({}).sort({ price: 1 });
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createPremiumPlan = async (req: Request, res: Response) => {
  try {
    const { name, type, price, freeDeliveryAbove, deliveryFee, discountPercent } = req.body;
    const plan = await PremiumPlan.create({ name, type, price, freeDeliveryAbove, deliveryFee, discountPercent });
    res.status(201).json(plan);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePremiumPlan = async (req: Request, res: Response) => {
  try {
    const { name, type, price, freeDeliveryAbove, deliveryFee, discountPercent, isActive } = req.body;
    const plan = await PremiumPlan.findByIdAndUpdate(
      req.params.id,
      { name, type, price, freeDeliveryAbove, deliveryFee, discountPercent, isActive },
      { returnDocument: 'after' }
    );
    res.json(plan);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deletePremiumPlan = async (req: Request, res: Response) => {
  try {
    await PremiumPlan.findByIdAndDelete(req.params.id);
    res.json({ message: 'Plan deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getPremiumSubscribers = async (_req: Request, res: Response) => {
  try {
    const subscribers = await UserPremium.find({ isActive: true })
      .populate('userId', 'name email')
      .populate('planId', 'name type price');
    res.json(subscribers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
