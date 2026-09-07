import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth-guard";
import { AuthShell } from "@/components/AuthShell";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = { title: "Pendiente de aprobación · Faro Schedule" };

export default async function PendingPage() {
  const user = await requireUser();
  if (user.status === "APPROVED") redirect("/calendar");

  return (
    <AuthShell title="Casi listo">
      <div className="space-y-4 text-center">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Gracias, {user.name.split(" ")[0]}. Tu cuenta está esperando la
          aprobación de un administrador. Vas a poder ver y crear reservas en
          cuanto eso pase.
        </p>
        <SignOutButton className="mx-auto" />
      </div>
    </AuthShell>
  );
}
