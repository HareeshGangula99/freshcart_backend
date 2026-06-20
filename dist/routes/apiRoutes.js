"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const authController_1 = require("../controllers/authController");
const otpController_1 = require("../controllers/otpController");
const productController_1 = require("../controllers/productController");
const categoryController_1 = require("../controllers/categoryController");
const paymentController_1 = require("../controllers/paymentController");
const orderController_1 = require("../controllers/orderController");
const adminController_1 = require("../controllers/adminController");
const auth_1 = require("../middleware/auth");
const User_1 = require("../models/User");
const router = express_1.default.Router();
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: 'Too many auth attempts, please try again later' },
});
// Auth
router.post('/auth/signup', authLimiter, authController_1.register);
router.post('/auth/login', authLimiter, authController_1.login);
router.post('/auth/google', authLimiter, authController_1.googleLogin);
router.post('/auth/send-otp', authLimiter, otpController_1.sendOtp);
router.post('/auth/verify-otp', authLimiter, otpController_1.verifyOtp);
router.get('/user/profile', auth_1.protect, authController_1.getProfile);
// Products
router.get('/products', productController_1.getProducts);
router.get('/products/:id', productController_1.getProductById);
router.get('/categories', productController_1.getCategories);
// Category Management
router.get('/admin/categories', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.ADMIN), categoryController_1.getCategories);
router.post('/admin/categories', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.ADMIN), categoryController_1.createCategory);
router.delete('/admin/categories/:id', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.ADMIN), categoryController_1.deleteCategory);
router.post('/admin/products', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.ADMIN), productController_1.createProduct);
router.put('/admin/products/:id', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.ADMIN), productController_1.updateProduct);
router.put('/manager/products/:id', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.STORE_MANAGER), productController_1.updateStock);
router.delete('/admin/products/:id', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.ADMIN), productController_1.deleteProduct);
// Payments & Orders
router.post('/orders/create', auth_1.protect, paymentController_1.createRazorpayOrder);
router.post('/orders/verify', paymentController_1.verifyPayment);
router.get('/orders/user', auth_1.protect, orderController_1.getUserOrders);
router.get('/orders/manager', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.STORE_MANAGER), orderController_1.getManagerOrders);
router.patch('/orders/:id/dispatch', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.STORE_MANAGER), orderController_1.dispatchOrder);
router.patch('/orders/:id/status', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.DELIVERY_PARTNER), orderController_1.updateOrderStatus);
// Admin
router.get('/admin/requests', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.ADMIN), adminController_1.getPendingApprovals);
router.patch('/admin/approve/:id', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.ADMIN), adminController_1.approveUser);
router.post('/admin/partners', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.ADMIN), adminController_1.createDeliveryPartner);
// ✅ New: Delivery partners list (manager can fetch for dispatch dropdown)
router.get('/admin/delivery-partners', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.STORE_MANAGER), adminController_1.getDeliveryPartners);
router.get('/orders/partner', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.DELIVERY_PARTNER), orderController_1.getPartnerOrders);
router.get('/orders/active-deliveries', auth_1.protect, (0, auth_1.authorize)(User_1.UserRole.ADMIN), orderController_1.getActiveDeliveries);
router.get('/orders/:id/tracking', auth_1.protect, orderController_1.getOrderTracking);
// Test email endpoint - REMOVE after debugging
router.post('/test-email', async (_req, res) => {
    try {
        console.log('📧 Test email triggered');
        console.log('SMTP_HOST:', process.env.SMTP_HOST);
        console.log('SMTP_PORT:', process.env.SMTP_PORT);
        console.log('SMTP_USER:', process.env.SMTP_USER);
        console.log('SMTP_PASS exists:', !!process.env.SMTP_PASS);
        console.log('SMTP_FROM:', process.env.SMTP_FROM);
        const transporter = nodemailer_1.default.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: { rejectUnauthorized: false },
        });
        await transporter.verify();
        console.log('✅ SMTP verify passed');
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM,
            to: process.env.SMTP_USER,
            subject: 'FreshCart Test Email',
            html: '<h1 style="color:green;">FreshCart SMTP is working!</h1><p>This is a test email from your backend.</p>',
        });
        console.log('✅ Test email sent:', info.messageId);
        res.json({ success: true, messageId: info.messageId, message: 'Email sent to ' + process.env.SMTP_USER });
    }
    catch (error) {
        console.error('❌ Test email failed:', error.message);
        res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
});
exports.default = router;
