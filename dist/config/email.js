"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const resend_1 = require("resend");
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.SMTP_FROM || 'FreshCart <onboarding@resend.dev>';
const sendEmail = async ({ to, subject, html }) => {
    try {
        const result = await resend.emails.send({
            from: FROM_EMAIL,
            to,
            subject,
            html,
        });
        console.log('Email sent:', result.data?.id, '->', to);
        return result;
    }
    catch (error) {
        console.error('Email failed:', error.message);
        throw error;
    }
};
exports.sendEmail = sendEmail;
