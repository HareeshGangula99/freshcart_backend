import mongoose, { Schema, Document } from 'mongoose';

export enum UserRole {
  USER = 'USER',
  STORE_MANAGER = 'STORE_MANAGER',
  DELIVERY_PARTNER = 'DELIVERY_PARTNER',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  status: UserStatus;
  authProvider: 'local' | 'google' | 'phone';
  avatar?: string;
  address: {
    street: string;
    city: string;
    zip: string;
  };
  phone: string;
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  role: { type: String, enum: Object.values(UserRole), default: UserRole.USER },
  status: { type: String, enum: Object.values(UserStatus), default: UserStatus.APPROVED },
  authProvider: { type: String, enum: ['local', 'google', 'phone'], default: 'local' },
  avatar: { type: String },
  address: {
    street: { type: String },
    city: { type: String },
    zip: { type: String },
  },
  phone: { type: String },
  createdAt: { type: Date, default: Date.now },
});

UserSchema.index({ phone: 1 });
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ status: 1 });

export default mongoose.model<IUser>('User', UserSchema);
