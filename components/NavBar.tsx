"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { CurrentUser } from "@/lib/auth-guard";
import { SignOutButton } from "@/components/SignOutButton";

const baseLinks = [
  { href: "/calendar", label: "Calendario" },
  { href: "/appointments", label: "Reservas" },
  { href: "/appointments/new", label: "Nueva reserva" },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/appointments"
      ? pathname === "/appointments"
      : pathname === href || pathname.startsWith(href + "/");
}

export function NavBar({ user }: { user: CurrentUser }) {
  const isActive = useIsActive();
  const links =
    user.role !== "USER"
      ? [...baseLinks, { href: "/admin/users", label: "Admin" }]
      : baseLinks;

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/85 backdrop-blur dark:border-stone-800 dark:bg-stone-950/85">
      <div className="mx-auto flex h-14 max-w-[92rem] items-center gap-6 px-4">
        <Link
          href="/calendar"
          className="shrink-0 text-[15px] font-extrabold tracking-tight"
        >
          Faro Schedule
        </Link>

        <nav className="hidden items-center gap-1 text-sm sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={
                "rounded-md px-3 py-2 font-medium transition " +
                (isActive(l.href)
                  ? "bg-beam-50 text-beam-700 dark:bg-beam-500/15 dark:text-beam-300"
                  : "text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white")
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm text-stone-500">
          <span className="hidden md:inline">{user.name}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
