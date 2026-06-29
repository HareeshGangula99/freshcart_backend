import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
  handlingFee: number;
  gstRate: number;
  freeDeliveryAbove: number;
  deliveryFee: number;
}

const SettingsSchema: Schema = new Schema({
  handlingFee: { type: Number, default: 5 },
  gstRate: { type: Number, default: 5 },
  freeDeliveryAbove: { type: Number, default: 200 },
  deliveryFee: { type: Number, default: 30 },
});

export default mongoose.model<ISettings>('Settings', SettingsSchema);
