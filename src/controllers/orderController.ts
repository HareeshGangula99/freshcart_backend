import { Request, Response } from 'express';
import Order, { PaymentStatus, OrderStatus } from '../models/Order';
import User from '../models/User';
import { sendEmail } from '../config/email';

export const getUserOrders = async (req: any, res: Response) => {
  try {
    const orders = await Order.find({ userId: req.user.id })
      .populate('products.productId', 'name price imageURL')
      .populate('deliveryPartnerId', 'name email phone')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getManagerOrders = async (req: any, res: Response) => {
  try {
    const orders = await Order.find({
      paymentStatus: PaymentStatus.PAID,
      orderStatus: { $nin: [OrderStatus.DELIVERED] },
    })
      .populate('userId', 'name email')
      .populate('products.productId', 'name price')
      .populate('deliveryPartnerId', 'name email')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getPartnerOrders = async (req: any, res: Response) => {
  try {
    const orders = await Order.find({
      deliveryPartnerId: req.user.id,
      orderStatus: { $in: [OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY] },
    })
      .populate('userId', 'name email phone')
      .populate('products.productId', 'name price imageURL')
      .select('+customerLocation +deliveryAddress')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const dispatchOrder = async (req: any, res: Response) => {
  try {
    const { deliveryPartnerId } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { orderStatus: 'DISPATCHED', deliveryPartnerId },
      { returnDocument: 'after' }
    ).populate('userId deliveryPartnerId');

    if (!order) return res.status(404).json({ message: 'Order not found' });

    const customer = order.userId as any;
    const partner = order.deliveryPartnerId as any;

    const io = (req as any).io;
    if (io) {
      io.to(`order_${order._id}`).emit('order_dispatched', {
        orderId: order._id,
        partnerName: partner?.name || 'Delivery Partner',
      });
    }

    res.json({ message: 'Order dispatched and partner assigned', order });

    // Send dispatch email async (don't block response)
    sendEmail({
      to: customer.email,
      subject: 'Your FreshCart Order is On The Way!',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
          <h2 style="color:#16a34a;">Your order is dispatched!</h2>
          <p>Hello <strong>${customer.name}</strong>,</p>
          <p>Your order <strong>#${order._id.toString().slice(-8).toUpperCase()}</strong> is on the way!</p>
          <p><strong>Delivery Partner:</strong> ${partner?.name}</p>
          <p><strong>Partner Phone:</strong> ${partner?.phone || 'N/A'}</p>
          <br/>
          <p style="color:#6b7280;font-size:12px;">Thank you for shopping with FreshCart!</p>
        </div>
      `,
    }).then(() => console.log('Dispatch email sent:', customer.email))
      .catch(e => console.error('Dispatch email failed:', e));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOrderStatus = async (req: any, res: Response) => {
  try {
    const { status, deliveryProof } = req.body;

    const updateData: any = { orderStatus: status };
    if (deliveryProof) updateData.deliveryProof = deliveryProof;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { returnDocument: 'after' }
    )
      .populate('userId', 'name email')
      .populate('products.productId', 'name price');

    if (!order) return res.status(404).json({ message: 'Order not found' });

    const io = (req as any).io;

    if (status === 'DELIVERED') {
      const customer = order.userId as any;

      const itemsRows = order.products.map((item: any) => {
        const product = item.productId;
        const subtotal = item.priceAtPurchase * item.quantity;
        return `
          <tr>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${product?.name || 'Product'}</td>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">₹${item.priceAtPurchase}</td>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">₹${subtotal}</td>
          </tr>
        `;
      }).join('');

      const deliveredDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'long', day: 'numeric',
      });

      if (io) {
        io.to(`order_${order._id}`).emit('order_delivered', { orderId: order._id });
      }

      res.json(order);

      sendEmail({
        to: customer.email,
        subject: 'Invoice - FreshCart Order Delivered!',
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:#16a34a;padding:24px;text-align:center;"><h1 style="color:white;margin:0;font-size:24px;">🛒 FreshCart</h1><p style="color:#dcfce7;margin:4px 0 0;">Order Invoice</p></div>
          <div style="padding:24px;">
            <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin-bottom:24px;"><p style="margin:0;color:#166534;">✅ <strong>Order Delivered Successfully!</strong></p><p style="margin:4px 0 0;color:#6b7280;font-size:14px;">Delivered on ${deliveredDate}</p></div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tr style="background:#f9fafb;"><td style="padding:8px 10px;font-weight:600;color:#374151;">Order ID</td><td style="padding:8px 10px;color:#374151;">#${order._id.toString().slice(-8).toUpperCase()}</td></tr><tr><td style="padding:8px 10px;font-weight:600;color:#374151;">Customer</td><td style="padding:8px 10px;color:#374151;">${customer.name}</td></tr><tr style="background:#f9fafb;"><td style="padding:8px 10px;font-weight:600;color:#374151;">Delivered To</td><td style="padding:8px 10px;color:#374151;">${(order as any).deliveryAddress?.street}${(order as any).deliveryAddress?.building ? ', ' + (order as any).deliveryAddress.building : ''}${(order as any).deliveryAddress?.landmark ? ' (Near ' + (order as any).deliveryAddress.landmark + ')' : ''}, ${(order as any).deliveryAddress?.city} - ${(order as any).deliveryAddress?.zip}</td></tr></table>
            <h3 style="color:#374151;margin-bottom:8px;">Items Ordered</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="background:#f3f4f6;"><th style="padding:10px;text-align:left;color:#6b7280;">Item</th><th style="padding:10px;text-align:center;color:#6b7280;">Qty</th><th style="padding:10px;text-align:right;color:#6b7280;">Subtotal</th></tr></thead><tbody>${itemsRows}</tbody><tfoot><tr><td colspan="2" style="padding:12px 10px;text-align:right;font-weight:700;font-size:16px;">Total Paid</td><td style="padding:12px 10px;text-align:right;font-weight:700;font-size:16px;color:#16a34a;">₹${order.totalAmount}</td></tr></tfoot></table>
            <div style="margin-top:24px;padding:16px;background:#f9fafb;border-radius:8px;text-align:center;"><p style="margin:0;color:#6b7280;font-size:13px;">Thank you for shopping with <strong>FreshCart</strong>! 🌿</p></div>
          </div>
        </div>`,
      }).then(() => console.log('Invoice email sent:', customer.email))
        .catch(e => console.error('Invoice email failed:', e));

    } else {
      res.json(order);
    }
  } catch (error: any) {
    console.error('updateOrderStatus error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getActiveDeliveries = async (req: any, res: Response) => {
  try {
    const orders = await Order.find({
      orderStatus: { $in: [OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY] },
      deliveryPartnerId: { $exists: true },
    })
      .populate('userId', 'name email phone')
      .populate('deliveryPartnerId', 'name email phone')
      .populate('products.productId', 'name price imageURL')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrderTracking = async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.id)
      .select('deliveryPartnerLocation customerLocation deliveryAddress orderStatus deliveryPartnerId')
      .populate('deliveryPartnerId', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

