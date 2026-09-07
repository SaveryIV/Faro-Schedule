import type { Metadata } from "next";

import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Solicitar acceso · Faro Schedule" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Solicitar acceso"
      subtitle="Un administrador revisa tu cuenta antes de activarla."
    >
      <RegisterForm />
    </AuthShell>
  );
}
