import { redirect } from "next/navigation";
import type { Role, UserStatus } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
};

/**
 * Load the signed-in user fresh from the database on every call, so that an
 * admin approving an account or changing a role takes effect immediately
 * (the JWT only carries the user id).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  return user ?? null;
}

/** Any signed-in account (may still be PENDING). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "REJECTED") redirect("/login?error=rejected");
  return user;
}

/** Signed in AND approved by an admin. The gate for all booking features. */
export async function requireApprovedUser(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.status !== "APPROVED") redirect("/pending");
  return user;
}

/** True for ADMIN and SUPER_ADMIN. */
export function isAdmin(role: Role): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/** Approved AND at least an admin (ADMIN or SUPER_ADMIN). */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireApprovedUser();
  if (!isAdmin(user.role)) redirect("/calendar");
  return user;
}

/** Approved AND the super admin. Gate for role management. */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireApprovedUser();
  if (user.role !== "SUPER_ADMIN") redirect("/calendar");
  return user;
}
