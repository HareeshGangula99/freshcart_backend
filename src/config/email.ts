import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.SMTP_FROM || 'FreshCart <noreply@freshcart.com>';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async ({ to, subject, html }: SendEmailOptions) => {
  if (!SENDGRID_API_KEY) {
    console.error('Email skipped - SENDGRID_API_KEY not set');
    return { data: null };
  }

  try {
    const result = await sgMail.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    console.log('Email sent:', result[0].statusCode, '->', to);
    return { data: { id: result[0].headers } };
  } catch (error: any) {
    console.error('Email failed:', error.response?.body?.errors || error.message);
    throw error;
  }
};
