import { Response } from 'express';
import mongoose from 'mongoose';
import Order, { OrderStatus, PaymentStatus } from '../models/Order';
import Product from '../models/Product';
import Category from '../models/Category';
import User, { UserRole, UserStatus } from '../models/User';
import DeliveryPartner from '../models/DeliveryPartner';
import { AuthRequest } from '../middleware/auth';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const looksLikeOrderId = (text: string): boolean => {
  return /^\d{4,24}$/.test(text.trim());
};

const statusMap: Record<string, string> = {
  PLACED: 'Order Placed',
  CONFIRMED: 'Confirmed',
  DISPATCHED: 'Dispatched',
  OUT_FOR_DELIVERY: 'On The Way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const matchesAny = (text: string, keywords: string[]): boolean => {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
};

const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ============ MANAGER OPERATIONS ============

const handleManagerPendingOrders = async (): Promise<string> => {
  const orders = await Order.find({
    paymentStatus: PaymentStatus.PAID,
    orderStatus: { $in: [OrderStatus.PLACED, OrderStatus.CONFIRMED] },
  })
    .populate('userId', 'name phone')
    .populate('products.productId', 'name')
    .sort({ createdAt: -1 })
    .limit(10);

  if (orders.length === 0) return '✅ **No pending orders** to dispatch right now. All caught up!';

  let reply = `📋 **Pending Orders** (${orders.length})\n\n`;
  orders.forEach((o, i) => {
    const id = o._id.toString().slice(-6).toUpperCase();
    const name = (o.userId as any)?.name || 'Customer';
    const items = o.products.map((p: any) => p.productId?.name || 'Product').join(', ');
    const date = new Date(o.createdAt).toLocaleDateString('en-IN');
    reply += `**${i + 1}.** #${id}\n`;
    reply += `   👤 ${name} | ₹${o.totalAmount}\n`;
    reply += `   📦 ${items}\n`;
    reply += `   📅 ${date}\n\n`;
  });

  reply += `💡 Say **"dispatch [order id]"** to dispatch an order (e.g., "dispatch ${orders[0]._id.toString().slice(-6).toUpperCase()}")`;
  return reply;
};

const handleManagerDispatch = async (msg: string, userId: string): Promise<string> => {
  const idMatch = msg.match(/dispatch\s+(\w+)/i);
  if (!idMatch) {
    return '❓ Please specify which order to dispatch.\n\nExample: **dispatch A3F2B1**\n\nSay **"pending orders"** to see all pending orders.';
  }

  const orderId = idMatch[1].toUpperCase();

  // Find the order
  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await Order.findOne({ _id: orderId, paymentStatus: PaymentStatus.PAID, orderStatus: { $in: [OrderStatus.PLACED, OrderStatus.CONFIRMED] } })
      .populate('userId', 'name');
  }
  if (!order) {
    const pendingOrders = await Order.find({ paymentStatus: PaymentStatus.PAID, orderStatus: { $in: [OrderStatus.PLACED, OrderStatus.CONFIRMED] } }).select('_id').limit(50);
    order = pendingOrders.find((o) => o._id.toString().slice(-6).toUpperCase() === orderId) || null;
  }

  if (!order) return `❌ Order **#${orderId}** not found or not pending dispatch.\n\nSay **"pending orders"** to see available orders.`;

  // Find an available delivery partner
  const partner = await DeliveryPartner.findOne({ isAvailable: true }).populate('userId', 'name');
  if (!partner) return '❌ No delivery partners available right now. Please try again later or create a partner from the admin panel.';

  // Dispatch the order
  order.orderStatus = OrderStatus.DISPATCHED;
  order.deliveryPartnerId = partner.userId._id;
  await order.save();

  const shortId = order._id.toString().slice(-6).toUpperCase();
  const partnerName = (partner.userId as any)?.name || 'Partner';

  // Emit socket event
  const io = (global as any).io;
  if (io) {
    io.to(`order_${order._id}`).emit('order_dispatched', { orderId: order._id, partnerName });
  }

  return `✅ **Order #${shortId} Dispatched!**\n\n👤 Customer: ${(order.userId as any)?.name || 'Customer'}\n🚚 Partner: **${partnerName}**\n📍 Status: **Dispatched**\n\nThe delivery partner has been notified.`;
};

