import Chat from '../models/Chat';
export const setupChatHandler = (io, socket) => {
    // Join order-specific room (for user to receive dispatch notifications)
    socket.on('join_order_room', (orderId) => {
        socket.join(`order_${orderId}`);
        console.log(`Socket joined order room: order_${orderId}`);
    });
    // Legacy join_room (for chat)
    socket.on('join_room', (orderId) => {
        socket.join(`order_${orderId}`);
        console.log(`Socket joined chat room: order_${orderId}`);
    });
    // User confirms order → broadcast to ALL (manager dashboard picks this up)
    socket.on('order_confirmed', (data) => {
        console.log(`Order confirmed by ${data.userName} — broadcasting to manager`);
        // Broadcast to everyone (manager dashboard listens globally)
        io.emit('order_confirmed', data);
    });
    // Manager dispatches → emit to order room so user gets notification
    socket.on('order_dispatched', (data) => {
        io.to(`order_${data.orderId}`).emit('order_dispatched', data);
        console.log(`Order ${data.orderId} dispatched to ${data.partnerName}`);
    });
    // Chat: send message
    socket.on('send_message', async ({ orderId, senderId, text }) => {
        try {
            const message = { senderId, text, timestamp: new Date() };
            // Persist to DB
            await Chat.findOneAndUpdate({ orderId }, { $push: { messages: message } }, { upsert: true });
            io.to(`order_${orderId}`).emit('receive_message', message);
        }
        catch (error) {
            console.error('Error sending message:', error);
        }
    });
    // Typing indicators
    socket.on('typing_start', ({ orderId }) => {
        socket.to(`order_${orderId}`).emit('is_typing', { typing: true });
    });
    socket.on('typing_stop', ({ orderId }) => {
        socket.to(`order_${orderId}`).emit('is_typing', { typing: false });
    });
};
