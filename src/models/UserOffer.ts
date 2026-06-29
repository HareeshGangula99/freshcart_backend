import mongoose, { Schema, Document } from 'mongoose';

export interface IUserOffer extends Document {
  name: string;
  userIds: mongoose.Types.ObjectId[];
  freeDeliveryAbove?: number;
  deliveryFee?: number;
  priceOverrides?: { productId: mongoose.Types.ObjectId; customPrice: number }[];
  isActive: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

const UserOfferSchema: Schema = new Schema({
  name: { type: String, required: true },
  userIds: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  freeDeliveryAbove: { type: Number },
  deliveryFee: { type: Number },
  priceOverrides: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    customPrice: { type: Number },
  }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

UserOfferSchema.index({ userIds: 1, isActive: 1 });

export default mongoose.model<IUserOffer>('UserOffer', UserOfferSchema);
