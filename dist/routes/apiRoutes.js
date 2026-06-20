import express from 'express';
import { register, login, getProfile, googleLogin, phoneLogin } from '../controllers/authController';
import { getProducts, getProductById, createProduct, updateStock, deleteProduct, getCategories } from '../controllers/productController';
import { createRazorpayOrder, verifyPayment } from '../controllers/paymentController';
import { getUserOrders, getManagerOrders, dispatchOrder, updateOrderStatus, getPartnerOrders } from '../controllers/orderController';
import { getPendingApprovals, approveUser, createDeliveryPartner, getDeliveryPartners, // ✅ New import
 } from '../controllers/adminController';
import { protect, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';
import { upload } from '../middleware/upload';
const router = express.Router();
// Auth
router.post('/auth/signup', register);
router.post('/auth/login', login);
router.post('/auth/google', googleLogin);
router.post('/auth/phone', phoneLogin);
router.get('/user/profile', protect, getProfile);
// Products
router.get('/products', getProducts);
router.get('/products/:id', getProductById);
router.get('/categories', getCategories);
router.post('/admin/products', protect, authorize(UserRole.ADMIN), upload.single('image'), createProduct);
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
export default router;
