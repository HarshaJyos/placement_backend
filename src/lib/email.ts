import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "465");
const SMTP_USER = process.env.SMTP_USER || "harshajyosyabhatla@gmail.com";
const SMTP_PASS = process.env.SMTP_PASS || "cuhk nfgd phaj shri";

// Create reusable transporter object using SSL (Port 465)
export const mailTransporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Ensures compatibility across localized environments
  },
});

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Global generic mail dispatcher
export const sendMail = async (options: SendMailOptions): Promise<void> => {
  try {
    const info = await mailTransporter.sendMail({
      from: `"Placement Platform" <${SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || "Placement Platform Notification",
    });
    console.log(`[Email Service] Email sent successfully: ${info.messageId}`);
  } catch (error) {
    console.error("[Email Service] Failed to dispatch email:", error);
    throw error;
  }
};

// HTML template generator for OTP
export const sendOtpEmail = async (email: string, otpCode: string): Promise<void> => {
  const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; border: 1px solid #e1e8ed; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1da1f2; font-size: 28px; margin: 0;">Placement Platform</h1>
        <p style="color: #657786; font-size: 14px; margin-top: 5px;">Secure Registration Verification</p>
      </div>
      <div style="color: #1c1e21; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
        <p>Hello,</p>
        <p>Thank you for initiating your registration on the Placement Platform. To verify your email address and continue setup, please use the secure, one-time passcode below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="display: inline-block; font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #1da1f2; background-color: #f5f8fa; padding: 12px 30px; border: 1px solid #e1e8ed; border-radius: 6px;">${otpCode}</span>
        </div>
        <p style="color: #ff3b30; font-size: 14px; font-weight: bold;">Note: This code is strictly active for the next 5 minutes and can only be used once.</p>
        <p>If you did not initiate this request, you can safely ignore this email.</p>
      </div>
      <hr style="border: 0; border-top: 1px solid #e1e8ed; margin-bottom: 20px;" />
      <div style="text-align: center; color: #657786; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Placement Platform. All rights reserved.</p>
      </div>
    </div>
  `;

  await sendMail({
    to: email,
    subject: "Verify your email address - Placement Platform One-Time Passcode",
    html,
    text: `Your One-Time Passcode is: ${otpCode}. It is valid for 5 minutes.`,
  });
};

// HTML template generator for Password Reset
export const sendPasswordResetEmail = async (email: string, resetLink: string): Promise<void> => {
  const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; border: 1px solid #e1e8ed; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1da1f2; font-size: 28px; margin: 0;">Placement Platform</h1>
        <p style="color: #657786; font-size: 14px; margin-top: 5px;">Security Password Recovery</p>
      </div>
      <div style="color: #1c1e21; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
        <p>Hello,</p>
        <p>We received a request to reset the password for your Placement Platform account. Click the secure link below to proceed with setting up a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="display: inline-block; font-size: 16px; font-weight: bold; color: #ffffff; background-color: #1da1f2; padding: 12px 30px; text-decoration: none; border-radius: 6px; box-shadow: 0 4px 6px rgba(29, 161, 242, 0.15);">Reset My Password</a>
        </div>
        <p style="color: #ff3b30; font-size: 14px; font-weight: bold;">Note: This link is valid for 15 minutes and can only be used once.</p>
        <p>If you cannot click the button, you can copy and paste the following link directly in your browser:</p>
        <p style="word-break: break-all; color: #1da1f2;"><a href="${resetLink}">${resetLink}</a></p>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
      </div>
      <hr style="border: 0; border-top: 1px solid #e1e8ed; margin-bottom: 20px;" />
      <div style="text-align: center; color: #657786; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Placement Platform. All rights reserved.</p>
      </div>
    </div>
  `;

  await sendMail({
    to: email,
    subject: "Reset your password - Placement Platform Recovery Link",
    html,
    text: `Reset your password by visiting this link: ${resetLink}. Valid for 15 minutes.`,
  });
};
