// Wipes the test database and writes the fixed end-to-end data set from
// fixtures.ts. Run with: DATABASE_URL=... npx tsx tests/e2e/seed.ts
// Refuses to run against anything but a local or CI database, since the
// first thing it does is TRUNCATE every table.
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { A, B, E, ORG, ORG_D_PEOPLE, PASSWORD, TWO_FACTOR_USER, USERS, type OrgKey, type RoleName } from "./fixtures";
import { VAULT } from "./fixtures";
import { SCHEDULE } from "./fixtures";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1|postgres)(:\d+)?\//.test(url)) {
  console.error(`Refusing to seed: DATABASE_URL must point at localhost (got ${url ? "something else" : "nothing"}).`);
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

async function truncateAll() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  );
  if (tables.length === 0) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
}

async function seedPeople(passwordHash: string) {
  for (const org of ["A", "B"] as OrgKey[]) {
    await prisma.organization.create({
      data: {
        id: ORG[org].id,
        name: ORG[org].name,
        slug: `e2e-org-${org.toLowerCase()}`,
        invoicePrefix: ORG[org].prefix,
        nextInvoiceNumber: 100,
        defaultCurrency: "USD",
        defaultBillRate: 150,
      },
    });
    for (const role of ["OWNER", "ADMIN", "MEMBER"] as RoleName[]) {
      const u = USERS[org][role];
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, passwordHash } });
      await prisma.membership.create({
        data: { id: u.membershipId, userId: u.id, orgId: ORG[org].id, role, billRate: 150 },
      });
      await prisma.apiKey.create({
        data: {
          name: `e2e ${role} ${org}`,
          keyHash: hashKey(u.apiKey),
          keyPrefix: u.apiKey.slice(0, 12),
          userId: u.id,
          orgId: ORG[org].id,
        },
      });
    }
  }

  // An org that requires two-factor, whose only member has no authenticator.
  await prisma.organization.create({
    data: { id: ORG.C.id, name: ORG.C.name, slug: "e2e-org-c", invoicePrefix: "C", requireTwoFactor: true },
  });
  await prisma.user.create({
    data: { id: TWO_FACTOR_USER.id, email: TWO_FACTOR_USER.email, name: TWO_FACTOR_USER.name, passwordHash },
  });
  await prisma.membership.create({
    data: { id: TWO_FACTOR_USER.membershipId, userId: TWO_FACTOR_USER.id, orgId: ORG.C.id, role: "OWNER" },
  });

  await prisma.organization.create({
    data: { id: ORG.D.id, name: ORG.D.name, slug: "e2e-org-d", invoicePrefix: "D" },
  });
  const dRoles = { owner1: "OWNER", owner2: "OWNER", admin: "ADMIN" } as const;
  for (const key of Object.keys(dRoles) as (keyof typeof dRoles)[]) {
    const p = ORG_D_PEOPLE[key];
    await prisma.user.create({ data: { id: p.id, email: p.email, name: p.name, passwordHash } });
    await prisma.membership.create({
      data: { id: p.membershipId, userId: p.id, orgId: ORG.D.id, role: dRoles[key] },
    });
  }
}

type InvoiceSeed = {
  id: string;
  number: string;
  status: "DRAFT" | "SENT" | "PAID" | "VOID";
  projectId: string;
  clientId: string;
  orgId: string;
  timeEntryIds?: readonly string[];
};

