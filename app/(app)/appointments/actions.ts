"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireApprovedUser, isAdmin } from "@/lib/auth-guard";
import { createAppointmentSchema } from "@/lib/validation";
import { officeLocalToUtc } from "@/lib/tz";

export type BookingState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function isOverlapError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const metaCode = (err as { meta?: { code?: string } })?.meta?.code;
  if (code === "23P01" || metaCode === "23P01") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("23P01") || msg.includes("appointment_no_overlap");
}

export async function createAppointment(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const user = await requireApprovedUser();

  const parsed = createAppointmentSchema.safeParse({
    spaceId: formData.get("spaceId"),
    title: formData.get("title"),
    startsAtLocal: formData.get("startsAtLocal"),
    endsAtLocal: formData.get("endsAtLocal"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { spaceId, title } = parsed.data;
  const startsAt = officeLocalToUtc(parsed.data.startsAtLocal);
  const endsAt = officeLocalToUtc(parsed.data.endsAtLocal);

  if (endsAt <= startsAt) {
    return {
      fieldErrors: {
        endsAtLocal: ["La hora de fin debe ser posterior a la de inicio"],
      },
    };
  }
  if (endsAt.getTime() < Date.now()) {
    return { fieldErrors: { startsAtLocal: ["Esa hora ya pasó"] } };
  }

  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) {
    return { fieldErrors: { spaceId: ["Elegí un espacio"] } };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const clash = await tx.appointment.findFirst({
        where: {
          spaceId,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { id: true },
      });
      if (clash) {
        throw new Error("OVERLAP");
      }

      await tx.appointment.create({
        data: { spaceId, userId: user.id, title, startsAt, endsAt },
      });
    });
  } catch (err) {
    if ((err instanceof Error && err.message === "OVERLAP") || isOverlapError(err)) {
      return {
        error: `${space.name} ya está reservado en parte de ese horario. Elegí otro.`,
      };
    }
    throw err;
  }

  revalidatePath("/calendar");
  revalidatePath("/appointments");
  redirect("/appointments?created=1");
}

// ---------------------------------------------------------------------------
// JSON-argument actions used by the interactive calendar (return a result
// instead of redirecting, so the client can refresh in place).
// ---------------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok?: false; error: string };

async function assertFreeSlot(
  tx: Prisma.TransactionClient,
  spaceId: string,
  start: Date,
  end: Date,
  ignoreId?: string,
) {
  const clash = await tx.appointment.findFirst({
    where: {
      spaceId,
      startsAt: { lt: end },
      endsAt: { gt: start },
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new Error("OVERLAP");
}

export async function createBooking(input: {
  spaceId: string;
  title: string;
  startISO: string;
  endISO: string;
}): Promise<ActionResult> {
  const user = await requireApprovedUser();

  const start = new Date(input.startISO);
  const end = new Date(input.endISO);
  const title = input.title.trim();

  if (Number.isNaN(+start) || Number.isNaN(+end)) return { error: "Hora inválida." };
  if (end <= start) return { error: "La hora de fin debe ser posterior a la de inicio." };
  if (end.getTime() < Date.now()) return { error: "Esa hora ya pasó." };
  if (title.length < 2) return { error: "Agregá un título breve." };
  if (title.length > 120) return { error: "El título es demasiado largo." };

  const space = await prisma.space.findUnique({ where: { id: input.spaceId } });
  if (!space) return { error: "Elegí un espacio." };

  try {
    await prisma.$transaction(async (tx) => {
      await assertFreeSlot(tx, input.spaceId, start, end);
      await tx.appointment.create({
        data: { spaceId: input.spaceId, userId: user.id, title, startsAt: start, endsAt: end },
      });
    });
  } catch (err) {
    if ((err instanceof Error && err.message === "OVERLAP") || isOverlapError(err)) {
      return { error: `${space.name} ya está reservado en parte de ese horario.` };
    }
    throw err;
  }

  revalidatePath("/calendar");
  revalidatePath("/appointments");
  return { ok: true };
}

export async function moveBooking(input: {
  id: string;
  startISO: string;
  endISO: string;
}): Promise<ActionResult> {
  const user = await requireApprovedUser();

  const start = new Date(input.startISO);
  const end = new Date(input.endISO);
  if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start) {
    return { error: "Invalid time." };
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: input.id },
    include: { space: { select: { name: true } } },
  });
  if (!appointment) return { error: "Esa reserva ya no existe." };
  if (appointment.userId !== user.id) {
    return { error: "Solo quien hizo la reserva puede moverla." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await assertFreeSlot(tx, appointment.spaceId, start, end, appointment.id);
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { startsAt: start, endsAt: end },
      });
    });
  } catch (err) {
    if ((err instanceof Error && err.message === "OVERLAP") || isOverlapError(err)) {
      return { error: `${appointment.space.name} ya está reservado en ese horario.` };
    }
    throw err;
  }

  revalidatePath("/calendar");
  revalidatePath("/appointments");
  return { ok: true };
}

export async function cancelBooking(id: string): Promise<ActionResult> {
  const user = await requireApprovedUser();
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) return { ok: true };
  if (appointment.userId !== user.id && !isAdmin(user.role)) {
    return { error: "Solo podés cancelar tus propias reservas." };
  }
  await prisma.appointment.delete({ where: { id } });
  revalidatePath("/calendar");
  revalidatePath("/appointments");
  return { ok: true };
}

export async function deleteAppointment(formData: FormData) {
  const user = await requireApprovedUser();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) return;

  const canDelete = appointment.userId === user.id || isAdmin(user.role);
  if (!canDelete) return;

  await prisma.appointment.delete({ where: { id } });

  revalidatePath("/calendar");
  revalidatePath("/appointments");
}
