import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/db/otp";
import { getUserByEmail } from "@/lib/db/users";
import { createSession } from "@/lib/db/sessions";
import { setSessionCookie } from "@/lib/auth";

// Verify an OTP; on success create a session and set the cookie.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = body?.email?.toString().trim().toLowerCase();
  const code = body?.code?.toString().trim();

  if (!email || !code) {
    return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
  }

  const result = await verifyOtp(email, code);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Invalid code." }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 400 });
  }
  const session = await createSession(user.id);
  await setSessionCookie(session.token);

  return NextResponse.json({ success: true });
}
