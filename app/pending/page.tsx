import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth-guard";
import { AuthShell } from "@/components/AuthShell";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = { title: "Awaiting approval · Faro Schedule" };

export default async function PendingPage() {
  const user = await requireUser();
  if (user.status === "APPROVED") redirect("/calendar");

  return (
    <AuthShell title="Almost there">
      <div className="space-y-4 text-center">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Thanks, {user.name.split(" ")[0]}. Your account is waiting for an office
          admin to approve it. You&apos;ll be able to see and create bookings as
          soon as that happens.
        </p>
        <SignOutButton className="mx-auto" />
      </div>
    </AuthShell>
  );
}
