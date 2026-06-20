import Razorpay from 'razorpay';
import nodemailer from 'nodemailer';
import Order, { PaymentStatus, OrderStatus } from '../models/Order';
import Product from '../models/Product';
import User, { UserRole, UserStatus } from '../models/User';
import dotenv from 'dotenv';
dotenv.config();
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});
export const createRazorpayOrder = async (req, res) => {
    try {
        const { products, deliveryAddress } = req.body;
        let totalAmount = 0;
        const productDetails = [];
        for (const item of products) {
            const product = await Product.findById(item.productId);
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
        const order = await Order.create({
            userId: req.user.id,
            products: productDetails,
            totalAmount,
            paymentStatus: PaymentStatus.PENDING,
            orderStatus: OrderStatus.PLACED,
            razorpayOrderId: razorpayOrder.id,
            deliveryAddress,
        });
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
export const verifyPayment = async (req, res) => {
    try {
        const { orderId, razorpayPaymentId } = req.body;
        const order = await Order.findByIdAndUpdate(orderId, {
            paymentStatus: PaymentStatus.PAID,
            orderStatus: OrderStatus.CONFIRMED,
            razorpayPaymentId,
        }, { new: true })
            .populate('userId', 'name email')
            .populate('products.productId', 'name price');
        if (!order)
            return res.status(404).json({ message: 'Order not found' });
        const customer = order.userId;
        const orderAny = order;
        // ✅ 1. Stock decrease
        for (const item of order.products) {
            await Product.findByIdAndUpdate(item.productId._id, { $inc: { stockQuantity: -item.quantity } });
        }
        console.log('✅ Stock decreased');
        // Items list for emails
        const itemsList = order.products.map((item) => `<li>${item.productId?.name} × ${item.quantity} — ₹${item.priceAtPurchase * item.quantity}</li>`).join('');
        // ✅ 2. User ki confirmation email
        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM,
                to: customer.email,
                subject: '✅ Order Confirmed - FreshCart',
                html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
            <h2 style="color:#16a34a;">Order Confirmed! 🎉</h2>
            <p>Hello <strong>${customer.name}</strong>,</p>
            <p>Your order <strong>#${orderId.toString().slice(-8).toUpperCase()}</strong> has been confirmed.</p>
            <h3>Items Ordered:</h3>
            <ul>${itemsList}</ul>
            <p><strong>Total Paid:</strong> ₹${order.totalAmount}</p>
            <p><strong>Deliver To:</strong> ${orderAny.deliveryAddress?.street}, ${orderAny.deliveryAddress?.city} - ${orderAny.deliveryAddress?.zip}</p>
            <br/>
            <p>We'll notify you once your order is dispatched! 🚚</p>
            <p style="color:#6b7280;font-size:12px;">Thank you for shopping with FreshCart!</p>
          </div>
        `,
            });
            console.log('✅ User email sent:', customer.email);
        }
        catch (e) {
            console.error('User email failed:', e);
        }
        // ✅ 3. Manager ki new order notification email
        const managers = await User.find({ role: UserRole.STORE_MANAGER, status: UserStatus.APPROVED }).select('email name');
        for (const manager of managers) {
            try {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM,
                    to: manager.email,
                    subject: '🛒 New Order Received - FreshCart',
                    html: `
            <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
              <h2 style="color:#16a34a;">New Order Alert! 📦</h2>
              <p>Hello <strong>${manager.name}</strong>,</p>
              <p>Customer: <strong>${customer.name}</strong> (${customer.email})</p>
              <p>Order ID: <strong>#${orderId.toString().slice(-8).toUpperCase()}</strong></p>
              <h3>Items:</h3>
              <ul>${itemsList}</ul>
              <p><strong>Total:</strong> ₹${order.totalAmount}</p>
              <p><strong>Address:</strong> ${orderAny.deliveryAddress?.street}, ${orderAny.deliveryAddress?.city} - ${orderAny.deliveryAddress?.zip}</p>
              <br/>
              <a href="http://localhost:5173/manager" style="background:#16a34a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;">
                Open Manager Dashboard
              </a>
            </div>
          `,
                });
                console.log('✅ Manager email sent:', manager.email);
            }
            catch (e) {
                console.error('Manager email failed:', e);
            }
        }
        res.json({ message: 'Payment verified successfully', order });
    }
    catch (error) {
        console.error('❌ verifyPayment error:', error);
        res.status(500).json({ message: error.message });
    }
};
