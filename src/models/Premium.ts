import mongoose, { Schema, Document } from 'mongoose';

export enum PremiumType {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export interface IPremiumPlan extends Document {
  name: string;
  type: PremiumType;
  price: number;
  freeDeliveryAbove?: number;
  deliveryFee?: number;
  discountPercent?: number;
  isActive: boolean;
  createdAt: Date;
}

const PremiumPlanSchema: Schema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: Object.values(PremiumType), required: true },
  price: { type: Number, required: true },
  freeDeliveryAbove: { type: Number, default: 0 },
  deliveryFee: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IPremiumPlan>('PremiumPlan', PremiumPlanSchema);

export interface IUserPremium extends Document {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}

const UserPremiumSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: Schema.Types.ObjectId, ref: 'PremiumPlan', required: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
});

UserPremiumSchema.index({ userId: 1, isActive: 1 });

export const UserPremium = mongoose.model<IUserPremium>('UserPremium', UserPremiumSchema);
