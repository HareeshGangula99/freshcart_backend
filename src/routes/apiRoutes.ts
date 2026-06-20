import express from 'express';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import { register, login, getProfile, googleLogin } from '../controllers/authController';
import { sendOtp, verifyOtp } from '../controllers/otpController';
import { getProducts, getProductById, createProduct, updateProduct, updateStock, deleteProduct, getCategories } from '../controllers/productController';
import { getCategories as getAllCategories, createCategory, deleteCategory } from '../controllers/categoryController';
import { createRazorpayOrder, verifyPayment } from '../controllers/paymentController';
import { getUserOrders, getManagerOrders, dispatchOrder, updateOrderStatus, getPartnerOrders, getActiveDeliveries, getOrderTracking } from '../controllers/orderController';

import {
  getPendingApprovals,
  approveUser,
  createDeliveryPartner,
  getDeliveryPartners,
} from '../controllers/adminController';
import { protect, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many auth attempts, please try again later' },
});

// Auth
router.post('/auth/signup', authLimiter, register);
router.post('/auth/login', authLimiter, login);
router.post('/auth/google', authLimiter, googleLogin);
router.post('/auth/send-otp', authLimiter, sendOtp);
router.post('/auth/verify-otp', authLimiter, verifyOtp);
router.get('/user/profile', protect, getProfile);

// Products
router.get('/products', getProducts);
router.get('/products/:id', getProductById);
router.get('/categories', getCategories);

// Category Management
router.get('/admin/categories', protect, authorize(UserRole.ADMIN), getAllCategories);
router.post('/admin/categories', protect, authorize(UserRole.ADMIN), createCategory);
router.delete('/admin/categories/:id', protect, authorize(UserRole.ADMIN), deleteCategory);
router.post('/admin/products', protect, authorize(UserRole.ADMIN), createProduct);
router.put('/admin/products/:id', protect, authorize(UserRole.ADMIN), updateProduct);
router.put('/manager/products/:id', protect, authorize(UserRole.STORE_MANAGER), updateStock);
router.delete('/admin/products/:id', protect, authorize(UserRole.ADMIN), deleteProduct);

// Payments & Orders
router.post('/orders/create', protect, createRazorpayOrder);
router.post('/orders/verify', verifyPayment);
router.get('/orders/user', protect, getUserOrders);
router.get('/orders/manager', protect, authorize(UserRole.STORE_MANAGER), getManagerOrders);
router.patch('/orders/:id/dispatch', protect, authorize(UserRole.STORE_MANAGER), dispatchOrder);
router.patch('/orders/:id/status', protect, authorize(UserRole.DELIVERY_PARTNER), updateOrderStatus);

// Admin
router.get('/admin/requests', protect, authorize(UserRole.ADMIN), getPendingApprovals);
router.patch('/admin/approve/:id', protect, authorize(UserRole.ADMIN), approveUser);
router.post('/admin/partners', protect, authorize(UserRole.ADMIN), createDeliveryPartner);

// ✅ New: Delivery partners list (manager can fetch for dispatch dropdown)
router.get('/admin/delivery-partners', protect, authorize(UserRole.STORE_MANAGER), getDeliveryPartners);
router.get('/orders/partner', protect, authorize(UserRole.DELIVERY_PARTNER), getPartnerOrders);
router.get('/orders/active-deliveries', protect, authorize(UserRole.ADMIN), getActiveDeliveries);
router.get('/orders/:id/tracking', protect, getOrderTracking);

// Test email endpoint - REMOVE after debugging
router.post('/test-email', async (_req, res) => {
  try {
    console.log('📧 Test email triggered');
    console.log('SMTP_HOST:', process.env.SMTP_HOST);
    console.log('SMTP_PORT:', process.env.SMTP_PORT);
    console.log('SMTP_USER:', process.env.SMTP_USER);
    console.log('SMTP_PASS exists:', !!process.env.SMTP_PASS);
    console.log('SMTP_FROM:', process.env.SMTP_FROM);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
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
  } catch (error: any) {
    console.error('❌ Test email failed:', error.message);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});


export default router;
