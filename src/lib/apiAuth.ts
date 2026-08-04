import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validateSession } from "@/lib/db/sessions";

// Shared auth guard for API routes: returns the user or a 401 response.
export async function requireUser(): Promise<
  { user: { id: number; email: string } } | { error: NextResponse }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get("pocket_session")?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await validateSession(token);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user: { id: user.id, email: user.email } };
}
