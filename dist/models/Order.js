import mongoose, { Schema } from 'mongoose';
export var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "PENDING";
    PaymentStatus["PAID"] = "PAID";
    PaymentStatus["FAILED"] = "FAILED";
})(PaymentStatus || (PaymentStatus = {}));
export var OrderStatus;
(function (OrderStatus) {
    OrderStatus["PLACED"] = "PLACED";
    OrderStatus["CONFIRMED"] = "CONFIRMED";
    OrderStatus["DISPATCHED"] = "DISPATCHED";
    OrderStatus["DELIVERED"] = "DELIVERED";
    OrderStatus["CANCELLED"] = "CANCELLED";
})(OrderStatus || (OrderStatus = {}));
const OrderSchema = new Schema({
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
    },
    createdAt: { type: Date, default: Date.now },
});
export default mongoose.model('Order', OrderSchema);
