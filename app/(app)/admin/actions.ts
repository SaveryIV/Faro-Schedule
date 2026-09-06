"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSuperAdmin, isAdmin } from "@/lib/auth-guard";

async function setStatus(formData: FormData, status: "APPROVED" | "REJECTED") {
  const caller = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!target) return;

  // A plain ADMIN may only act on regular USERs. Only a SUPER_ADMIN may
  // approve/reject another admin, and a SUPER_ADMIN account is never touched.
  if (target.role === "SUPER_ADMIN") return;
  if (isAdmin(target.role) && caller.role !== "SUPER_ADMIN") return;

  await prisma.user.update({ where: { id }, data: { status } });
  revalidatePath("/admin/users");
}

export async function approveUser(formData: FormData) {
  await setStatus(formData, "APPROVED");
}

export async function rejectUser(formData: FormData) {
  await setStatus(formData, "REJECTED");
}

export async function setUserRole(formData: FormData) {
  const superAdmin = await requireSuperAdmin();
  const id = String(formData.get("id") || "");
  const requested = String(formData.get("role") || "");
  if (!id) return;

  const role: Role =
    requested === "ADMIN"
      ? "ADMIN"
      : requested === "SUPER_ADMIN"
        ? "SUPER_ADMIN"
        : "USER";

  // The super admin cannot change their own role (prevents lockout).
  if (id === superAdmin.id) return;

  await prisma.user.update({ where: { id }, data: { role } });
  revalidatePath("/admin/users");
}
