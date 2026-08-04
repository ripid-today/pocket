import { NextResponse } from "next/server";
import { createOtp, canResendOtp, invalidateOtp } from "@/lib/db/otp";
import { createUser, getUserByEmail } from "@/lib/db/users";
import { sendOtp } from "@/lib/email";

// Request a new OTP for an email. Auto-registers unknown users.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = body?.email?.toString().trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Email address is required." }, { status: 400 });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const cooldown = await canResendOtp(email);
  if (!cooldown.allowed) {
    return NextResponse.json(
      { error: `Please wait ${cooldown.waitSeconds} seconds before requesting a new code.` },
      { status: 429 }
    );
  }

  let user = await getUserByEmail(email);
  if (!user) user = await createUser(email);

  await invalidateOtp(email);
  const code = await createOtp(email);
  const result = await sendOtp(email, code);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to send OTP." },
      { status: 400 }
    );
  }

  return NextResponse.json({ email });
}
