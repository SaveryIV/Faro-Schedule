import type { Metadata } from "next";

import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Iniciar sesión · Faro Schedule" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell
      title="Iniciar sesión"
      subtitle="Reservá el Salón y la Sala de Reuniones de la oficina."
    >
      <LoginForm rejected={error === "rejected"} />
    </AuthShell>
  );
}
