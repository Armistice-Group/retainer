// Server actions called directly with a logged-in session (the way the
// browser calls them), so role and org checks are tested on the server even
// where the UI hides the button. Each check reads the database afterwards.
import { test as base, expect, type APIRequestContext, type PlaywrightWorkerArgs } from "@playwright/test";
import { A, B, ORG_D_PEOPLE, STORAGE } from "./fixtures";
import { callAction, exists, expectRefused, invoiceStatus, sql } from "./helpers";

type Sessions = { owner: APIRequestContext; member: APIRequestContext; ownerB: APIRequestContext; adminD: APIRequestContext };

/** A request context logged in with one of the saved sessions. */
function session(storageState: string) {
  return async (
    { playwright, baseURL }: PlaywrightWorkerArgs & { baseURL: string | undefined },
    provide: (ctx: APIRequestContext) => Promise<void>
  ) => {
    const ctx = await playwright.request.newContext({ baseURL, storageState });
    await provide(ctx);
    await ctx.dispose();
  };
}

const test = base.extend<Sessions>({
  owner: session(STORAGE.ownerA),
  member: session(STORAGE.memberA),
  ownerB: session(STORAGE.ownerB),
  adminD: session(STORAGE.adminD),
});

const inv = A.invoices;

test("harness check: an owner's action call does take effect", async ({ owner }) => {
  // Without this, every "nothing changed" assertion below could pass simply
  // because the action was never reached.
  await callAction(owner, "invoices.ts", "setInvoiceStatusAction", [inv.actionPay.id, "PAID"]);
  expect(await invoiceStatus(inv.actionPay.id)).toBe("PAID");
});

test.describe("members", () => {
  test("can't send, mark paid or void an invoice", async ({ member }) => {
    await expectRefused(member, "invoices.ts", "setInvoiceStatusAction", [inv.memberTarget.id, "PAID"]);
    await expectRefused(member, "invoices.ts", "setInvoiceStatusAction", [inv.memberTarget.id, "VOID"]);
    await expectRefused(member, "invoices.ts", "setInvoiceStatusAction", [inv.memberDraft.id, "SENT"]);
    await expectRefused(member, "invoices.ts", "sendInvoiceAction", [inv.memberDraft.id, null]);
    await expectRefused(member, "invoices.ts", "deleteInvoiceAction", [inv.memberDraft.id]);
    expect(await invoiceStatus(inv.memberTarget.id)).toBe("SENT");
    expect(await invoiceStatus(inv.memberDraft.id)).toBe("DRAFT");
  });

  test("can't void a confidential project's invoice", async ({ member }) => {
    await expectRefused(member, "invoices.ts", "setInvoiceStatusAction", [inv.secretSent.id, "VOID"]);
    expect(await invoiceStatus(inv.secretSent.id)).toBe("SENT");
  });

  test("can't delete clients or projects", async ({ member }) => {
    await expectRefused(member, "projects.ts", "deleteProjectAction", [A.disposableProject.id, A.disposableClient.id]);
    await expectRefused(member, "clients.ts", "deleteClientAction", [A.disposableClient.id]);
    expect(await exists("Project", A.disposableProject.id)).toBe(true);
    expect(await exists("Client", A.disposableClient.id)).toBe(true);
  });

  test("can't remove people from a project", async ({ member }) => {
    await expectRefused(member, "projects.ts", "removeProjectMemberAction", [A.openProject.memberPmId, A.openProject.id]);
    expect(await exists("ProjectMember", A.openProject.memberPmId)).toBe(true);
  });

  test("can't delete, reopen or complete milestones", async ({ member }) => {
    await expectRefused(member, "milestones.ts", "reopenMilestoneAction", [A.milestone.id, A.openProject.id]);
    await expectRefused(member, "milestones.ts", "deleteMilestoneAction", [A.milestone.id, A.openProject.id]);
    expect(await exists("Milestone", A.milestone.id)).toBe(true);
  });

  test("can't change roles or remove people", async ({ member }) => {
    await expectRefused(member, "org.ts", "updateMemberRoleAction", [USERS_A_OWNER_MEMBERSHIP, "MEMBER"]);
    await expectRefused(member, "org.ts", "removeMemberAction", [USERS_A_ADMIN_MEMBERSHIP]);
    const roles = await sql<{ id: string; role: string }>(
      `SELECT id, role FROM "Membership" WHERE id = ANY($1) ORDER BY role`,
      [[USERS_A_OWNER_MEMBERSHIP, USERS_A_ADMIN_MEMBERSHIP]]
    );
    expect(roles).toEqual([
      { id: USERS_A_OWNER_MEMBERSHIP, role: "OWNER" },
      { id: USERS_A_ADMIN_MEMBERSHIP, role: "ADMIN" },
    ]);
  });
});

