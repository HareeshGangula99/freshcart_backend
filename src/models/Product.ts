import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  category: string;
  categories: string[];
  uom: string;
  uomValue: number;
  imageURL: string;
  stockQuantity: number;
  storeId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const ProductSchema: Schema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  category: { type: String },
  categories: [{ type: String }],
  uom: { type: String, default: 'qty', enum: ['kg', 'g', 'qty', 'ltr', 'ml', 'dozen', 'piece'] },
  uomValue: { type: Number, default: 1 },
  imageURL: { type: String },
  stockQuantity: { type: Number, required: true },
  storeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

ProductSchema.index({ category: 1, createdAt: -1 });
ProductSchema.index({ categories: 1 });
ProductSchema.index({ name: 'text' });
ProductSchema.index({ storeId: 1 });

export default mongoose.model<IProduct>('Product', ProductSchema);
