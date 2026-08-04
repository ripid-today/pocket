import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { updateLineHeight } from "@/lib/db/preferences";

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const lineHeight = Number(body?.lineHeight);
  if (!Number.isFinite(lineHeight)) {
    return NextResponse.json({ error: "Invalid line height" }, { status: 400 });
  }
  await updateLineHeight(auth.user.id, lineHeight);
  return NextResponse.json({ success: true });
}
