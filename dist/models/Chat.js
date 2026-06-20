import mongoose, { Schema } from 'mongoose';
const ChatSchema = new Schema({
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    participants: [{
            userId: { type: Schema.Types.ObjectId, ref: 'User' },
            role: { type: String },
        }],
    messages: [{
            senderId: { type: Schema.Types.ObjectId, ref: 'User' },
            text: { type: String },
            timestamp: { type: Date, default: Date.now },
        }],
});
export default mongoose.model('Chat', ChatSchema);
