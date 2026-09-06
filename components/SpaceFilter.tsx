import Link from "next/link";

type SpaceOption = { id: string; name: string; slug: string };

export function SpaceFilter({
  spaces,
  active,
}: {
  spaces: SpaceOption[];
  active?: string;
}) {
  const base =
    "rounded-full border px-3 py-1 text-sm transition border-neutral-300 dark:border-neutral-700";
  const on = "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900";
  const off = "hover:bg-neutral-100 dark:hover:bg-neutral-800";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/calendar" className={`${base} ${!active ? on : off}`}>
        All spaces
      </Link>
      {spaces.map((s) => (
        <Link
          key={s.id}
          href={`/calendar?space=${s.slug}`}
          className={`${base} ${active === s.slug ? on : off}`}
        >
          {s.name}
        </Link>
      ))}
    </div>
  );
}