const handleManagerInventory = async (): Promise<string> => {
  const products = await Product.find().sort({ stockQuantity: 1 }).limit(15);
  if (products.length === 0) return '📦 **No products** in inventory yet.';

  let reply = `📦 **Inventory** (${products.length} products)\n\n`;
  products.forEach((p, i) => {
    const stockLabel = p.stockQuantity <= 10 ? `⚠️ LOW (${p.stockQuantity})` : `${p.stockQuantity}`;
    reply += `**${i + 1}.** ${p.name}\n`;
    reply += `   📊 Stock: **${stockLabel}** ${p.uom || 'qty'}\n`;
    reply += `   💰 ₹${p.price} | 📂 ${p.category || 'N/A'}\n\n`;
  });

  reply += `💡 Say **"stock [product] [qty]"** to update (e.g., "stock milk 50")`;
  return reply;
};

const handleManagerStockUpdate = async (msg: string): Promise<string> => {
  // Strip common command words from the start
  let cleaned = msg.replace(/^(update|set|change|stock|the|product)\s+/gi, '').trim();
  // Also strip "to" in the middle: "milk to 50" → "milk 50"
  cleaned = cleaned.replace(/\s+to\s+/gi, ' ');

  const match = cleaned.match(/^(.+?)\s+(\d+)$/);
  if (!match) {
    return '❓ Please specify product and quantity.\n\nExamples:\n• **stock milk 50**\n• **update mango 100**\n• **rice 25**\n\nSay **"inventory"** to see all products.';
  }

  const productName = match[1].trim();
  const newQty = parseInt(match[2]);

  if (newQty <= 0) {
    return '❓ Quantity must be greater than 0.';
  }

  const product = await Product.findOne({ name: { $regex: new RegExp(`^${escapeRegex(productName)}$`, 'i') } });
  if (!product) {
    return `❌ Product **"${productName}"** not found.\n\nSay **"inventory"** to see all products.`;
  }

  const oldQty = product.stockQuantity;
  product.stockQuantity = newQty;
  await product.save();

  return `✅ **Stock Updated!**\n\n📦 Product: **${product.name}**\n📊 Old Stock: ${oldQty} ${product.uom || 'qty'}\n📊 New Stock: **${newQty}** ${product.uom || 'qty'}`;
};

const handleManagerLowStock = async (): Promise<string> => {
  const products = await Product.find({ stockQuantity: { $lte: 10 } }).sort({ stockQuantity: 1 });
  if (products.length === 0) return '✅ **No products with low stock.** All products have sufficient inventory.';

  let reply = `⚠️ **Low Stock Products** (${products.length})\n\n`;
  products.forEach((p, i) => {
    reply += `**${i + 1}.** ${p.name} — **${p.stockQuantity}** ${p.uom || 'qty'} left\n`;
  });

  reply += `\n💡 Say **"stock [product] [qty]"** to restock.`;
  return reply;
};

const handleManagerCategoryStock = async (msg: string): Promise<string> => {
  const catMatch = msg.match(/(?:stock|items|products?)\s+(?:for|in|of|under)\s+(.+)/i);
  if (!catMatch) {
    return '❓ Please specify the category.\n\nExample: **show stock for fruits**\n\nSay **"categories"** to see all categories.';
  }

  const catName = catMatch[1].trim();
  const products = await Product.find({ category: { $regex: new RegExp(escapeRegex(catName), 'i') } }).sort({ name: 1 });

  if (products.length === 0) {
    return `❌ No products found in category **"${catName}"**.\n\nSay **"categories"** to see all categories.`;
  }

  let reply = `📂 **${catName.charAt(0).toUpperCase() + catName.slice(1)}** (${products.length} items)\n\n`;
  products.forEach((p, i) => {
    const stockLabel = p.stockQuantity <= 10 ? `⚠️ ${p.stockQuantity}` : `${p.stockQuantity}`;
    reply += `**${i + 1}.** ${p.name} — **${stockLabel}** ${p.uom || 'qty'} | ₹${p.price}\n`;
  });

  reply += `\n💡 Say **"stock [product] [qty]"** to update any item.`;
  return reply;
};

