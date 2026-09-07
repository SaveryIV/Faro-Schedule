import type { Metadata } from "next";
import type { Role, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { formatOffice } from "@/lib/tz";
import { approveUser, rejectUser, setUserRole } from "@/app/(app)/admin/actions";

export const metadata: Metadata = { title: "Usuarios · Faro Schedule" };

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

const ROLE_STYLE: Record<Role, string> = {
  USER: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
  ADMIN: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  SUPER_ADMIN:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
};

const ROLE_LABEL: Record<Role, string> = {
  USER: "Usuario",
  ADMIN: "Administrador",
  SUPER_ADMIN: "Superadministrador",
};

/** Can `callerRole` approve/reject a user whose role is `targetRole`? */
function canActOn(callerRole: Role, targetRole: Role): boolean {
  if (targetRole === "SUPER_ADMIN") return false;
  if (targetRole === "ADMIN" && callerRole !== "SUPER_ADMIN") return false;
  return true;
}

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
};

const approveBtn =
  "inline-flex min-h-9 items-center justify-center rounded-lg bg-green-600 px-3 text-xs font-semibold text-white transition hover:bg-green-500";
const rejectBtn =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-red-300 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950";
const roleBtn =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-stone-300 px-3 text-xs font-semibold transition hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800";

function UserActions({
  u,
  callerRole,
  self,
}: {
  u: AdminUser;
  callerRole: Role;
  self: boolean;
}) {
  const actionable = !self && canActOn(callerRole, u.role);
  const canManageRole =
    callerRole === "SUPER_ADMIN" && !self && u.status === "APPROVED";
  const roleTargets = (["USER", "ADMIN", "SUPER_ADMIN"] as Role[]).filter(
    (r) => r !== u.role,
  );

  if (self) {
    return (
      <span className="text-xs text-stone-400">
        {u.role === "SUPER_ADMIN" ? "Superadministrador — vos" : "Vos"}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {actionable && u.status !== "APPROVED" && (
        <form action={approveUser}>
          <input type="hidden" name="id" value={u.id} />
          <button className={approveBtn}>Aprobar</button>
        </form>
      )}
      {actionable && u.status !== "REJECTED" && (
        <form action={rejectUser}>
          <input type="hidden" name="id" value={u.id} />
          <button className={rejectBtn}>Rechazar</button>
        </form>
      )}
      {canManageRole &&
        roleTargets.map((r) => (
          <form action={setUserRole} key={r}>
            <input type="hidden" name="id" value={u.id} />
            <input type="hidden" name="role" value={r} />
            <button className={roleBtn}>Hacer {ROLE_LABEL[r].toLowerCase()}</button>
          </form>
        ))}
      {!actionable && !canManageRole && (
        <span className="text-xs text-stone-400">Sin acciones</span>
      )}
    </div>
  );
}

function Badge({ className, children }: { className: string; children: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export default async function AdminUsersPage() {
  const caller = await requireAdmin();

  const users = (await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
  })) as AdminUser[];
  const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 } as const;
  users.sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Usuarios</h1>
        <p className="mt-1 text-sm text-stone-500">
          Aprobá a los nuevos compañeros para que puedan ver y crear reservas.
          {caller.role === "SUPER_ADMIN"
            ? " Como superadministrador, también podés otorgar o quitar permisos de administrador."
            : ""}
        </p>
      </div>

      {/* Mobile: one card per user */}
      <ul className="space-y-3 md:hidden">
        {users.map((u) => {
          const self = u.id === caller.id;
          return (
            <li
              key={u.id}
              className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {u.name}
                    {self && (
                      <span className="ml-1 text-xs font-normal text-stone-400">
                        (vos)
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-stone-500">{u.email}</p>
                </div>
                <span className="shrink-0 text-xs text-stone-400">
                  {formatOffice(u.createdAt, "d MMM yyyy")}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge className={STATUS_STYLE[u.status]}>
                  {STATUS_LABEL[u.status]}
                </Badge>
                <Badge className={ROLE_STYLE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
              </div>
              <div className="mt-3">
                <UserActions u={u} callerRole={caller.role} self={self} />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-xl border border-stone-200 md:block dark:border-stone-800">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs font-semibold text-stone-500 dark:bg-stone-900">
            <tr>
              <th className="px-4 py-2.5">Nombre</th>
              <th className="px-4 py-2.5">Correo</th>
              <th className="px-4 py-2.5">Solicitó</th>
              <th className="px-4 py-2.5">Estado</th>
              <th className="px-4 py-2.5">Rol</th>
              <th className="px-4 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
            {users.map((u) => {
              const self = u.id === caller.id;
              return (
                <tr key={u.id} className="bg-white dark:bg-stone-950">
                  <td className="px-4 py-3 font-medium">
                    {u.name}
                    {self && (
                      <span className="ml-1 text-xs text-stone-400">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-500">{u.email}</td>
                  <td className="px-4 py-3 text-stone-400">
                    {formatOffice(u.createdAt, "d MMM yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_STYLE[u.status]}>
                      {STATUS_LABEL[u.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={ROLE_STYLE[u.role]}>
                      {ROLE_LABEL[u.role]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <UserActions u={u} callerRole={caller.role} self={self} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
