import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

// Logged-in users never see the login page. Satisfies A18.
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/library");
  return <LoginForm />;
}