async function seedInvoice(inv: InvoiceSeed, projectName: string) {
  const hours = 2;
  const rate = 150;
  await prisma.invoice.create({
    data: {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      issueDate: daysFromNow(-1),
      dueDate: daysFromNow(29),
      orgId: inv.orgId,
      clientId: inv.clientId,
      subtotal: hours * rate,
      total: hours * rate,
      paidAt: inv.status === "PAID" ? new Date() : null,
      amountPaid: inv.status === "PAID" ? hours * rate : 0,
      lineItems: {
        create: {
          id: `${inv.id}_line`,
          description: `${projectName} work`,
          quantity: hours,
          rate,
          amount: hours * rate,
          projectId: inv.projectId,
        },
      },
    },
  });
  if (inv.status === "PAID") {
    await prisma.payment.create({
      data: {
        orgId: inv.orgId,
        invoiceId: inv.id,
        clientId: inv.clientId,
        amount: hours * rate,
        currency: "USD",
        receivedAt: daysFromNow(0),
      },
    });
  }
  for (const teId of inv.timeEntryIds ?? []) {
    await prisma.timeEntry.update({ where: { id: teId }, data: { invoiceLineItemId: `${inv.id}_line` } });
  }
}

async function seedOrgA() {
  const orgId = ORG.A.id;
  const { OWNER, ADMIN, MEMBER } = USERS.A;

  await prisma.client.create({
    data: { id: A.client.id, orgId, name: A.client.name, shareToken: A.client.shareToken, email: "ap@alpha.test" },
  });
  await prisma.client.create({ data: { id: A.disposableClient.id, orgId, name: A.disposableClient.name } });
  await prisma.contact.create({
    data: { id: A.contact.id, clientId: A.client.id, name: A.contact.name, isPrimary: true },
  });

  await prisma.project.create({
    data: {
      id: A.openProject.id,
      orgId,
      clientId: A.client.id,
      name: A.openProject.name,
      shareToken: A.openProject.shareToken,
      startDate: daysFromNow(-60),
    },
  });
  await prisma.project.create({
    data: { id: A.disposableProject.id, orgId, clientId: A.disposableClient.id, name: A.disposableProject.name },
  });
  await prisma.project.create({
    data: {
      id: A.secretProject.id,
      orgId,
      clientId: A.client.id,
      name: A.secretProject.name,
      confidential: true,
      shareToken: A.secretProject.shareToken,
    },
  });

  // Everyone is on the open project; only the owner is on the confidential one.
  await prisma.projectMember.createMany({
    data: [
      { projectId: A.openProject.id, userId: OWNER.id, billRate: 150 },
      { projectId: A.openProject.id, userId: ADMIN.id, billRate: 150 },
      { id: A.openProject.memberPmId, projectId: A.openProject.id, userId: MEMBER.id, billRate: 150 },
      { projectId: A.secretProject.id, userId: OWNER.id, billRate: 200 },
    ],
  });

  await prisma.task.create({
    data: { id: A.openTask.id, projectId: A.openProject.id, title: A.openTask.title, assigneeId: MEMBER.id },
  });
  await prisma.task.create({
    data: { id: A.secretTask.id, projectId: A.secretProject.id, title: A.secretTask.title, assigneeId: OWNER.id },
  });
  await prisma.milestone.create({
    data: { id: A.milestone.id, projectId: A.openProject.id, name: A.milestone.name, amount: 1000 },
  });

  const entry = (id: string, projectId: string, userId: string, daysAgo: number, description: string) => ({
    id,
    orgId,
    projectId,
    userId,
    date: daysFromNow(-daysAgo),
    hours: 2,
    description,
    billable: true,
  });
  await prisma.timeEntry.createMany({
    data: [
      entry(A.memberEntry.id, A.openProject.id, MEMBER.id, 1, "Member work on the open project"),
      entry(A.secretEntry.id, A.secretProject.id, OWNER.id, 1, "Confidential work"),
      ...A.unbilledEntries.map((id, i) => entry(id, A.openProject.id, OWNER.id, 2 + i, "Unbilled owner work")),
      ...A.uiVoidEntries.map((id, i) => entry(id, A.openProject.id, OWNER.id, 10 + i, "Billed on the UI void invoice")),
      ...A.mcpVoidEntries.map((id, i) => entry(id, A.openProject.id, OWNER.id, 20 + i, "Billed on the MCP void draft")),
    ],
  });

  const base = { orgId, clientId: A.client.id };
  const open = { ...base, projectId: A.openProject.id };
  const secret = { ...base, projectId: A.secretProject.id };
  const inv = A.invoices;
  await seedInvoice({ ...open, ...inv.openDraft, status: "DRAFT" }, A.openProject.name);
  await seedInvoice({ ...secret, ...inv.secret, status: "SENT" }, A.secretProject.name);
  await seedInvoice({ ...secret, ...inv.secretSent, status: "SENT" }, A.secretProject.name);
  await seedInvoice({ ...open, ...inv.mcpSend }, A.openProject.name);
  await seedInvoice({ ...open, ...inv.mcpPay }, A.openProject.name);
  await seedInvoice({ ...open, ...inv.mcpVoidDraft, timeEntryIds: A.mcpVoidEntries }, A.openProject.name);
  await seedInvoice({ ...open, ...inv.mcpPaid }, A.openProject.name);
  await seedInvoice({ ...open, ...inv.mcpVoided }, A.openProject.name);
  await seedInvoice({ ...open, ...inv.memberTarget }, A.openProject.name);
  await seedInvoice({ ...open, ...inv.memberDraft }, A.openProject.name);
  await seedInvoice({ ...open, ...inv.uiVoid, timeEntryIds: A.uiVoidEntries }, A.openProject.name);
  await seedInvoice({ ...open, ...inv.actionPay }, A.openProject.name);
  await seedInvoice({ ...open, ...inv.apiPartial }, A.openProject.name);
}

