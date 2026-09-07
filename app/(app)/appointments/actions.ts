"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireApprovedUser, isAdmin } from "@/lib/auth-guard";
import { createAppointmentSchema } from "@/lib/validation";
import {
  officeLocalToUtc,
  officeLocalInputValue,
  officeDayKey,
  formatOffice,
} from "@/lib/tz";
import { expandOccurrences, type Frequency } from "@/lib/recurrence";

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

/** "14 de sept", "14 de sept, 21 de sept y 3 más" — for conflict messages. */
function listDates(dates: Date[]): string {
  const shown = dates.slice(0, 3).map((d) => formatOffice(d, "d 'de' MMM"));
  const extra = dates.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} y ${extra} más` : shown.join(", ");
}

async function assertFreeSlot(
  tx: Prisma.TransactionClient,
  spaceId: string,
  start: Date,
  end: Date,
  ignore?: string | string[],
) {
  const clash = await tx.appointment.findFirst({
    where: {
      spaceId,
      startsAt: { lt: end },
      endsAt: { gt: start },
      ...(ignore
        ? { id: Array.isArray(ignore) ? { notIn: ignore } : { not: ignore } }
        : {}),
    },
    select: { id: true },
  });
  if (clash) throw new Error("OVERLAP");
}

type UtcSlot = { startsAt: Date; endsAt: Date };

/**
 * Materialise a series inside an open transaction. Occurrences that clash with an
 * existing booking are skipped (and reported); occurrence N is checked against
 * occurrences 1..N-1 written earlier in this same transaction. Throws
 * "ALL_CLASH" (rolling the transaction back) if nothing could be created.
 */
async function insertSeries(
  tx: Prisma.TransactionClient,
  opts: {
    userId: string;
    spaceId: string;
    title: string;
    frequency: Frequency;
    slots: UtcSlot[];
  },
): Promise<{ made: number; skipped: Date[] }> {
  const series = await tx.appointmentSeries.create({
    data: { userId: opts.userId, frequency: opts.frequency },
  });

  const skipped: Date[] = [];
  let made = 0;

  for (const slot of opts.slots) {
    try {
      await assertFreeSlot(tx, opts.spaceId, slot.startsAt, slot.endsAt);
    } catch (e) {
      if (e instanceof Error && e.message === "OVERLAP") {
        skipped.push(slot.startsAt);
        continue;
      }
      throw e;
    }
    await tx.appointment.create({
      data: {
        spaceId: opts.spaceId,
        userId: opts.userId,
        title: opts.title,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        seriesId: series.id,
      },
    });
    made++;
  }

  if (made === 0) throw new Error("ALL_CLASH");
  return { made, skipped };
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
    frequency: formData.get("frequency"),
    repeatUntil: formData.get("repeatUntil"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { spaceId, title, frequency, repeatUntil } = parsed.data;
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

  // ---- Recurring booking --------------------------------------------------
  if (frequency && repeatUntil) {
    const slots: UtcSlot[] = expandOccurrences(
      parsed.data.startsAtLocal,
      parsed.data.endsAtLocal,
      frequency,
      repeatUntil,
    ).map((s) => ({
      startsAt: officeLocalToUtc(s.startLocal),
      endsAt: officeLocalToUtc(s.endLocal),
    }));

    let made: number;
    let skippedCount: number;
    try {
      const r = await prisma.$transaction((tx) =>
        insertSeries(tx, { userId: user.id, spaceId, title, frequency, slots }),
      );
      made = r.made;
      skippedCount = r.skipped.length;
    } catch (err) {
      if (err instanceof Error && err.message === "ALL_CLASH") {
        return {
          error: `${space.name} ya está reservado en todas esas fechas. Probá otro horario.`,
        };
      }
      if (isOverlapError(err)) {
        return {
          error: `${space.name} ya está reservado en parte de ese horario. Elegí otro.`,
        };
      }
      throw err;
    }

    revalidatePath("/calendar");
    revalidatePath("/appointments");
    redirect(`/appointments?created=${made}&skipped=${skippedCount}`);
  }

  // ---- Single booking ---------------------------------------------------
  try {
    await prisma.$transaction(async (tx) => {
      await assertFreeSlot(tx, spaceId, startsAt, endsAt);
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

export type ActionResult =
  | { ok: true; made?: number; skipped?: number }
  | { ok?: false; error: string };

export async function createBooking(input: {
  spaceId: string;
  title: string;
  startISO: string;
  endISO: string;
  frequency?: Frequency;
  repeatUntil?: string; // "yyyy-MM-dd"
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

  // ---- Recurring booking ----------------------------------------------
  if (input.frequency) {
    const startLocal = officeLocalInputValue(start);
    const endLocal = officeLocalInputValue(end);
    if (!input.repeatUntil) return { error: "Elegí hasta cuándo se repite." };
    if (input.repeatUntil < startLocal.slice(0, 10)) {
      return { error: "La fecha de fin de la repetición es anterior al inicio." };
    }

    const slots: UtcSlot[] = expandOccurrences(
      startLocal,
      endLocal,
      input.frequency,
      input.repeatUntil,
    ).map((s) => ({
      startsAt: officeLocalToUtc(s.startLocal),
      endsAt: officeLocalToUtc(s.endLocal),
    }));

    try {
      const { made, skipped } = await prisma.$transaction((tx) =>
        insertSeries(tx, {
          userId: user.id,
          spaceId: input.spaceId,
          title,
          frequency: input.frequency!,
          slots,
        }),
      );
      revalidatePath("/calendar");
      revalidatePath("/appointments");
      return { ok: true, made, skipped: skipped.length };
    } catch (err) {
      if (err instanceof Error && err.message === "ALL_CLASH") {
        return { error: `${space.name} ya está reservado en todas esas fechas.` };
      }
      if (isOverlapError(err)) {
        return { error: `${space.name} ya está reservado en parte de ese horario.` };
      }
      throw err;
    }
  }

  // ---- Single booking -------------------------------------------------
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

/** Shift every occurrence of a series to a new wall-clock time (all-or-nothing). */
async function moveSeries(
  seriesId: string,
  spaceId: string,
  spaceName: string,
  newStart: Date,
  newEnd: Date,
): Promise<ActionResult> {
  const occurrences = await prisma.appointment.findMany({
    where: { seriesId },
    select: { id: true, startsAt: true },
  });
  if (occurrences.length === 0) return { error: "Esa serie ya no existe." };

  const startHm = officeLocalInputValue(newStart).slice(11); // "HH:mm"
  const durationMs = newEnd.getTime() - newStart.getTime();
  const ids = occurrences.map((o) => o.id);

  const moves = occurrences.map((occ) => {
    const startsAt = officeLocalToUtc(`${officeDayKey(occ.startsAt)}T${startHm}`);
    return { id: occ.id, startsAt, endsAt: new Date(startsAt.getTime() + durationMs) };
  });

  // Pre-check every occurrence against committed bookings that aren't this series.
  const conflicts: Date[] = [];
  for (const m of moves) {
    const clash = await prisma.appointment.findFirst({
      where: {
        spaceId,
        id: { notIn: ids },
        startsAt: { lt: m.endsAt },
        endsAt: { gt: m.startsAt },
      },
      select: { id: true },
    });
    if (clash) conflicts.push(m.startsAt);
  }
  if (conflicts.length > 0) {
    return {
      error: `No se pudo mover la serie: ${spaceName} está ocupado el ${listDates(conflicts)}.`,
    };
  }

  try {
    await prisma.$transaction(
      moves.map((m) =>
        prisma.appointment.update({
          where: { id: m.id },
          data: { startsAt: m.startsAt, endsAt: m.endsAt },
        }),
      ),
    );
  } catch (err) {
    if (isOverlapError(err)) {
      return { error: `${spaceName} ya está reservado en ese horario.` };
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
  scope?: "one" | "series";
}): Promise<ActionResult> {
  const user = await requireApprovedUser();

  const start = new Date(input.startISO);
  const end = new Date(input.endISO);
  if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start) {
    return { error: "Hora inválida." };
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: input.id },
    include: { space: { select: { name: true } } },
  });
  if (!appointment) return { error: "Esa reserva ya no existe." };
  if (appointment.userId !== user.id) {
    return { error: "Solo quien hizo la reserva puede moverla." };
  }

  if (input.scope === "series" && appointment.seriesId) {
    return moveSeries(
      appointment.seriesId,
      appointment.spaceId,
      appointment.space.name,
      start,
      end,
    );
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

export async function cancelBooking(
  id: string,
  scope: "one" | "series" = "one",
): Promise<ActionResult> {
  const user = await requireApprovedUser();
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) return { ok: true };
  if (appointment.userId !== user.id && !isAdmin(user.role)) {
    return { error: "Solo podés cancelar tus propias reservas." };
  }

  if (scope === "series" && appointment.seriesId) {
    // Cascade deletes every occurrence.
    await prisma.appointmentSeries.delete({ where: { id: appointment.seriesId } });
    revalidatePath("/calendar");
    revalidatePath("/appointments");
    return { ok: true };
  }

  await prisma.appointment.delete({ where: { id } });

  // Clean up a series whose last occurrence was just cancelled.
  if (appointment.seriesId) {
    const remaining = await prisma.appointment.count({
      where: { seriesId: appointment.seriesId },
    });
    if (remaining === 0) {
      await prisma.appointmentSeries.delete({ where: { id: appointment.seriesId } });
    }
  }

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

  if (appointment.seriesId) {
    const remaining = await prisma.appointment.count({
      where: { seriesId: appointment.seriesId },
    });
    if (remaining === 0) {
      await prisma.appointmentSeries.delete({ where: { id: appointment.seriesId } });
    }
  }

  revalidatePath("/calendar");
  revalidatePath("/appointments");
}
