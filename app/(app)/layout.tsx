import { requireApprovedUser } from "@/lib/auth-guard";
import { NavBar } from "@/components/NavBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireApprovedUser();
  return (
    <div className="min-h-screen">
      <NavBar user={user} />
      <main className="mx-auto max-w-[92rem] px-4 py-8">{children}</main>
    </div>
  );
}
