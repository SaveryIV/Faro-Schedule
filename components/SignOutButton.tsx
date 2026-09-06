import { signOutAction } from "@/app/auth-actions";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={
          "rounded-md px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 " +
          className
        }
      >
        Sign out
      </button>
    </form>
  );
}
