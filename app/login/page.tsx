import type { Metadata } from "next";

import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Faro Schedule" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell title="Sign in" subtitle="Book the office Hall and Meeting Room.">
      <LoginForm rejected={error === "rejected"} />
    </AuthShell>
  );
}