const USERS_A_OWNER_MEMBERSHIP = "e2e_mem_owner_a";
const USERS_A_ADMIN_MEMBERSHIP = "e2e_mem_admin_a";

test.describe("admins", () => {
  test("can't demote or remove an owner", async ({ adminD }) => {
    const { owner1 } = ORG_D_PEOPLE;
    await expectRefused(adminD, "org.ts", "updateMemberRoleAction", [owner1.membershipId, "MEMBER"]);
    await expectRefused(adminD, "org.ts", "updateMemberRoleAction", [owner1.membershipId, "ADMIN"]);
    await expectRefused(adminD, "org.ts", "removeMemberAction", [owner1.membershipId]);
    const [row] = await sql<{ role: string }>(`SELECT role FROM "Membership" WHERE id = $1`, [owner1.membershipId]);
    expect(row?.role).toBe("OWNER");
  });

  test("can't make anyone an owner", async ({ adminD }) => {
    await expectRefused(adminD, "org.ts", "updateMemberRoleAction", [ORG_D_PEOPLE.admin.membershipId, "OWNER"]);
    const [row] = await sql<{ role: string }>(`SELECT role FROM "Membership" WHERE id = $1`, [
      ORG_D_PEOPLE.admin.membershipId,
    ]);
    expect(row.role).toBe("ADMIN");
  });
});

test.describe("another org's owner", () => {
  test("can't delete a contact, even by pairing it with their own client", async ({ ownerB }) => {
    await expectRefused(ownerB, "clients.ts", "deleteContactAction", [A.contact.id, A.client.id]);
    await expectRefused(ownerB, "clients.ts", "deleteContactAction", [A.contact.id, B.client.id]);
    expect(await exists("Contact", A.contact.id)).toBe(true);
  });

  test("can't remove a project member, even by pairing it with their own project", async ({ ownerB }) => {
    await expectRefused(ownerB, "projects.ts", "removeProjectMemberAction", [A.openProject.memberPmId, A.openProject.id]);
    await expectRefused(ownerB, "projects.ts", "removeProjectMemberAction", [A.openProject.memberPmId, B.project.id]);
    expect(await exists("ProjectMember", A.openProject.memberPmId)).toBe(true);
  });

  test("can't delete a client, project, milestone or invoice", async ({ ownerB }) => {
    await expectRefused(ownerB, "clients.ts", "deleteClientAction", [A.disposableClient.id]);
    await expectRefused(ownerB, "projects.ts", "deleteProjectAction", [A.disposableProject.id, A.disposableClient.id]);
    await expectRefused(ownerB, "milestones.ts", "deleteMilestoneAction", [A.milestone.id, A.openProject.id]);
    await expectRefused(ownerB, "milestones.ts", "deleteMilestoneAction", [A.milestone.id, B.project.id]);
    await expectRefused(ownerB, "invoices.ts", "deleteInvoiceAction", [inv.openDraft.id]);
    await expectRefused(ownerB, "invoices.ts", "setInvoiceStatusAction", [inv.memberTarget.id, "VOID"]);
    expect(await exists("Client", A.disposableClient.id)).toBe(true);
    expect(await exists("Project", A.disposableProject.id)).toBe(true);
    expect(await exists("Milestone", A.milestone.id)).toBe(true);
    expect(await exists("Invoice", inv.openDraft.id)).toBe(true);
    expect(await invoiceStatus(inv.memberTarget.id)).toBe("SENT");
  });

  test("can't change roles or remove people in another org", async ({ ownerB }) => {
    await expectRefused(ownerB, "org.ts", "updateMemberRoleAction", [USERS_A_ADMIN_MEMBERSHIP, "MEMBER"]);
    await expectRefused(ownerB, "org.ts", "removeMemberAction", [USERS_A_ADMIN_MEMBERSHIP]);
    const [row] = await sql<{ role: string }>(`SELECT role FROM "Membership" WHERE id = $1`, [
      USERS_A_ADMIN_MEMBERSHIP,
    ]);
    expect(row?.role).toBe("ADMIN");
  });
});
