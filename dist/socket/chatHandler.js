"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupChatHandler = void 0;
const Chat_1 = __importDefault(require("../models/Chat"));
const Order_1 = __importDefault(require("../models/Order"));
const locationDbThrottle = {};
const setupChatHandler = (io, socket) => {
    socket.on('join_order_room', (orderId) => {
        socket.join(`order_${orderId}`);
    });
    socket.on('join_room', (orderId) => {
        socket.join(`order_${orderId}`);
    });
    socket.on('order_confirmed', (data) => {
        io.to(`managers`).emit('order_confirmed', data);
    });
    socket.on('order_dispatched', (data) => {
        io.to(`order_${data.orderId}`).emit('order_dispatched', data);
    });
    socket.on('join_delivery_tracking', (orderId) => {
        socket.join(`tracking_${orderId}`);
    });
    socket.on('join_customer_tracking', (orderId) => {
        socket.join(`tracking_${orderId}`);
    });
    socket.on('join_admin_tracking', () => {
        socket.join('admin_tracking');
    });
    socket.on('update_delivery_location', async (data) => {
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
                await Order_1.default.findByIdAndUpdate(data.orderId, {
                    deliveryPartnerLocation: { lat: data.lat, lng: data.lng, updatedAt: new Date() },
                });
            }
            catch (error) {
                console.error('Error updating delivery location:', error);
            }
        }
    });
    socket.on('update_customer_location', async (data) => {
        io.to(`tracking_${data.orderId}`).emit('customer_location_update', {
            orderId: data.orderId, lat: data.lat, lng: data.lng,
        });
        const now = Date.now();
        const key = `cust_${data.orderId}`;
        if (!locationDbThrottle[key] || now - locationDbThrottle[key] >= 10000) {
            locationDbThrottle[key] = now;
            try {
                await Order_1.default.findByIdAndUpdate(data.orderId, {
                    customerLocation: { lat: data.lat, lng: data.lng },
                });
            }
            catch (error) {
                console.error('Error updating customer location:', error);
            }
        }
    });
    socket.on('get_customer_location', async (data) => {
        try {
            const order = await Order_1.default.findById(data.orderId).select('customerLocation deliveryAddress');
            if (order && order.customerLocation) {
                socket.emit('customer_location_update', {
                    orderId: data.orderId, lat: order.customerLocation.lat, lng: order.customerLocation.lng,
                });
            }
        }
        catch (error) {
            console.error('Error fetching customer location:', error);
        }
    });
    socket.on('delivery_started', (data) => {
        io.to(`tracking_${data.orderId}`).emit('delivery_started', data);
        io.to(`order_${data.orderId}`).emit('delivery_started', data);
    });
    socket.on('leave_room', (orderId) => {
        socket.leave(`order_${orderId}`);
        socket.leave(`tracking_${orderId}`);
    });
    socket.on('send_message', async ({ orderId, senderId, text }) => {
        try {
            const message = { senderId, text, timestamp: new Date() };
            await Chat_1.default.findOneAndUpdate({ orderId }, { $push: { messages: message } }, { upsert: true });
            io.to(`order_${orderId}`).emit('receive_message', message);
        }
        catch (error) {
            console.error('Error sending message:', error);
        }
    });
    socket.on('typing_start', ({ orderId }) => {
        socket.to(`order_${orderId}`).emit('is_typing', { typing: true });
    });
    socket.on('typing_stop', ({ orderId }) => {
        socket.to(`order_${orderId}`).emit('is_typing', { typing: false });
    });
    socket.on('disconnect', () => {
        Object.keys(locationDbThrottle).forEach(key => {
            delete locationDbThrottle[key];
        });
    });
};
exports.setupChatHandler = setupChatHandler;
