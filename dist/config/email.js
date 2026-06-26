"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const mail_1 = __importDefault(require("@sendgrid/mail"));
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (SENDGRID_API_KEY) {
    mail_1.default.setApiKey(SENDGRID_API_KEY);
}
const FROM_EMAIL = process.env.SMTP_FROM || 'FreshCart <noreply@freshcart.com>';
const sendEmail = async ({ to, subject, html }) => {
    if (!SENDGRID_API_KEY) {
        console.error('Email skipped - SENDGRID_API_KEY not set');
        return { data: null };
    }
    try {
        const result = await mail_1.default.send({
            from: FROM_EMAIL,
            to,
            subject,
            html,
        });
        console.log('Email sent:', result[0].statusCode, '->', to);
        return { data: { id: result[0].headers } };
    }
    catch (error) {
        console.error('Email failed:', error.response?.body?.errors || error.message);
        throw error;
    }
};
exports.sendEmail = sendEmail;
