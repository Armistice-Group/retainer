// Richer demo dataset — a small consultancy a few weeks into several
// engagements. Used for the README / website screenshots
// (scripts/screenshots.mjs) and handy for trying the app out:
//
//   DATABASE_URL=... npx tsx prisma/seed-demo.ts      (on an empty database)
//
// Deterministic (seeded PRNG), with dates relative to today, so screenshots
// look the same whenever they're regenerated. All names are fictional.
import bcrypt from "bcryptjs";
import { PrismaClient, type User, type Client, type Project, type Task } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let seed = 20261008;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const DAY = 24 * 60 * 60 * 1000;
const today = new Date();
today.setHours(0, 0, 0, 0);
const daysAgo = (n: number) => new Date(today.getTime() - n * DAY);
// @db.Date columns: UTC midnight of the calendar day.
const dateOnly = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const org = await prisma.organization.create({
    data: {
      name: "Northwind Labs",
      slug: "northwind-labs",
      domain: "northwind.example",
      invoicePrefix: "NWL",
      defaultCurrency: "USD",
      nextInvoiceNumber: 1,
    },
  });

  await prisma.paymentMethod.createMany({
    data: [
      {
        orgId: org.id,
        type: "ACH",
        label: "Operating",
        details: { bankName: "First Example Bank", accountName: "Northwind Labs LLC", routingNumber: "000000000", accountNumber: "000001234567", accountType: "Checking" },
        showOnPdf: false,
        sortOrder: 0,
      },
      {
        orgId: org.id,
        type: "STRIPE_LINK",
        details: { url: "https://buy.stripe.com/test_northwind" },
        showOnPdf: true,
        sortOrder: 1,
      },
      {
        orgId: org.id,
        type: "CHECK",
        details: { payableTo: "Northwind Labs LLC", mailingAddress: "100 Example Ave, Suite 4\nPortland, OR 97201" },
        showOnPdf: true,
        sortOrder: 2,
      },
    ],
  });

  const people = [
    { name: "Maya Chen", email: "maya@northwind.example", role: "OWNER", title: "Principal" },
    { name: "Diego Alvarez", email: "diego@northwind.example", role: "ADMIN", title: "Staff Engineer" },
    { name: "Priya Nair", email: "priya@northwind.example", role: "MEMBER", title: "Security Engineer" },
    { name: "Sam Okafor", email: "sam@contractor.example", role: "MEMBER", title: "Designer", contractor: true },
  ] as const;

  const users: User[] = [];
  for (const p of people) {
    const user = await prisma.user.create({ data: { name: p.name, email: p.email, passwordHash } });
    await prisma.membership.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role: p.role,
        title: p.title,
        employmentType: "contractor" in p ? "CONTRACTOR" : "EMPLOYEE",
      },
    });
    users.push(user);
  }
  const [maya, diego, priya, sam] = users;

  const clientDefs = [
    {
      name: "Pinecrest Health",
      description: "Regional hospital network modernizing patient scheduling.",
      email: "it@pinecrest.example",
      contact: ["Alicia Romero", "Director of Digital Products", "alicia@pinecrest.example"],
    },
    {
      name: "Tidewater Logistics",
      description: "Freight brokerage; ongoing platform reliability work.",
      email: "ap@tidewater.example",
      contact: ["Marcus Bell", "VP Engineering", "marcus@tidewater.example"],
    },
    {
      name: "Copperline Financial",
      description: "Fintech lender preparing for its SOC 2 Type II audit.",
      email: "finance@copperline.example",
      contact: ["Hannah Weiss", "CISO", "hannah@copperline.example"],
    },
    {
      name: "Atlas Robotics",
      description: "Warehouse robotics startup — fleet dashboard and API.",
      email: "ops@atlasrobotics.example",
      contact: ["Ken Watanabe", "CTO", "ken@atlasrobotics.example"],
    },
    {
      name: "Lumen Analytics",
      description: "Data platform company; design system refresh.",
      email: "hello@lumen.example",
      contact: ["Nora Fitzgerald", "Head of Design", "nora@lumen.example"],
    },
  ];

  const clients: Client[] = [];
  for (const c of clientDefs) {
    const client = await prisma.client.create({
      data: { orgId: org.id, name: c.name, description: c.description, email: c.email, status: "ACTIVE" },
    });
    await prisma.contact.create({
      data: { clientId: client.id, name: c.contact[0], title: c.contact[1], email: c.contact[2], isPrimary: true },
    });
    clients.push(client);
  }
  const [pinecrest, tidewater, copperline, atlas, lumen] = clients;

  type ProjectDef = {
    client: (typeof clients)[number];
    name: string;
    description: string;
    billingType: "HOURLY" | "FLAT_FEE" | "MILESTONE";
    budgetHours?: number;
    flatFeeAmount?: number;
    startDaysAgo: number;
    members: [(typeof users)[number], number][];
    tasks: [string, "TODO" | "IN_PROGRESS" | "DONE", (typeof users)[number] | null, number?][];
    work: string[];
  };

  const projectDefs: ProjectDef[] = [
    {
      client: pinecrest,
      name: "Patient Scheduling Rebuild",
      description: "Replace the legacy scheduling portal with a modern booking flow and API.",
      billingType: "HOURLY",
      budgetHours: 320,
      startDaysAgo: 48,
      members: [[maya, 210], [diego, 185], [sam, 140]],
      tasks: [
        ["Booking flow: provider availability API", "DONE", diego, 24],
        ["Appointment reminders via SMS", "IN_PROGRESS", diego, 16],
        ["Accessibility audit of booking UI", "IN_PROGRESS", sam, 10],
        ["EHR integration spike", "TODO", maya, 8],
        ["Load test booking endpoints", "TODO", diego, 6],
      ],
      work: ["Availability API endpoints", "Booking UI review with Alicia", "SMS reminder worker", "Provider calendar sync", "Design review: confirmation screens"],
    },
    {
      client: tidewater,
      name: "Platform Reliability",
      description: "Ongoing SRE support: on-call tooling, observability, incident reviews.",
      billingType: "HOURLY",
      startDaysAgo: 60,
      members: [[diego, 185], [priya, 175]],
      tasks: [
        ["Migrate alerts to SLO-based paging", "IN_PROGRESS", diego, 12],
        ["Postmortem: carrier API outage", "DONE", priya, 4],
        ["Tracing for quote service", "TODO", diego, 10],
      ],
      work: ["SLO dashboard work", "Incident review", "Kubernetes upgrade prep", "On-call runbook cleanup"],
    },
    {
      client: copperline,
      name: "SOC 2 Readiness",
      description: "Gap assessment, control implementation, and audit evidence collection.",
      billingType: "MILESTONE",
      startDaysAgo: 40,
      members: [[priya, 195], [maya, 210]],
      tasks: [
        ["Access review automation", "DONE", priya, 12],
        ["Vendor risk register", "IN_PROGRESS", priya, 6],
        ["Incident response tabletop", "TODO", maya, 4],
      ],
      work: ["Control gap analysis", "Evidence collection: access reviews", "Policy drafting", "Auditor prep call"],
    },
    {
      client: copperline,
      name: "Penetration Test — Lending API",
      description: "External and authenticated testing of the lending API and admin console.",
      billingType: "FLAT_FEE",
      flatFeeAmount: 18500,
      budgetHours: 80,
      startDaysAgo: 18,
      members: [[priya, 195]],
      tasks: [
        ["Recon and attack surface mapping", "DONE", priya, 8],
        ["Authenticated API testing", "IN_PROGRESS", priya, 30],
        ["Report and retest", "TODO", priya, 12],
      ],
      work: ["API authorization testing", "Admin console testing", "Findings write-up"],
    },
    {
      client: atlas,
      name: "Fleet Dashboard",
      description: "Real-time robot fleet dashboard and public REST API.",
      billingType: "HOURLY",
      budgetHours: 200,
      startDaysAgo: 30,
      members: [[diego, 185], [sam, 140], [maya, 210]],
      tasks: [
        ["Telemetry ingestion pipeline", "IN_PROGRESS", diego, 20],
        ["Fleet map view", "IN_PROGRESS", sam, 14],
        ["API key management", "TODO", diego, 8],
      ],
      work: ["Telemetry pipeline", "Map view prototype", "API design session with Ken", "WebSocket updates"],
    },
    {
      client: lumen,
      name: "Design System Refresh",
      description: "Tokens, component library, and documentation site.",
      billingType: "HOURLY",
      budgetHours: 90,
      startDaysAgo: 25,
      members: [[sam, 140], [maya, 210]],
      tasks: [
        ["Color and type tokens", "DONE", sam, 10],
        ["Component audit", "DONE", sam, 8],
        ["Docs site", "IN_PROGRESS", sam, 16],
      ],
      work: ["Token definitions", "Component audit", "Docs site build", "Review with Nora"],
    },
    {
      client: tidewater,
      name: "Carrier API v2 Discovery",
      description: "Two-week discovery for the next carrier integration platform.",
      billingType: "HOURLY",
      startDaysAgo: 75,
      members: [[maya, 210]],
      tasks: [["Discovery readout", "DONE", maya, 6]],
      work: ["Stakeholder interviews", "Architecture options"],
    },
  ];

  const projects: { def: ProjectDef; project: Project; tasks: Task[] }[] = [];
  for (const def of projectDefs) {
    const project = await prisma.project.create({
      data: {
        orgId: org.id,
        clientId: def.client.id,
        name: def.name,
        description: def.description,
        status: def.name.startsWith("Carrier API") ? "COMPLETED" : "ACTIVE",
        billingType: def.billingType,
        budgetHours: def.budgetHours ?? null,
        flatFeeAmount: def.flatFeeAmount ?? null,
        startDate: dateOnly(daysAgo(def.startDaysAgo)),
      },
    });
    for (const [user, rate] of def.members) {
      await prisma.projectMember.create({
        data: { projectId: project.id, userId: user.id, billRate: rate, currency: "USD" },
      });
    }
    const tasks: Task[] = [];
    for (const [title, status, assignee, est] of def.tasks) {
      tasks.push(
        await prisma.task.create({
          data: { projectId: project.id, title, status, assigneeId: assignee?.id ?? null, estimatedHours: est ?? null },
        })
      );
    }
    projects.push({ def, project, tasks });
  }

  // Time: weekdays over the last eight weeks, within each project's active span.
  const entries: { id: string; projectId: string; userId: string; date: Date; hours: number; rate: number }[] = [];
  for (let d = 56; d >= 0; d--) {
    const date = daysAgo(d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    for (const user of users) {
      const theirs = projects.filter(
        (p) =>
          p.def.members.some(([u]) => u.id === user.id) &&
          p.def.startDaysAgo >= d &&
          !(p.project.status === "COMPLETED" && d < 45)
      );
      if (theirs.length === 0 || rand() < 0.12) continue;
      const count = theirs.length > 1 && rand() < 0.5 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const p = pick(theirs);
        const hours = Math.round((count === 2 ? 2 + rand() * 3 : 4 + rand() * 4) * 4) / 4;
        const rate = p.def.members.find(([u]) => u.id === user.id)![1];
        const task = rand() < 0.6 ? pick(p.tasks.filter((t) => t.assigneeId === user.id)) : undefined;
        const entry = await prisma.timeEntry.create({
          data: {
            orgId: org.id,
            projectId: p.project.id,
            userId: user.id,
            taskId: task?.id ?? null,
            date: dateOnly(date),
            hours,
            description: pick(p.def.work),
            billable: rand() > 0.08,
          },
        });
        entries.push({ id: entry.id, projectId: p.project.id, userId: user.id, date, hours, rate });
      }
    }
  }

  // Invoices for older periods: paid, sent (one overdue), and a draft.
  let invoiceNumber = 1;
  async function invoiceFor(
    client: (typeof clients)[number],
    fromDaysAgo: number,
    toDaysAgo: number,
    status: "PAID" | "SENT" | "DRAFT",
    issuedDaysAgo: number,
    terms: "NET15" | "NET30" = "NET30"
  ) {
    const projectIds = new Set(projects.filter((p) => p.def.client.id === client.id).map((p) => p.project.id));
    const due = entries.filter(
      (e) => projectIds.has(e.projectId) && e.date >= daysAgo(fromDaysAgo) && e.date < daysAgo(toDaysAgo)
    );
    if (due.length === 0) return null;
    const groups = new Map<string, typeof due>();
    for (const e of due) {
      const key = `${e.projectId}:${e.userId}`;
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    const issueDate = daysAgo(issuedDaysAgo);
    const dueDate = new Date(issueDate.getTime() + (terms === "NET15" ? 15 : 30) * DAY);
    const invoice = await prisma.invoice.create({
      data: {
        orgId: org.id,
        clientId: client.id,
        number: `NWL-${String(invoiceNumber++).padStart(4, "0")}`,
        status,
        issueDate: dateOnly(issueDate),
        dueDate: dateOnly(dueDate),
        paymentTerms: terms,
        currency: "USD",
        notes: `Services through ${daysAgo(toDaysAgo + 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`,
      },
    });
    let subtotal = 0;
    let sort = 0;
    for (const group of groups.values()) {
      const p = projects.find((x) => x.project.id === group[0].projectId)!;
      const u = users.find((x) => x.id === group[0].userId)!;
      const hours = group.reduce((s, e) => s + e.hours, 0);
      const amount = Math.round(hours * group[0].rate * 100) / 100;
      subtotal += amount;
      const line = await prisma.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          projectId: p.project.id,
          description: `${p.project.name} — ${u.name}`,
          quantity: hours,
          rate: group[0].rate,
          amount,
          sortOrder: sort++,
        },
      });
      await prisma.timeEntry.updateMany({
        where: { id: { in: group.map((e) => e.id) } },
        data: { invoiceLineItemId: line.id },
      });
    }
    await prisma.invoice.update({ where: { id: invoice.id }, data: { subtotal, total: subtotal } });
    return invoice;
  }

  await invoiceFor(tidewater, 80, 42, "PAID", 41);
  await invoiceFor(pinecrest, 50, 28, "PAID", 27);
  const tidewaterCycleInvoice = await invoiceFor(tidewater, 42, 28, "PAID", 27, "NET15");
  await invoiceFor(atlas, 32, 14, "SENT", 13);
  await invoiceFor(pinecrest, 28, 14, "SENT", 40); // issued long ago → overdue
  await invoiceFor(lumen, 26, 7, "DRAFT", 0);

  // Milestones on the SOC 2 project: one invoiced, one done, one upcoming.
  const soc2 = projects.find((p) => p.def.name === "SOC 2 Readiness")!.project;
  const msInvoice = await prisma.invoice.create({
    data: {
      orgId: org.id,
      clientId: copperline.id,
      number: `NWL-${String(invoiceNumber++).padStart(4, "0")}`,
      status: "PAID",
      issueDate: dateOnly(daysAgo(20)),
      dueDate: dateOnly(daysAgo(-10)),
      subtotal: 12000,
      total: 12000,
    },
  });
  const msLine = await prisma.invoiceLineItem.create({
    data: {
      invoiceId: msInvoice.id,
      projectId: soc2.id,
      description: "SOC 2 Readiness — Milestone: Gap assessment",
      quantity: 1,
      rate: 12000,
      amount: 12000,
    },
  });
  await prisma.milestone.createMany({
    data: [
      { projectId: soc2.id, name: "Gap assessment", amount: 12000, sortOrder: 0, dueDate: dateOnly(daysAgo(22)), completedAt: daysAgo(21), completedById: priya.id, invoiceLineItemId: msLine.id, invoicedAt: daysAgo(20) },
      { projectId: soc2.id, name: "Control implementation", amount: 18000, sortOrder: 1, dueDate: dateOnly(daysAgo(2)), completedAt: daysAgo(3), completedById: priya.id, completionNote: "All 42 controls implemented; evidence in the shared drive." },
      { projectId: soc2.id, name: "Audit support", amount: 9000, sortOrder: 2, dueDate: dateOnly(daysAgo(-30)) },
    ],
  });
  await prisma.organization.update({ where: { id: org.id }, data: { nextInvoiceNumber: invoiceNumber } });

  // Expenses.
  const fleet = projects.find((p) => p.def.name === "Fleet Dashboard")!.project;
  const pentest = projects.find((p) => p.def.name.startsWith("Penetration"))!.project;
  await prisma.expense.createMany({
    data: [
      { orgId: org.id, projectId: fleet.id, submittedById: diego.id, description: "Map tiles API — monthly plan", category: "Software", amount: 249, incurredAt: dateOnly(daysAgo(9)), status: "APPROVED", approvedById: maya.id, approvedAt: daysAgo(8) },
      { orgId: org.id, projectId: pentest.id, submittedById: priya.id, description: "Burp Suite Pro license (prorated)", category: "Software", amount: 125, incurredAt: dateOnly(daysAgo(15)), status: "APPROVED", approvedById: maya.id, approvedAt: daysAgo(15) },
      { orgId: org.id, projectId: fleet.id, submittedById: sam.id, description: "Travel — on-site workshop", category: "Travel", amount: 412.6, incurredAt: dateOnly(daysAgo(4)), status: "PENDING" },
    ],
  });

  // Automation: Tidewater on a bi-weekly billing cycle, Lumen on a retainer.
  const nextFriday = new Date(today);
  nextFriday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7 || 7));
  await prisma.clientBillingCycle.create({
    data: {
      orgId: org.id,
      clientId: tidewater.id,
      interval: "BIWEEKLY",
      anchorDay: nextFriday.getDate(),
      paymentTerms: "NET15",
      nextRunAt: nextFriday,
      lastRunAt: daysAgo(14 - ((5 - today.getDay() + 7) % 7 || 7)),
      lastInvoiceId: tidewaterCycleInvoice?.id ?? null,
    },
  });
  await prisma.recurringInvoiceSchedule.create({
    data: {
      orgId: org.id,
      clientId: copperline.id,
      description: "Security advisory retainer",
      amount: 4500,
      interval: "MONTHLY",
      retainerHours: 20,
      nextRunAt: new Date(today.getFullYear(), today.getMonth() + 1, 1),
    },
  });

  await prisma.notification.createMany({
    data: [
      { orgId: org.id, userId: maya.id, type: "INVOICE_PAID", message: "Invoice NWL-0003 for Tidewater Logistics was paid.", link: "/invoices" },
      { orgId: org.id, userId: maya.id, type: "INVOICE_OVERDUE", message: "Invoice NWL-0005 for Pinecrest Health is 10 days overdue.", link: "/invoices" },
      { orgId: org.id, userId: maya.id, type: "TIME_LOGGED", message: "Priya Nair logged 6.5h on Penetration Test — Lending API.", link: "/time", readAt: daysAgo(1) },
    ],
  });

  console.log("Seeded demo consultancy: Northwind Labs");
  console.log("  Log in as maya@northwind.example / password123 (owner)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