async function seedOrgB() {
  const orgId = ORG.B.id;
  const { OWNER, MEMBER } = USERS.B;
  await prisma.client.create({
    data: { id: B.client.id, orgId, name: B.client.name, shareToken: B.client.shareToken },
  });
  await prisma.contact.create({ data: { id: B.contact.id, clientId: B.client.id, name: B.contact.name } });
  await prisma.project.create({ data: { id: B.project.id, orgId, clientId: B.client.id, name: B.project.name } });
  await prisma.projectMember.createMany({
    data: [
      { projectId: B.project.id, userId: OWNER.id, billRate: 100 },
      { id: B.project.memberPmId, projectId: B.project.id, userId: MEMBER.id, billRate: 100 },
    ],
  });
  await prisma.task.create({ data: { id: B.task.id, projectId: B.project.id, title: B.task.title } });
  await prisma.milestone.create({
    data: { id: B.milestone.id, projectId: B.project.id, name: B.milestone.name, amount: 500 },
  });
  await prisma.timeEntry.create({
    data: {
      id: B.timeEntry.id,
      orgId,
      projectId: B.project.id,
      userId: OWNER.id,
      date: daysFromNow(-1),
      hours: 1,
      billable: true,
    },
  });
  await seedInvoice(
    { ...B.invoice, status: "SENT", orgId, clientId: B.client.id, projectId: B.project.id },
    B.project.name
  );
}

/** Credential links: client-wide, open project, confidential project, org B. */
async function seedVaultLinks() {
  const link = (
    v: { id: string; label: string; url: string },
    orgId: string,
    clientId: string,
    projectId: string | null,
    provider: string
  ) => ({ id: v.id, label: v.label, url: v.url, provider, orgId, clientId, projectId, itemKind: "login" });
  await prisma.vaultLink.createMany({
    data: [
      link(VAULT.clientWide, ORG.A.id, A.client.id, null, "ONEPASSWORD"),
      link(VAULT.openProject, ORG.A.id, A.client.id, A.openProject.id, "BITWARDEN"),
      link(VAULT.secretProject, ORG.A.id, A.client.id, A.secretProject.id, "BITWARDEN"),
      link(VAULT.orgB, ORG.B.id, B.client.id, null, "ONEPASSWORD"),
    ],
  });
}

