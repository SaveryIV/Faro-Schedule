import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SPACES = [
  { name: "Salón", slug: "hall" },
  { name: "Sala de Reuniones", slug: "meeting-room" },
];

async function main() {
  for (const space of SPACES) {
    await prisma.space.upsert({
      where: { slug: space.slug },
      update: { name: space.name },
      create: space,
    });
  }
  console.log(`Seeded ${SPACES.length} spaces.`);

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Administración";

  if (!email || !password) {
    console.warn(
      "ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin creation.",
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    // Re-seeding re-asserts the super admin and rotates the password to the
    // current ADMIN_PASSWORD, so this account can never be locked out.
    update: { role: "SUPER_ADMIN", status: "APPROVED", name, passwordHash },
    create: {
      email,
      name,
      passwordHash,
      role: "SUPER_ADMIN",
      status: "APPROVED",
    },
  });
  console.log(`Super admin ready: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
