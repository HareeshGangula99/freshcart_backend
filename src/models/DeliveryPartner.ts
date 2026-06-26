import mongoose, { Schema, Document } from 'mongoose';

export interface IDeliveryPartner extends Document {
  userId: mongoose.Types.ObjectId;
  vehicleType: string;
  isAvailable: boolean;
  rating: number;
  currentLocation: {
    lat: number;
    lng: number;
  };
}

const DeliveryPartnerSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  vehicleType: { type: String, required: true },
  isAvailable: { type: Boolean, default: true },
  rating: { type: Number, default: 5 },
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number },
  },
});

DeliveryPartnerSchema.index({ isAvailable: 1 });

export default mongoose.model<IDeliveryPartner>('DeliveryPartner', DeliveryPartnerSchema);
