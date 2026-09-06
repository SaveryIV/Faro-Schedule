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
    return { fieldErrors: { endsAtLocal: ["End time must be after the start time"] } };
  }
  if (endsAt.getTime() < Date.now()) {
    return { fieldErrors: { startsAtLocal: ["That time is already in the past"] } };
  }

  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) {
    return { fieldErrors: { spaceId: ["Choose a space"] } };
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
        error: `${space.name} is already booked for part of that time. Pick another slot.`,
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

  if (Number.isNaN(+start) || Number.isNaN(+end)) return { error: "Invalid time." };
  if (end <= start) return { error: "End time must be after the start time." };
  if (end.getTime() < Date.now()) return { error: "That time is already in the past." };
  if (title.length < 2) return { error: "Add a short title." };
  if (title.length > 120) return { error: "Title is too long." };

  const space = await prisma.space.findUnique({ where: { id: input.spaceId } });
  if (!space) return { error: "Choose a space." };

  try {
    await prisma.$transaction(async (tx) => {
      await assertFreeSlot(tx, input.spaceId, start, end);
      await tx.appointment.create({
        data: { spaceId: input.spaceId, userId: user.id, title, startsAt: start, endsAt: end },
      });
    });
  } catch (err) {
    if ((err instanceof Error && err.message === "OVERLAP") || isOverlapError(err)) {
      return { error: `${space.name} is already booked for part of that time.` };
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
  if (!appointment) return { error: "That booking no longer exists." };
  if (appointment.userId !== user.id) {
    return { error: "Only the person who booked it can move it." };
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
      return { error: `${appointment.space.name} is already booked then.` };
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
    return { error: "You can only cancel your own bookings." };
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
