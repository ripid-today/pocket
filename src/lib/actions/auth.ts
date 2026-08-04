"use server";

import { createUser, getUserByEmail } from "@/lib/db/users";
import { createOtp, verifyOtp, canResendOtp, invalidateOtp } from "@/lib/db/otp";
import { createSession } from "@/lib/db/sessions";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { sendOtp } from "@/lib/email";
import { redirect } from "next/navigation";

export async function requestOtp(
  prevState: { error?: string; email?: string } | null,
  formData: FormData
): Promise<{ error?: string; email?: string }> {
  const email = formData.get("email")?.toString().trim().toLowerCase();

  if (!email) {
    return { error: "Email address is required." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const cooldown = await canResendOtp(email);
  if (!cooldown.allowed) {
    return {
      error: `Please wait ${cooldown.waitSeconds} seconds before requesting a new code.`,
      email,
    };
  }

  let user = await getUserByEmail(email);
  if (!user) {
    user = await createUser(email);
  }

  const code = await createOtp(email);
  const result = await sendOtp(email, code);

  if (!result.success) {
    return { error: result.error || "Failed to send OTP. Please try again." };
  }

  return { email };
}

export async function verifyOtpAction(
  prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const code = formData.get("code")?.toString().trim();

  if (!email || !code) {
    return { error: "Email and code are required." };
  }

  const result = await verifyOtp(email, code);

  if (!result.success) {
    return { error: result.error || "Invalid code." };
  }

  const user = (await getUserByEmail(email))!;
  const session = await createSession(user.id);
  await setSessionCookie(session.token);

  redirect("/library");
}

export async function resendOtpAction(
  prevState: { error?: string; email?: string } | null,
  formData: FormData
): Promise<{ error?: string; email?: string }> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  if (!email) {
    return { error: "Email is required." };
  }

  const cooldown = await canResendOtp(email);
  if (!cooldown.allowed) {
    return {
      error: `Please wait ${cooldown.waitSeconds} seconds before requesting a new code.`,
      email,
    };
  }

  await invalidateOtp(email);
  const code = await createOtp(email);
  const result = await sendOtp(email, code);

  if (!result.success) {
    return { error: result.error || "Failed to send OTP." };
  }

  return { email };
}

export async function cancelOtpAction(formData: FormData): Promise<void> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  if (email) {
    await invalidateOtp(email);
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}
