// text-base (16px) keeps iOS Safari from auto-zooming when a field is focused.
export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-beam-500 dark:border-stone-700 dark:bg-stone-900";

export function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  error?: string[];
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-600 dark:text-stone-300">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      {error?.length ? (
        <span className="block text-xs text-red-600 dark:text-red-400">
          {error[0]}
        </span>
      ) : null}
    </label>
  );
}
