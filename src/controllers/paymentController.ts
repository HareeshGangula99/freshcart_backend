import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import Order, { PaymentStatus, OrderStatus } from '../models/Order';
import Product from '../models/Product';
import User, { UserRole, UserStatus } from '../models/User';
import { sendEmail } from '../config/email';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

export const createRazorpayOrder = async (req: Request, res: Response) => {
  try {
    const { products, deliveryAddress, customerLocation } = req.body;

    let totalAmount = 0;
    const productIds = products.map((item: any) => item.productId);
    const dbProducts = await Product.find({ _id: { $in: productIds } });
    const productMap = new Map(dbProducts.map(p => [p._id.toString(), p]));

    const productDetails: { productId: string; quantity: number; priceAtPurchase: number }[] = [];

    for (const item of products) {
      const product = productMap.get(item.productId);
      if (!product) return res.status(404).json({ message: `Product not found: ${item.productId}` });
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
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery)}&limit=1&countrycodes=in`
          );
          const geoData = await geoRes.json();
          if (geoData.length > 0) {
            const lat = parseFloat(geoData[0].lat);
            const lng = parseFloat(geoData[0].lon);
            finalCustomerLocation = { lat, lng };
            finalDeliveryAddress = { ...deliveryAddress, lat, lng };
          }
        } catch (err) {
          console.error('Nominatim geocoding failed:', err);
        }
      }
    }

    const orderData: any = {
      userId: (req as any).user.id,
      products: productDetails,
      totalAmount,
      paymentStatus: PaymentStatus.PENDING,
      orderStatus: OrderStatus.PLACED,
      razorpayOrderId: razorpayOrder.id,
      deliveryAddress: finalDeliveryAddress,
    };

    if (finalCustomerLocation?.lat && finalCustomerLocation?.lng) {
      orderData.customerLocation = { lat: finalCustomerLocation.lat, lng: finalCustomerLocation.lng };
      if (!finalDeliveryAddress?.lat || !finalDeliveryAddress?.lng) {
        orderData.deliveryAddress = { ...finalDeliveryAddress, lat: finalCustomerLocation.lat, lng: finalCustomerLocation.lng };
      }
    } else if (finalDeliveryAddress?.lat && finalDeliveryAddress?.lng) {
      orderData.customerLocation = { lat: finalDeliveryAddress.lat, lng: finalDeliveryAddress.lng };
    }

    const order = await Order.create(orderData);

    res.json({
      orderId: razorpayOrder.id,
      amount: totalAmount,
      razorpayOrderId: order._id,
    });
  } catch (error: any) {
    console.error('❌ createRazorpayOrder error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { orderId, razorpayPaymentId } = req.body;

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        paymentStatus: PaymentStatus.PAID,
        orderStatus: OrderStatus.CONFIRMED,
        razorpayPaymentId,
      },
      { returnDocument: 'after' }
    )
      .populate('userId', 'name email')
      .populate('products.productId', 'name price');

    if (!order) return res.status(404).json({ message: 'Order not found' });

    const customer = order.userId as any;
    const orderAny = order as any;

    //  1. Stock decrease - bulk write
    const stockOps = order.products.map((item: any) => ({
      updateOne: {
        filter: { _id: (item.productId as any)._id },
        update: { $inc: { stockQuantity: -item.quantity } },
      }
    }));
    if (stockOps.length > 0) {
      await Product.bulkWrite(stockOps);
    }
    console.log(' Stock decreased');

    // Items list for emails
    const itemsList = order.products.map((item: any) =>
      `<li>${item.productId?.name} × ${item.quantity} — ₹${item.priceAtPurchase * item.quantity}</li>`
    ).join('');

    // 2. User confirmation email - async, don't block response
    sendEmail({
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
          <p><strong>Deliver To:</strong> ${orderAny.deliveryAddress?.street}${orderAny.deliveryAddress?.building ? ', ' + orderAny.deliveryAddress.building : ''}${orderAny.deliveryAddress?.landmark ? ' (Near ' + orderAny.deliveryAddress.landmark + ')' : ''}, ${orderAny.deliveryAddress?.city} - ${orderAny.deliveryAddress?.zip}</p>
          <br/>
          <p>We'll notify you once your order is dispatched!</p>
          <p style="color:#6b7280;font-size:12px;">Thank you for shopping with FreshCart!</p>
        </div>
      `,
    }).then(() => console.log('User email sent:', customer.email))
      .catch(e => console.error('User email failed:', e));

    //  3. Manager notification - async, don't block response
    User.find({ role: UserRole.STORE_MANAGER, status: UserStatus.APPROVED }).select('email name').then(managers => {
      for (const manager of managers) {
        sendEmail({
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
              <p><strong>Address:</strong> ${orderAny.deliveryAddress?.street}${orderAny.deliveryAddress?.building ? ', ' + orderAny.deliveryAddress.building : ''}${orderAny.deliveryAddress?.landmark ? ' (Near ' + orderAny.deliveryAddress.landmark + ')' : ''}, ${orderAny.deliveryAddress?.city} - ${orderAny.deliveryAddress?.zip}</p>
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

  } catch (error: any) {
    console.error('❌ verifyPayment error:', error);
    res.status(500).json({ message: error.message });
  }
};
