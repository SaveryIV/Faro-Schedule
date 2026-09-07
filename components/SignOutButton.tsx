import { signOutAction } from "@/app/auth-actions";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={
          "rounded-lg px-3 py-2 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100 " +
          className
        }
      >
        Cerrar sesión
      </button>
    </form>
  );
}
