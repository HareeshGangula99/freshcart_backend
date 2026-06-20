import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  icon: string;
  color: string;
  createdAt: Date;
}

const CategorySchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  icon: { type: String, default: 'bi-grid' },
  color: { type: String, default: '#059669' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<ICategory>('Category', CategorySchema);
