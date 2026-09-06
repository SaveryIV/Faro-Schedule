import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { formatOffice } from "@/lib/tz";
import { approveUser, rejectUser, setUserRole } from "@/app/(app)/admin/actions";

export const metadata: Metadata = { title: "Users · Faro Schedule" };

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 } as const;
  users.sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-neutral-500">
          Approve new coworkers so they can see and create bookings.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Requested</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {users.map((u) => {
              const self = u.id === admin.id;
              return (
                <tr key={u.id} className="bg-white dark:bg-neutral-950">
                  <td className="px-4 py-3 font-medium">
                    {u.name}
                    {self && <span className="ml-1 text-xs text-neutral-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{u.email}</td>
                  <td className="px-4 py-3 text-neutral-500">
                    {formatOffice(u.createdAt, "d MMM yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[u.status]}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{u.role}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {u.status !== "APPROVED" && (
                        <form action={approveUser}>
                          <input type="hidden" name="id" value={u.id} />
                          <button className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-500">
                            Approve
                          </button>
                        </form>
                      )}
                      {u.status !== "REJECTED" && !self && (
                        <form action={rejectUser}>
                          <input type="hidden" name="id" value={u.id} />
                          <button className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950">
                            Reject
                          </button>
                        </form>
                      )}
                      {!self && u.status === "APPROVED" && (
                        <form action={setUserRole}>
                          <input type="hidden" name="id" value={u.id} />
                          <input
                            type="hidden"
                            name="role"
                            value={u.role === "ADMIN" ? "USER" : "ADMIN"}
                          />
                          <button className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                            {u.role === "ADMIN" ? "Revoke admin" : "Make admin"}
                          </button>
                        </form>
                      )}
                    </div>
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
