import mongoose, { Schema } from 'mongoose';
const DeliveryPartnerSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    vehicleType: { type: String, required: true },
    isAvailable: { type: Boolean, default: true },
    rating: { type: Number, default: 5 },
    currentLocation: {
        lat: { type: Number },
        lng: { type: Number },
    },
});
export default mongoose.model('DeliveryPartner', DeliveryPartnerSchema);
