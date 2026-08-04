import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { updateFontSize } from "@/lib/db/preferences";

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const fontSize = Number(body?.fontSize);
  if (!Number.isFinite(fontSize)) {
    return NextResponse.json({ error: "Invalid font size" }, { status: 400 });
  }
  await updateFontSize(auth.user.id, fontSize);
  return NextResponse.json({ success: true });
}
