import mongoose, { Schema, Document } from 'mongoose';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

export enum OrderStatus {
  PLACED = 'PLACED',
  CONFIRMED = 'CONFIRMED',
  DISPATCHED = 'DISPATCHED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  products: Array<{
    productId: mongoose.Types.ObjectId;
    quantity: number;
    priceAtPurchase: number;
  }>;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  deliveryPartnerId?: mongoose.Types.ObjectId;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  deliveryAddress: {
    street: string;
    city: string;
    zip: string;
    lat?: number;
    lng?: number;
  };
  deliveryProof?: string;
  deliveryPartnerLocation?: {
    lat: number;
    lng: number;
    updatedAt: Date;
  };
  customerLocation?: {
    lat: number;
    lng: number;
  };
  createdAt: Date;
}

const OrderSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  products: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    priceAtPurchase: { type: Number, required: true },
  }],
  totalAmount: { type: Number, required: true },
  paymentStatus: { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING },
  orderStatus: { type: String, enum: Object.values(OrderStatus), default: OrderStatus.PLACED },
  deliveryPartnerId: { type: Schema.Types.ObjectId, ref: 'User' },
  razorpayOrderId: { type: String, required: true },
  razorpayPaymentId: { type: String },
  deliveryAddress: {
    street: { type: String },
    city: { type: String },
    zip: { type: String },
    lat: { type: Number },
    lng: { type: Number },
  },
  deliveryProof: { type: String },
  deliveryPartnerLocation: {
    lat: { type: Number },
    lng: { type: Number },
    updatedAt: { type: Date },
  },
  customerLocation: {
    lat: { type: Number },
    lng: { type: Number },
  },
  createdAt: { type: Date, default: Date.now },
});

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ deliveryPartnerId: 1, orderStatus: 1 });
OrderSchema.index({ paymentStatus: 1, orderStatus: 1 });
OrderSchema.index({ razorpayOrderId: 1 });
OrderSchema.index({ orderStatus: 1, createdAt: -1 });

export default mongoose.model<IOrder>('Order', OrderSchema);