// Org E: share links with email verification and expiry (share-gate.spec).
async function seedOrgE() {
  const orgId = E.org.id;
  await prisma.organization.create({
    data: { id: orgId, name: E.org.name, slug: "e2e-org-e", invoicePrefix: E.org.prefix, defaultCurrency: "USD" },
  });
  await prisma.client.create({
    data: {
      id: E.gated.id,
      orgId,
      name: E.gated.name,
      shareToken: E.gated.shareToken,
      shareVerification: "ON",
    },
  });
  await prisma.contact.createMany({
    data: Object.values(E.contacts).map((c) => ({ id: c.id, clientId: E.gated.id, name: c.name, email: c.email })),
  });
  await prisma.project.create({
    data: {
      id: E.gatedProject.id,
      orgId,
      clientId: E.gated.id,
      name: E.gatedProject.name,
      shareToken: E.gatedProject.shareToken,
    },
  });
  await seedInvoice(
    { ...E.invoice, status: "SENT", orgId, clientId: E.gated.id, projectId: E.gatedProject.id },
    E.gatedProject.name
  );
  await prisma.invoice.update({ where: { id: E.invoice.id }, data: { viewToken: E.invoice.viewToken } });
  const brief = Buffer.from("Gamma project brief\n");
  await prisma.clientDocument.create({
    data: {
      id: E.document.id,
      clientId: E.gated.id,
      audience: "CLIENT",
      source: "UPLOAD",
      fileName: E.document.fileName,
      fileData: brief,
      contentType: "text/plain",
      sizeBytes: brief.length,
    },
  });

  await prisma.client.create({
    data: {
      id: E.expired.id,
      orgId,
      name: E.expired.name,
      shareToken: E.expired.shareToken,
      shareExpiresAt: daysFromNow(-1),
    },
  });
  await prisma.project.create({
    data: {
      id: E.expiredProject.id,
      orgId,
      clientId: E.expired.id,
      name: E.expiredProject.name,
      shareToken: E.expiredProject.shareToken,
      shareExpiresAt: daysFromNow(-1),
    },
  });
}

/** Due dates, a confidential milestone, a deliverable, member A's calendar feed. */
async function seedSchedule() {
  await prisma.task.update({ where: { id: A.openTask.id }, data: { dueDate: daysFromNow(SCHEDULE.openTaskDueIn) } });
  await prisma.task.update({ where: { id: A.secretTask.id }, data: { dueDate: daysFromNow(SCHEDULE.secretTaskDueIn) } });
  await prisma.milestone.create({
    data: {
      id: SCHEDULE.secretMilestone.id,
      projectId: A.secretProject.id,
      name: SCHEDULE.secretMilestone.name,
      amount: 750,
      dueDate: daysFromNow(SCHEDULE.secretMilestone.dueIn),
    },
  });
  await prisma.milestone.create({
    data: {
      id: SCHEDULE.deliverable.id,
      projectId: A.secretProject.id,
      name: SCHEDULE.deliverable.name,
      billable: false,
      amount: 0,
      dueDate: daysFromNow(SCHEDULE.deliverable.dueIn),
      completedAt: new Date(),
      completedById: USERS.A.OWNER.id,
      completionNote: "Delivered",
    },
  });
  await prisma.calendarSubscription.create({
    data: { tokenHash: hashKey(SCHEDULE.memberFeedToken), userId: USERS.A.MEMBER.id, orgId: ORG.A.id },
  });
}

async function main() {
  await truncateAll();
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  await seedPeople(passwordHash);
  await seedOrgA();
  await seedOrgB();
  await seedOrgE();
  await seedVaultLinks();
  await seedSchedule();
  // Setup is done once a user exists; record the instance URL too so pages
  // that build share links don't fall back to guessing.
  await prisma.instanceSetting.create({
    data: { key: "publicUrl", value: process.env.E2E_BASE_URL ?? "http://localhost:3130" },
  });
  console.log("Seeded e2e data.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
