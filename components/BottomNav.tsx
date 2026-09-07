"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { CurrentUser } from "@/lib/auth-guard";

function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 3v3M16 3v3" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} {...props}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
    </svg>
  );
}

export function BottomNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname();

  const items = [
    { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
    { href: "/appointments/new", label: "New booking", Icon: PlusIcon, primary: true },
    { href: "/appointments", label: "Bookings", Icon: ListIcon },
    ...(user.role !== "USER"
      ? [{ href: "/admin/users", label: "Admin", Icon: ShieldIcon }]
      : []),
  ];

  const isActive = (href: string) =>
    href === "/appointments"
      ? pathname === "/appointments"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur sm:hidden dark:border-stone-800 dark:bg-stone-900/95">
      <ul className="mx-auto flex max-w-md">
        {items.map(({ href, label, Icon, primary }) => {
          const active = isActive(href);
          if (primary) {
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-stone-500 dark:text-stone-400"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-beam-600 text-white shadow-sm">
                    <Icon className="h-5 w-5" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          }
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition " +
                  (active
                    ? "text-beam-700 dark:text-beam-400"
                    : "text-stone-500 dark:text-stone-400")
                }
              >
                <Icon className="h-[22px] w-[22px]" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
