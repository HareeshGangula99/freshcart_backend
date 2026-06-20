import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage {
  senderId: mongoose.Types.ObjectId;
  text: string;
  timestamp: Date;
}

export interface IChat extends Document {
  orderId: mongoose.Types.ObjectId;
  participants: Array<{
    userId: mongoose.Types.ObjectId;
    role: string;
  }>;
  messages: IMessage[];
}

const ChatSchema: Schema = new Schema({
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

export default mongoose.model<IChat>('Chat', ChatSchema);
