"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPayment = exports.createRazorpayOrder = void 0;
const razorpay_1 = __importDefault(require("razorpay"));
const Order_1 = __importStar(require("../models/Order"));
const Product_1 = __importDefault(require("../models/Product"));
const User_1 = __importStar(require("../models/User"));
const email_1 = require("../config/email");
const razorpay = new razorpay_1.default({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});
const createRazorpayOrder = async (req, res) => {
    try {
        const { products, deliveryAddress, customerLocation } = req.body;
        let totalAmount = 0;
        const productIds = products.map((item) => item.productId);
        const dbProducts = await Product_1.default.find({ _id: { $in: productIds } });
        const productMap = new Map(dbProducts.map(p => [p._id.toString(), p]));
        const productDetails = [];
        for (const item of products) {
            const product = productMap.get(item.productId);
            if (!product)
                return res.status(404).json({ message: `Product not found: ${item.productId}` });
            totalAmount += product.price * item.quantity;
            productDetails.push({ productId: item.productId, quantity: item.quantity, priceAtPurchase: product.price });
        }
        const razorpayOrder = await razorpay.orders.create({
            amount: totalAmount * 100,
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
        });
        let finalDeliveryAddress = deliveryAddress;
        let finalCustomerLocation = customerLocation;
        // If no coordinates from frontend, geocode the delivery address via Nominatim
        if ((!customerLocation?.lat || !customerLocation?.lng) && (!deliveryAddress?.lat || !deliveryAddress?.lng)) {
            const addressQuery = [deliveryAddress?.street, deliveryAddress?.city, 'India'].filter(Boolean).join(', ');
            if (addressQuery) {
                try {
                    const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery)}&limit=1&countrycodes=in`);
                    const geoData = await geoRes.json();
                    if (geoData.length > 0) {
                        const lat = parseFloat(geoData[0].lat);
                        const lng = parseFloat(geoData[0].lon);
                        finalCustomerLocation = { lat, lng };
                        finalDeliveryAddress = { ...deliveryAddress, lat, lng };
                    }
                }
                catch (err) {
                    console.error('Nominatim geocoding failed:', err);
                }
            }
        }
        const orderData = {
            userId: req.user.id,
            products: productDetails,
            totalAmount,
            paymentStatus: Order_1.PaymentStatus.PENDING,
            orderStatus: Order_1.OrderStatus.PLACED,
            razorpayOrderId: razorpayOrder.id,
            deliveryAddress: finalDeliveryAddress,
        };
        if (finalCustomerLocation?.lat && finalCustomerLocation?.lng) {
            orderData.customerLocation = { lat: finalCustomerLocation.lat, lng: finalCustomerLocation.lng };
            if (!finalDeliveryAddress?.lat || !finalDeliveryAddress?.lng) {
                orderData.deliveryAddress = { ...finalDeliveryAddress, lat: finalCustomerLocation.lat, lng: finalCustomerLocation.lng };
            }
        }
        else if (finalDeliveryAddress?.lat && finalDeliveryAddress?.lng) {
            orderData.customerLocation = { lat: finalDeliveryAddress.lat, lng: finalDeliveryAddress.lng };
        }
        const order = await Order_1.default.create(orderData);
        res.json({
            orderId: razorpayOrder.id,
            amount: totalAmount,
            razorpayOrderId: order._id,
        });
    }
    catch (error) {
        console.error('❌ createRazorpayOrder error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.createRazorpayOrder = createRazorpayOrder;
const verifyPayment = async (req, res) => {
    try {
        const { orderId, razorpayPaymentId } = req.body;
        const order = await Order_1.default.findByIdAndUpdate(orderId, {
            paymentStatus: Order_1.PaymentStatus.PAID,
            orderStatus: Order_1.OrderStatus.CONFIRMED,
            razorpayPaymentId,
        }, { returnDocument: 'after' })
            .populate('userId', 'name email')
            .populate('products.productId', 'name price');
        if (!order)
            return res.status(404).json({ message: 'Order not found' });
        const customer = order.userId;
        const orderAny = order;
        //  1. Stock decrease - bulk write
        const stockOps = order.products.map((item) => ({
            updateOne: {
                filter: { _id: item.productId._id },
                update: { $inc: { stockQuantity: -item.quantity } },
            }
        }));
        if (stockOps.length > 0) {
            await Product_1.default.bulkWrite(stockOps);
        }
        console.log(' Stock decreased');
        // Items list for emails
        const itemsList = order.products.map((item) => `<li>${item.productId?.name} × ${item.quantity} — ₹${item.priceAtPurchase * item.quantity}</li>`).join('');
        // 2. User confirmation email - async, don't block response
        (0, email_1.sendEmail)({
            to: customer.email,
            subject: 'Order Confirmed - FreshCart',
            html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
          <h2 style="color:#16a34a;">Order Confirmed!</h2>
          <p>Hello <strong>${customer.name}</strong>,</p>
          <p>Your order <strong>#${orderId.toString().slice(-8).toUpperCase()}</strong> has been confirmed.</p>
          <h3>Items Ordered:</h3>
          <ul>${itemsList}</ul>
          <p><strong>Total Paid:</strong> ₹${order.totalAmount}</p>
          <p><strong>Deliver To:</strong> ${orderAny.deliveryAddress?.street}, ${orderAny.deliveryAddress?.city} - ${orderAny.deliveryAddress?.zip}</p>
          <br/>
          <p>We'll notify you once your order is dispatched!</p>
          <p style="color:#6b7280;font-size:12px;">Thank you for shopping with FreshCart!</p>
        </div>
      `,
        }).then(() => console.log('User email sent:', customer.email))
            .catch(e => console.error('User email failed:', e));
        //  3. Manager notification - async, don't block response
        User_1.default.find({ role: User_1.UserRole.STORE_MANAGER, status: User_1.UserStatus.APPROVED }).select('email name').then(managers => {
            for (const manager of managers) {
                (0, email_1.sendEmail)({
                    to: manager.email,
                    subject: 'New Order Received - FreshCart',
                    html: `
            <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
              <h2 style="color:#16a34a;">New Order Alert!</h2>
              <p>Hello <strong>${manager.name}</strong>,</p>
              <p>Customer: <strong>${customer.name}</strong> (${customer.email})</p>
              <p>Order ID: <strong>#${orderId.toString().slice(-8).toUpperCase()}</strong></p>
              <h3>Items:</h3>
              <ul>${itemsList}</ul>
              <p><strong>Total:</strong> ₹${order.totalAmount}</p>
              <p><strong>Address:</strong> ${orderAny.deliveryAddress?.street}, ${orderAny.deliveryAddress?.city} - ${orderAny.deliveryAddress?.zip}</p>
              <br/>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager" style="background:#16a34a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;">
                Open Manager Dashboard
              </a>
            </div>
          `,
                }).catch(e => console.error('Manager email failed:', e));
            }
        }).catch(e => console.error('Manager fetch failed:', e));
        res.json({ message: 'Payment verified successfully', order });
    }
    catch (error) {
        console.error('❌ verifyPayment error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.verifyPayment = verifyPayment;
