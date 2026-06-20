import mongoose, { Schema } from 'mongoose';
const ProductSchema = new Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    category: { type: String, required: true },
    imageURL: { type: String },
    stockQuantity: { type: Number, required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
});
export default mongoose.model('Product', ProductSchema);
