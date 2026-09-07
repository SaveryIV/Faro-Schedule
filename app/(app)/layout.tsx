import { requireApprovedUser } from "@/lib/auth-guard";
import { NavBar } from "@/components/NavBar";
import { BottomNav } from "@/components/BottomNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireApprovedUser();
  return (
    <div className="flex min-h-screen flex-col">
      <NavBar user={user} />
      <main className="mx-auto w-full max-w-[92rem] flex-1 px-4 pt-6 pb-28 sm:px-6 sm:py-8">
        {children}
      </main>
      <BottomNav user={user} />
    </div>
  );
}