const handleManagerCategories = async (): Promise<string> => {
  const categories = await Category.find().sort({ name: 1 });
  if (categories.length === 0) return '📂 **No categories** yet.';

  let reply = `📂 **Categories** (${categories.length})\n\n`;
  categories.forEach((c, i) => {
    reply += `**${i + 1}.** ${c.name}\n`;
  });

  reply += `\n💡 Say **"show stock for [category]"** to see items in a category.`;
  return reply;
};

// ============ ADMIN OPERATIONS ============

const handleAdminProducts = async (): Promise<string> => {
  const products = await Product.find().sort({ createdAt: -1 }).limit(10);
  if (products.length === 0) return '📦 **No products** yet. Add your first product from the Products tab.';

  let reply = `📦 **Products** (${products.length})\n\n`;
  products.forEach((p, i) => {
    reply += `**${i + 1}.** ${p.name}\n`;
    reply += `   💰 ₹${p.price} | 📊 Stock: ${p.stockQuantity} | 📂 ${p.category || 'N/A'}\n\n`;
  });

  return reply;
};

const handleAdminCategories = async (): Promise<string> => {
  const categories = await Category.find().sort({ name: 1 });
  if (categories.length === 0) return '📂 **No categories** yet. Add your first category from the Categories tab.';

  let reply = `📂 **Categories** (${categories.length})\n\n`;
  categories.forEach((c, i) => {
    reply += `**${i + 1}.** ${c.name}\n`;
  });

  return reply;
};

const handleAdminApprovals = async (): Promise<string> => {
  const pending = await User.find({ role: UserRole.STORE_MANAGER, status: UserStatus.PENDING }).select('name email createdAt');
  if (pending.length === 0) return '✅ **No pending approvals.** All store managers have been approved.';

  let reply = `⏳ **Pending Approvals** (${pending.length})\n\n`;
  pending.forEach((u, i) => {
    const date = new Date(u.createdAt).toLocaleDateString('en-IN');
    reply += `**${i + 1}.** ${u.name}\n   📧 ${u.email}\n   📅 Applied: ${date}\n\n`;
  });

  reply += `Go to the **Approvals** tab to approve.`;
  return reply;
};

const handleAdminPartners = async (): Promise<string> => {
  const partners = await User.find({ role: UserRole.DELIVERY_PARTNER }).select('name email phone').limit(10);
  if (partners.length === 0) return '🚚 **No delivery partners** yet. Create one from the Delivery Partners tab.';

  let reply = `🚚 **Delivery Partners** (${partners.length})\n\n`;
  partners.forEach((p, i) => {
    reply += `**${i + 1}.** ${p.name}\n   📧 ${p.email} | 📱 ${p.phone || 'N/A'}\n\n`;
  });

  return reply;
};

const handleAdminActiveDeliveries = async (): Promise<string> => {
  const orders = await Order.find({ orderStatus: { $in: [OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY] } })
    .populate('userId', 'name')
    .populate('deliveryPartnerId', 'name')
    .sort({ createdAt: -1 });

  if (orders.length === 0) return '✅ **No active deliveries** right now.';

  let reply = `🚚 **Active Deliveries** (${orders.length})\n\n`;
  orders.slice(0, 10).forEach((o, i) => {
    const id = o._id.toString().slice(-6).toUpperCase();
    const customer = (o.userId as any)?.name || 'Customer';
    const partner = (o.deliveryPartnerId as any)?.name || 'Unassigned';
    reply += `**${i + 1}.** #${id}\n   👤 ${customer} | 🚚 ${partner}\n   📍 ${statusMap[o.orderStatus] || o.orderStatus}\n\n`;
  });

  return reply;
};

// ============ PARTNER OPERATIONS ============

