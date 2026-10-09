// Production setup of the real club: creates FICC with its rules, categories, courts, slot grid,
// staff roles and one super admin. No fictional data, and it never deletes anything: it stops if
// the club already exists. Members join through the matrícula import and sign-up approval;
// coaches, secretaria, diretoria and gate accounts are created by the admin in the panel.
//
//   BOOTSTRAP_ADMIN_EMAIL=… BOOTSTRAP_ADMIN_NAME="…" BOOTSTRAP_ADMIN_PASSWORD=… pnpm db:bootstrap

import { DEFAULT_STAFF_ROLES } from "@ficc/shared";
import { hash } from "argon2";

import { PrismaClient, Role, tenantExtension } from "../src";
import { COURTS, FICC_CATEGORIES, FICC_CLUB, FICC_SETTINGS, FICC_SLOT_GRID } from "./seed/data";

const base = new PrismaClient();
let clubId: string | undefined;
const prisma = base.$extends(tenantExtension(() => clubId));

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name}.`);
  return value;
}

async function main(): Promise<void> {
  const email = required("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const name = required("BOOTSTRAP_ADMIN_NAME");
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");
  if (password.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD needs 12+ characters.");

  // The migrations already create an empty FICC row (with settings, categories and staff roles):
  // fill it. A club that already has courts or people is left alone.
  let club = await base.club.findUnique({ where: { slug: FICC_CLUB.slug } });
  if (club) {
    const [courts, users] = await Promise.all([
      base.court.count({ where: { clubId: club.id } }),
      base.user.count({ where: { clubId: club.id } }),
    ]);
    if (courts > 0 || users > 0) {
      console.log(`${FICC_CLUB.name} is already set up (${courts} courts, ${users} accounts).`);
      console.log("Nothing changed.");
      return;
    }
  } else {
    club = await base.club.create({ data: { ...FICC_CLUB } });
  }
  clubId = club.id;

  const passwordHash = await hash(password);
  await base.clubSettings.upsert({
    where: { clubId: club.id },
    create: { clubId: club.id, values: FICC_SETTINGS },
    update: { values: FICC_SETTINGS },
  });
  // Everything else goes through the tenant extension, like the API, so each row gets clubId.
  await prisma.category.createMany({ data: [...FICC_CATEGORIES], skipDuplicates: true });
  await prisma.court.createMany({
    data: COURTS.map((court, index) => ({ ...court, sortOrder: index + 1 })),
  });
  await prisma.timeSlot.createMany({ data: FICC_SLOT_GRID.map((slot) => ({ ...slot })) });
  await prisma.staffRole.createMany({
    data: DEFAULT_STAFF_ROLES.map((role) => ({
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    })),
    skipDuplicates: true,
  });
  const roles = await prisma.staffRole.findMany();
  const superAdmin = roles.find((role) => role.key === "SUPER_ADMIN");
  if (!superAdmin) throw new Error("DEFAULT_STAFF_ROLES has no SUPER_ADMIN role.");
  await prisma.user.create({
    data: {
      role: Role.ADMIN,
      email,
      name,
      passwordHash,
      staffRoles: { create: [{ roleId: superAdmin.id }] },
    },
  });

  console.log(
    `${FICC_CLUB.name} created: ${COURTS.length} courts, ${FICC_SLOT_GRID.length} slots,`,
  );
  console.log(`${FICC_CATEGORIES.length} categories, ${roles.length} staff roles.`);
  console.log(
    `Super admin: ${email}. Log in at /login (Equipe) and finish the setup in the panel.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => base.$disconnect());
