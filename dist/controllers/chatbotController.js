"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWithBot = void 0;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const chatWithBot = async (req, res) => {
    try {
        const { message, history, orderContext } = req.body;
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message is required' });
        }
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'Chatbot service not configured' });
        }
        let systemMessage;
        if (orderContext) {
            console.log('Order context received:', JSON.stringify(orderContext, null, 2));
            const items = orderContext.items?.map((item) => `${item.name} x${item.qty} ₹${item.price}`).join(', ') || 'N/A';
            const address = orderContext.deliveryAddress ? `${orderContext.deliveryAddress.street}, ${orderContext.deliveryAddress.city}` : 'N/A';
            const statusMap = {
                PLACED: 'Order Placed',
                CONFIRMED: 'Confirmed',
                DISPATCHED: 'Dispatched',
                OUT_FOR_DELIVERY: 'On The Way',
                DELIVERED: 'Delivered',
                CANCELLED: 'Cancelled',
            };
            const status = statusMap[orderContext.orderStatus] || orderContext.orderStatus;
            const orderId = orderContext.orderId.slice(-6).toUpperCase();
            systemMessage = `You are FreshCart's AI support. You have the customer's order data below. USE IT. NEVER ask for order ID — you already have it.

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
        }
        else {
            systemMessage = `You are FreshCart's AI Customer Support Assistant. You help with orders, refunds, delivery, and general queries about FreshCart grocery delivery app.
RULES: Be polite, short (1-3 sentences), use customer's language. Never share internal details.
For order issues: ask for order ID. For refunds: ask for order ID and reason. For delivery: suggest checking My Orders.`;
        }
        const messages = [
            { role: 'system', content: systemMessage },
            ...(history || []).map((msg) => ({
                role: msg.role,
                content: msg.content,
            })),
            { role: 'user', content: message },
        ];
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages,
                max_tokens: 250,
                temperature: 0.5,
            }),
        });
        if (!response.ok) {
            const errorData = await response.text();
            console.error('Groq API error:', errorData);
            return res.status(502).json({ error: 'AI service temporarily unavailable' });
        }
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not process your request.';
        res.json({ reply });
    }
    catch (error) {
        console.error('Chatbot error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.chatWithBot = chatWithBot;
