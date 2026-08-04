import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import VerifyForm from "@/components/VerifyForm";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/library");

  const { email } = await searchParams;
  if (!email) redirect("/login");

  return <VerifyForm email={email} />;
}
