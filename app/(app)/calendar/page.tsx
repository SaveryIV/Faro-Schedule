import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth-guard";
import { CalendarView } from "@/components/CalendarView";

export const metadata: Metadata = { title: "Calendar · Faro Schedule" };

export default async function CalendarPage() {
  await requireApprovedUser();

  const spaces = await prisma.space.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return <CalendarView spaces={spaces} />;
}
