import { getDb } from "../db";

export interface OtpCode {
  id: number;
  email: string;
  code: string;
  created_at: string;
  expires_at: string;
  used: number;
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createOtp(email: string): Promise<string> {
  const db = await getDb();
  const code = generateOtp();
  const normalizedEmail = email.toLowerCase().trim();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Invalidate any previous unused OTPs for this email
  await db.query("UPDATE otp_codes SET used = 1 WHERE email = $1 AND used = 0", [
    normalizedEmail,
  ]);

  await db.query(
    "INSERT INTO otp_codes (email, code, expires_at) VALUES ($1, $2, $3)",
    [normalizedEmail, code, expiresAt]
  );

  return code;
}

// No attempt counter / lockout (per spec): a wrong code just returns
// "Invalid code." and the user may retry freely until the code expires.
export async function verifyOtp(
  email: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  const normalizedEmail = email.toLowerCase().trim();

  const { rows } = await db.query<OtpCode>(
    `SELECT * FROM otp_codes
     WHERE email = $1 AND used = 0
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedEmail]
  );
  const otp = rows[0];

  if (!otp) {
    return { success: false, error: "No active OTP found. Please request a new code." };
  }

  if (new Date(otp.expires_at) < new Date()) {
    await db.query("UPDATE otp_codes SET used = 1 WHERE id = $1", [otp.id]);
    return { success: false, error: "Code expired. Please request a new one." };
  }

  if (otp.code !== code) {
    return { success: false, error: "Invalid code." };
  }

  await db.query("UPDATE otp_codes SET used = 1 WHERE id = $1", [otp.id]);
  return { success: true };
}

export async function canResendOtp(
  email: string
): Promise<{ allowed: boolean; waitSeconds?: number }> {
  const db = await getDb();
  const normalizedEmail = email.toLowerCase().trim();

  const { rows } = await db.query<{ created_at: string }>(
    `SELECT created_at FROM otp_codes
     WHERE email = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedEmail]
  );
  const lastOtp = rows[0];

  if (!lastOtp) return { allowed: true };

  const elapsed = Date.now() - new Date(lastOtp.created_at).getTime();
  const cooldownMs = 30 * 1000;

  if (elapsed < cooldownMs) {
    return {
      allowed: false,
      waitSeconds: Math.ceil((cooldownMs - elapsed) / 1000),
    };
  }

  return { allowed: true };
}

export async function invalidateOtp(email: string): Promise<void> {
  const db = await getDb();
  await db.query("UPDATE otp_codes SET used = 1 WHERE email = $1 AND used = 0", [
    email.toLowerCase().trim(),
  ]);
}
