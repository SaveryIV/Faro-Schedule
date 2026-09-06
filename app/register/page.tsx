import type { Metadata } from "next";

import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Request access · Faro Schedule" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Request access"
      subtitle="Your account is reviewed by an office admin before it is activated."
    >
      <RegisterForm />
    </AuthShell>
  );
}
