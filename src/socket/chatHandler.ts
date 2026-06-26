import { Server, Socket } from 'socket.io';
import Chat from '../models/Chat';
import Order from '../models/Order';

const locationDbThrottle: Record<string, number> = {};
const userSocketMap = new Map<string, string>(); // userId -> socketId

const cleanupOldMessages = async () => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await Chat.updateMany(
      {},
      { $pull: { messages: { timestamp: { $lt: oneHourAgo } } } }
    );
  } catch (error) {
    console.error('Error cleaning up old messages:', error);
  }
};

setInterval(cleanupOldMessages, 60 * 60 * 1000);

export const setupChatHandler = (io: Server, socket: Socket) => {
  socket.on('user_register', (userId: string) => {
    userSocketMap.set(userId, socket.id);
    console.log(`[Socket] User ${userId} registered with socket ${socket.id}`);
  });

  socket.on('join_order_room', (orderId: string) => {
    socket.join(`order_${orderId}`);
  });

  socket.on('join_room', (orderId: string) => {
    socket.join(`order_${orderId}`);
  });

  socket.on('order_confirmed', (data: { orderId: string; userId: string; userName: string; amount: number }) => {
    io.to(`managers`).emit('order_confirmed', data);
  });

  socket.on('order_dispatched', (data: { orderId: string; partnerName: string }) => {
    io.to(`order_${data.orderId}`).emit('order_dispatched', data);
  });

  socket.on('join_delivery_tracking', (orderId: string) => {
    socket.join(`tracking_${orderId}`);
  });

  socket.on('join_customer_tracking', (orderId: string) => {
    socket.join(`tracking_${orderId}`);
  });

  socket.on('join_admin_tracking', () => {
    socket.join('admin_tracking');
  });

  socket.on('update_delivery_location', async (data: { orderId: string; lat: number; lng: number }) => {
    io.to(`tracking_${data.orderId}`).emit('delivery_location_update', {
      orderId: data.orderId, lat: data.lat, lng: data.lng, updatedAt: new Date(),
    });
    io.to('admin_tracking').emit('delivery_location_update', {
      orderId: data.orderId, lat: data.lat, lng: data.lng, updatedAt: new Date(),
    });

    const now = Date.now();
    if (!locationDbThrottle[data.orderId] || now - locationDbThrottle[data.orderId] >= 10000) {
      locationDbThrottle[data.orderId] = now;
      try {
        await Order.findByIdAndUpdate(data.orderId, {
          deliveryPartnerLocation: { lat: data.lat, lng: data.lng, updatedAt: new Date() },
        });
      } catch (error) {
        console.error('Error updating delivery location:', error);
      }
    }
  });

  socket.on('update_customer_location', async (data: { orderId: string; lat: number; lng: number }) => {
    io.to(`tracking_${data.orderId}`).emit('customer_location_update', {
      orderId: data.orderId, lat: data.lat, lng: data.lng,
    });

    const now = Date.now();
    const key = `cust_${data.orderId}`;
    if (!locationDbThrottle[key] || now - locationDbThrottle[key] >= 10000) {
      locationDbThrottle[key] = now;
      try {
        await Order.findByIdAndUpdate(data.orderId, {
          customerLocation: { lat: data.lat, lng: data.lng },
        });
      } catch (error) {
        console.error('Error updating customer location:', error);
      }
    }
  });

  socket.on('get_customer_location', async (data: { orderId: string }) => {
    try {
      const order = await Order.findById(data.orderId).select('customerLocation deliveryAddress');
      if (order && order.customerLocation) {
        socket.emit('customer_location_update', {
          orderId: data.orderId, lat: order.customerLocation.lat, lng: order.customerLocation.lng,
        });
      }
    } catch (error) {
      console.error('Error fetching customer location:', error);
    }
  });

  socket.on('delivery_started', (data: { orderId: string; partnerName: string }) => {
    io.to(`tracking_${data.orderId}`).emit('delivery_started', data);
    io.to(`order_${data.orderId}`).emit('delivery_started', data);
  });

  socket.on('leave_room', (orderId: string) => {
    socket.leave(`order_${orderId}`);
    socket.leave(`tracking_${orderId}`);
  });

  socket.on('send_message', async ({ orderId, senderId, senderName, text }) => {
    try {
      const message = { orderId, senderId, senderName, text, timestamp: new Date() };
      await Chat.findOneAndUpdate(
        { orderId },
        { $push: { messages: { senderId, senderName, text, timestamp: new Date() } } },
        { upsert: true }
      );

      // Find recipient and emit directly to their socket only
      try {
        const order = await Order.findById(orderId).select('userId deliveryPartnerId');
        if (order) {
          const recipientId = senderId === String(order.userId) ? String(order.deliveryPartnerId) : String(order.userId);
          const recipientSocketId = userSocketMap.get(recipientId);
          if (recipientSocketId) {
            io.to(recipientSocketId).emit('receive_message', message);
          }
        }
      } catch (e) {
        console.error('Error finding recipient:', e);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  socket.on('get_chat_history', async ({ orderId }: { orderId: string }) => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const chat = await Chat.findOne({ orderId });
      if (chat) {
        const recentMessages = chat.messages.filter(
          (msg) => msg.timestamp >= oneHourAgo
        );
        socket.emit('chat_history', recentMessages);
      } else {
        socket.emit('chat_history', []);
      }
    } catch (error) {
      console.error('Error fetching chat history:', error);
      socket.emit('chat_history', []);
    }
  });

  socket.on('typing_start', ({ orderId }) => {
    socket.to(`order_${orderId}`).emit('is_typing', { typing: true });
  });

  socket.on('typing_stop', ({ orderId }) => {
    socket.to(`order_${orderId}`).emit('is_typing', { typing: false });
  });

  socket.on('disconnect', () => {
    // Remove disconnected user from map
    for (const [userId, socketId] of userSocketMap.entries()) {
      if (socketId === socket.id) {
        userSocketMap.delete(userId);
        console.log(`[Socket] User ${userId} disconnected and removed from map`);
        break;
      }
    }
    Object.keys(locationDbThrottle).forEach(key => {
      delete locationDbThrottle[key];
    });
  });
};
