import nodemailer from "nodemailer";

// Gmail SMTP over port 587 (STARTTLS) forced to IPv4. Railway's IPv6 egress
// to Gmail on port 465 is unreliable (ENETUNREACH), so we pin the family
// to 4 and use the STARTTLS port, which is the most reliable path on
// container hosts.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS upgrades the connection
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  // Force IPv4 — avoids ENETUNREACH on IPv6-only egress on Railway.
  // `family` is a valid Node net.connect option passed through by nodemailer;
  // cast because it isn't in the SMTP transport types.
  ...( { family: 4 } as object ),
} as nodemailer.TransportOptions);

export async function sendOtp(
  email: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await transporter.sendMail({
      from: `"Pocket" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: "Your Pocket login code",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #ffffff; font-size: 24px; margin-bottom: 8px; background:#000; padding:12px; border-radius:8px;">Pocket</h1>
          <p style="color: #1A1A1A; font-size: 16px; line-height: 1.5;">
            Use the code below to sign in to your Pocket account.
          </p>
          <div style="background: #FAF8F5; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1A1A1A; font-family: 'Courier New', monospace;">
              ${code}
            </span>
          </div>
          <p style="color: #78716C; font-size: 14px; line-height: 1.5;">
            This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    return { success: true };
  } catch (err) {
    console.error("Email send error:", err);
    return { success: false, error: "Failed to send email. Please try again." };
  }
}
