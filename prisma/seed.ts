import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const org = await prisma.organization.create({
    data: {
      name: "Acme Consulting",
      slug: "acme-consulting",
      invoicePrefix: "INV",
      defaultCurrency: "USD",
      defaultTaxRate: 0,
    },
  });

  const user = await prisma.user.create({
    data: {
      name: "Jordan Lee",
      email: "demo@example.com",
      passwordHash,
    },
  });

  await prisma.membership.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const client = await prisma.client.create({
    data: {
      orgId: org.id,
      name: "Globex Corporation",
      description: "Mid-market logistics company. Quarterly ops consulting engagement.",
      email: "ap@globex.example.com",
      phone: "+1 (555) 010-2020",
      address: "500 Industrial Way, Springfield, USA",
      status: "ACTIVE",
    },
  });

  await prisma.contact.create({
    data: {
      clientId: client.id,
      name: "Hank Scorpio",
      title: "VP of Operations",
      email: "hank@globex.example.com",
      phone: "+1 (555) 010-2021",
      isPrimary: true,
    },
  });

  await prisma.link.createMany({
    data: [
      { clientId: client.id, label: "Client Portal Login", url: "https://portal.globex.example.com", type: "LOGIN" },
      { clientId: client.id, label: "Shared Drive", url: "https://drive.example.com/globex", type: "GDRIVE" },
    ],
  });

  const project = await prisma.project.create({
    data: {
      orgId: org.id,
      clientId: client.id,
      name: "Supply Chain Optimization",
      description: "Analyze warehouse throughput and recommend process changes.",
      status: "ACTIVE",
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    },
  });

  await prisma.projectMember.create({
    data: { projectId: project.id, userId: user.id, billRate: 175, currency: "USD" },
  });

  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    await prisma.timeEntry.create({
      data: {
        orgId: org.id,
        projectId: project.id,
        userId: user.id,
        date,
        hours: 3 + (i % 3),
        description: i === 0 ? "Warehouse walkthrough and stakeholder interviews" : "Process analysis",
        billable: true,
      },
    });
  }

  console.log("Seeded demo data:");
  console.log(`  Org: ${org.name}`);
  console.log(`  Login: demo@example.com / password123`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
