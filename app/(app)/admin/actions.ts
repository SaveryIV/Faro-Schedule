"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

async function setStatus(formData: FormData, status: "APPROVED" | "REJECTED") {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
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
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const role = formData.get("role") === "ADMIN" ? "ADMIN" : "USER";
  if (!id) return;

  // An admin cannot change their own role (prevents accidental lockout).
  if (id === admin.id) return;

  await prisma.user.update({ where: { id }, data: { role } });
  revalidatePath("/admin/users");
}
