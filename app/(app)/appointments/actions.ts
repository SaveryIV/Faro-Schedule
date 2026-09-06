"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth-guard";
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

export async function deleteAppointment(formData: FormData) {
  const user = await requireApprovedUser();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) return;

  const canDelete = appointment.userId === user.id || user.role === "ADMIN";
  if (!canDelete) return;

  await prisma.appointment.delete({ where: { id } });

  revalidatePath("/calendar");
  revalidatePath("/appointments");
}
