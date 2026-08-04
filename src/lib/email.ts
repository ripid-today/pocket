// OTP email delivery via Resend's HTTP API.
//
// Why not Gmail SMTP: Railway blocks outbound SMTP (ports 25/465/587) on
// Hobby/Standard plans as anti-spam, so nodemailer hangs indefinitely.
// Resend uses a plain HTTPS POST (port 443), which Railway allows. Free
// tier: 100 emails/day, 3000/month — plenty for a personal single-user OTP.
//
// Requires env: RESEND_API_KEY=re_...
// Optional env: MAIL_FROM=Pocket <onboarding@resend.dev>  (sandbox sender,
//   or your verified domain like Pocket <noreply@ripid.vn>)

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendOtp(
  email: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: "Email service is not configured." };
  }

  const from = process.env.MAIL_FROM || "Pocket <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
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
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Resend API error:", res.status, text);
      // Resend's sandbox sender (onboarding@resend.dev) only delivers to the
      // email the account signed up with. A 403 validation_error means the
      // recipient isn't that address — surface a clear message so the user
      // knows which email to use, instead of a generic 500.
      if (res.status === 403 && text.includes("own email address")) {
        return {
          success: false,
          error:
            "This email isn't allowed for the sandbox sender. Log in with the account you registered with Resend.",
        };
      }
      return { success: false, error: "Failed to send email. Please try again." };
    }

    return { success: true };
  } catch (err) {
    console.error("Email send error:", err);
    return { success: false, error: "Failed to send email. Please try again." };
  }
}
