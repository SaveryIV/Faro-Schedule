import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/auth-guard";

const SPACE_COLOR: Record<string, string> = {
  hall: "#0284c7",
  "meeting-room": "#7c3aed",
};
const DEFAULT_COLOR = "#475569";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.status !== "APPROVED") {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const spaceSlug = searchParams.get("space") || undefined;

  const rangeStart = start ? new Date(start) : undefined;
  const rangeEnd = end ? new Date(end) : undefined;

  const appointments = await prisma.appointment.findMany({
    where: {
      ...(spaceSlug ? { space: { slug: spaceSlug } } : {}),
      ...(rangeStart && rangeEnd
        ? { startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } }
        : {}),
    },
    include: {
      space: { select: { name: true, slug: true } },
      user: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  const admin = isAdmin(user.role);

  const events = appointments.map((a) => {
    const mine = a.userId === user.id;
    // Only the creator may reschedule (drag/resize). Deleting is allowed for
    // the creator and for admins.
    const canMove = mine;
    const canDelete = mine || admin;
    const color = SPACE_COLOR[a.space.slug] ?? DEFAULT_COLOR;
    return {
      id: a.id,
      title: a.title,
      start: a.startsAt.toISOString(),
      end: a.endsAt.toISOString(),
      backgroundColor: color,
      borderColor: color,
      editable: canMove,
      extendedProps: {
        spaceName: a.space.name,
        spaceSlug: a.space.slug,
        bookedBy: a.user.name,
        mine,
        canMove,
        canDelete,
      },
    };
  });

  return NextResponse.json(events);
}