const handlePartnerDeliveries = async (userId: string): Promise<string> => {
  const orders = await Order.find({
    deliveryPartnerId: userId,
    orderStatus: { $in: [OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY] },
  })
    .populate('userId', 'name phone')
    .populate('products.productId', 'name')
    .sort({ createdAt: -1 });

  if (orders.length === 0) return '✅ **No active deliveries** assigned to you right now.';

  let reply = `🚚 **Your Active Deliveries** (${orders.length})\n\n`;
  orders.forEach((o, i) => {
    const id = o._id.toString().slice(-6).toUpperCase();
    const name = (o.userId as any)?.name || 'Customer';
    const addr = o.deliveryAddress ? `${o.deliveryAddress.street}${o.deliveryAddress.building ? ', ' + o.deliveryAddress.building : ''}${o.deliveryAddress.landmark ? ' (Near ' + o.deliveryAddress.landmark + ')' : ''}, ${o.deliveryAddress.city}` : 'N/A';
    reply += `**${i + 1}.** #${id}\n   👤 ${name} | 📱 ${(o.userId as any)?.phone || 'N/A'}\n   📍 ${addr}\n   📦 ${statusMap[o.orderStatus] || o.orderStatus}\n\n`;
  });

  reply += `Click **"Start Delivery"** on an order card to begin.`;
  return reply;
};

const handlePartnerDeliveredCount = async (userId: string): Promise<string> => {
  const count = await Order.countDocuments({ deliveryPartnerId: userId, orderStatus: OrderStatus.DELIVERED });
  return `🏆 **${count}** delivery${count !== 1 ? 'ies' : 'y'} completed. Great work!`;
};

// ============ GROQ API HELPER ============

const callGroqAI = async (systemMessage: string, history: any[], userMessage: string): Promise<string> => {
  const messages = [
    { role: 'system', content: systemMessage },
    ...(history || []).map((msg: { role: string; content: string }) => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: userMessage },
  ];

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: 250, temperature: 0.5 }),
  });

  if (!response.ok) {
    console.error('Groq API error:', await response.text());
    return 'Sorry, AI service temporarily unavailable. Please try again.';
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Sorry, I could not process your request.';
};

// ============ MAIN HANDLER ============

