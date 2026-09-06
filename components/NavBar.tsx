import Link from "next/link";

import type { CurrentUser } from "@/lib/auth-guard";
import { SignOutButton } from "@/components/SignOutButton";

const links = [
  { href: "/calendar", label: "Calendar" },
  { href: "/appointments", label: "All bookings" },
  { href: "/appointments/new", label: "New booking" },
];

export function NavBar({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-[92rem] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/calendar" className="text-sm font-semibold tracking-tight">
          Faro Schedule
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-2.5 py-1.5 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              {l.label}
            </Link>
          ))}
          {user.role !== "USER" && (
            <Link
              href="/admin/users"
              className="rounded-md px-2.5 py-1.5 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm text-neutral-500">
          <span className="hidden sm:inline">{user.name}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
