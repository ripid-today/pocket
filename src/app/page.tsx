import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

// Auth-aware root: logged-in users go to /library, others to /login.
// Satisfies A16, A17.
export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? "/library" : "/login");
}