export const chatWithBot = async (req: AuthRequest, res: Response) => {
  try {
    const { message, history, orderContext, role } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'Chatbot service not configured' });
    }

    // --- Order context (from OrderHelpChat) ---
    if (orderContext) {
      const items = orderContext.items?.map((item: any) => `${item.name} x${item.qty} ₹${item.price}`).join(', ') || 'N/A';
      const address = orderContext.deliveryAddress ? `${orderContext.deliveryAddress.street}${orderContext.deliveryAddress.building ? ', ' + orderContext.deliveryAddress.building : ''}${orderContext.deliveryAddress.landmark ? ' (Near ' + orderContext.deliveryAddress.landmark + ')' : ''}, ${orderContext.deliveryAddress.city}` : 'N/A';
      const status = statusMap[orderContext.orderStatus] || orderContext.orderStatus;
      const orderId = orderContext.orderId.slice(-6).toUpperCase();

      const systemMessage = `You are FreshCart's AI support. You have the customer's order data below. USE IT. NEVER ask for order ID — you already have it.

ORDER #${orderId} | Status: ${status} | Items: ${items} | Total: ₹${orderContext.totalAmount} | Payment: ${orderContext.paymentStatus} | Address: ${address}

RULES:
- Answer directly from the order data above
- NEVER say "please provide your order ID"
- NEVER say "check My Orders"
- For status: tell the current status directly
- For delivery time: use status to estimate (OUT_FOR_DELIVERY="arriving soon", DISPATCHED="on the way", CONFIRMED="being prepared")
- For issues (missing/wrong/damaged): say "I've noted this for order #${orderId}, escalated to admin team for refund/redelivery"
- For refund: say "Refund request noted for order #${orderId}, escalated to admin for approval"
- Keep answers short (1-3 sentences)
- Use customer's language`;

      const reply = await callGroqAI(systemMessage, history, message);
      return res.json({ reply });
    }

    // --- Order ID lookup (USER role only) ---
    if (role !== 'ADMIN' && role !== 'STORE_MANAGER' && role !== 'DELIVERY_PARTNER' && looksLikeOrderId(message)) {
      const trimmed = message.trim();
      if (!req.user?.id) {
        return res.json({ reply: 'To track your order, please log in and go to **"My Orders"** to find your Order ID, or use the **"Order Help"** button.' });
      }

      let order = null;
      if (mongoose.Types.ObjectId.isValid(trimmed)) {
        order = await Order.findOne({ _id: trimmed, userId: req.user.id }).populate('products.productId', 'name price');
      }
      if (!order) {
        const userOrders = await Order.find({ userId: req.user.id }).populate('products.productId', 'name price').sort({ createdAt: -1 });
        order = userOrders.find((o) => o._id.toString().endsWith(trimmed)) || null;
      }
      if (!order) {
        return res.json({ reply: `❌ No order found with ID **"${trimmed}"**. Please check your order number from **"My Orders"**.` });
      }

      const items = order.products.map((item: any) => `${item.productId?.name || 'Product'} x${item.quantity} ₹${item.priceAtPurchase}`).join(', ');
      const address = order.deliveryAddress ? `${order.deliveryAddress.street}${order.deliveryAddress.building ? ', ' + order.deliveryAddress.building : ''}${order.deliveryAddress.landmark ? ' (Near ' + order.deliveryAddress.landmark + ')' : ''}, ${order.deliveryAddress.city}` : 'N/A';
      const status = statusMap[order.orderStatus] || order.orderStatus;
      const orderId = order._id.toString().slice(-6).toUpperCase();

      const systemMessage = `You are FreshCart's AI support. You have the customer's order data below. USE IT. NEVER ask for order ID.

ORDER #${orderId} | Status: ${status} | Items: ${items} | Total: ₹${order.totalAmount} | Payment: ${order.paymentStatus} | Address: ${address}

RULES: Answer directly. NEVER say "check My Orders". Keep answers short (1-3 sentences). Use customer's language.`;

      const reply = await callGroqAI(systemMessage, history, message);
      return res.json({ reply });
    }

    // ============ ROLE-BASED DATA & OPERATIONS ============
    const msg = message.trim();

    // --- MANAGER: stock update (must be before inventory check) ---
    if (role === 'STORE_MANAGER' && matchesAny(msg, ['update stock', 'stock ', 'set stock', 'change stock', 'restock', 'update ', 'set '])) {
      // Only trigger if it also has a number (product + qty)
      if (/\d/.test(msg)) {
        const reply = await handleManagerStockUpdate(msg);
        return res.json({ reply });
      }
    }

    // --- MANAGER: dispatch order ---
    if (role === 'STORE_MANAGER' && matchesAny(msg, ['dispatch '])) {
      const reply = await handleManagerDispatch(msg, req.user?.id || '');
      return res.json({ reply });
    }

    // --- MANAGER: category stock ---
    if (role === 'STORE_MANAGER' && matchesAny(msg, ['show stock for', 'items for', 'products for', 'stock in', 'items in'])) {
      const reply = await handleManagerCategoryStock(msg);
      return res.json({ reply });
    }

    // --- MANAGER: categories ---
    if (role === 'STORE_MANAGER' && matchesAny(msg, ['categor', 'all category'])) {
      const reply = await handleManagerCategories();
      return res.json({ reply });
    }

    // --- MANAGER: pending orders ---
    if (role === 'STORE_MANAGER' && matchesAny(msg, ['pending order', 'pending', 'orders to dispatch', 'undelivered'])) {
      const reply = await handleManagerPendingOrders();
      return res.json({ reply });
    }

    // --- MANAGER: inventory / stock list ---
    if (role === 'STORE_MANAGER' && matchesAny(msg, ['inventory', 'stock', 'product list', 'all product', 'current inventory'])) {
      const reply = await handleManagerInventory();
      return res.json({ reply });
    }

    // --- MANAGER: low stock ---
    if (role === 'STORE_MANAGER' && matchesAny(msg, ['low stock', 'running low'])) {
      const reply = await handleManagerLowStock();
      return res.json({ reply });
    }

    // --- ADMIN: products ---
    if (role === 'ADMIN' && matchesAny(msg, ['view all product', 'show product', 'all product', 'product list', 'view product'])) {
      const reply = await handleAdminProducts();
      return res.json({ reply });
    }

    // --- ADMIN: categories ---
    if (role === 'ADMIN' && matchesAny(msg, ['view categor', 'show categor', 'all categor', 'category list', 'list categor'])) {
      const reply = await handleAdminCategories();
      return res.json({ reply });
    }

    // --- ADMIN: approvals ---
    if (role === 'ADMIN' && matchesAny(msg, ['approval', 'pending user', 'pending approval', 'pending manager', 'registr'])) {
      const reply = await handleAdminApprovals();
      return res.json({ reply });
    }

    // --- ADMIN: delivery partners ---
    if (role === 'ADMIN' && matchesAny(msg, ['view partner', 'show partner', 'all partner', 'delivery partner list', 'list partner'])) {
      const reply = await handleAdminPartners();
      return res.json({ reply });
    }

    // --- ADMIN: active deliveries ---
    if (role === 'ADMIN' && matchesAny(msg, ['active deliver', 'live track', 'all active', 'tracking'])) {
      const reply = await handleAdminActiveDeliveries();
      return res.json({ reply });
    }

    // --- PARTNER: my deliveries ---
    if (role === 'DELIVERY_PARTNER' && matchesAny(msg, ['my deliver', 'assigned', 'active deliver', 'my order'])) {
      const reply = await handlePartnerDeliveries(req.user?.id || '');
      return res.json({ reply });
    }

    // --- PARTNER: delivered count ---
    if (role === 'DELIVERY_PARTNER' && matchesAny(msg, ['completed', 'delivered', 'total deliver'])) {
      const reply = await handlePartnerDeliveredCount(req.user?.id || '');
      return res.json({ reply });
    }

    // ============ AI FALLBACK (general queries) ============
    let systemMessage: string;

    if (role === 'ADMIN') {
      const [pendingCount, productCount, categoryCount, activeCount, partnerCount] = await Promise.all([
        User.countDocuments({ role: UserRole.STORE_MANAGER, status: UserStatus.PENDING }),
        Product.countDocuments(),
        Category.countDocuments(),
        Order.countDocuments({ orderStatus: { $in: [OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY] } }),
        User.countDocuments({ role: UserRole.DELIVERY_PARTNER }),
      ]);

      systemMessage = `You are FreshCart's Admin Assistant.
STATS: Pending approvals: ${pendingCount} | Products: ${productCount} | Categories: ${categoryCount} | Active deliveries: ${activeCount} | Partners: ${partnerCount}
CAPABILITIES: Products, Categories, Approvals, Delivery Partners, Live Tracking tabs.
RULES: Guide to correct tab. Be polite, short (1-3 sentences), professional. Use customer's language.`;
    } else if (role === 'STORE_MANAGER') {
      const [pendingOrders, lowStockProducts] = await Promise.all([
        Order.countDocuments({ paymentStatus: PaymentStatus.PAID, orderStatus: { $in: [OrderStatus.PLACED, OrderStatus.CONFIRMED] } }),
        Product.countDocuments({ stockQuantity: { $lte: 10 } }),
      ]);

      systemMessage = `You are FreshCart's Store Manager Assistant.
STATS: Pending orders: ${pendingOrders} | Low stock: ${lowStockProducts}
CAPABILITIES: Say "pending orders" to see them, "inventory" for stock, "dispatch [id]" to dispatch, "stock [product] [qty]" to update, "show stock for [category]" for category items, "categories" for category list.
RULES: Guide to correct tab. Be polite, short (1-3 sentences), professional. Use customer's language.`;
    } else if (role === 'DELIVERY_PARTNER') {
      const [assignedOrders, deliveredToday] = await Promise.all([
        Order.countDocuments({ deliveryPartnerId: req.user?.id, orderStatus: { $in: [OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY] } }),
        Order.countDocuments({ deliveryPartnerId: req.user?.id, orderStatus: OrderStatus.DELIVERED }),
      ]);

      systemMessage = `You are FreshCart's Delivery Partner Assistant.
STATS: Active deliveries: ${assignedOrders} | Completed: ${deliveredToday}
CAPABILITIES: Say "my deliveries" to see orders, "delivered" for completed count. Click "Start Delivery" to begin, "Mark Delivered" after delivery.
RULES: Be polite, short (1-3 sentences), encouraging. Use customer's language.`;
    } else {
      systemMessage = `You are FreshCart's AI Customer Support Assistant. You help with orders, refunds, delivery, and general queries about FreshCart grocery delivery app.
RULES: Be polite, short (1-3 sentences), use customer's language. Never share internal details.
For order issues: ask for order ID. For refunds: ask for order ID and reason. For delivery: suggest checking My Orders.`;
    }

    const reply = await callGroqAI(systemMessage, history, message);
    res.json({ reply });
  } catch (error: any) {
    console.error('Chatbot error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
