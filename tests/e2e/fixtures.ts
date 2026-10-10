// Fixed ids, logins and API keys for the end-to-end test data. The seed
// (tests/e2e/seed.ts) writes exactly these rows, so tests can refer to them
// directly. Nothing here is a real secret: it only exists in the throwaway
// test database.

export const PASSWORD = "e2e-Password-123!";

export type RoleName = "OWNER" | "ADMIN" | "MEMBER";
export type OrgKey = "A" | "B";

type Person = { id: string; email: string; name: string; apiKey: string; membershipId: string };

function person(org: OrgKey, role: RoleName): Person {
  const r = role.toLowerCase();
  const o = org.toLowerCase();
  return {
    id: `e2e_user_${r}_${o}`,
    email: `${r}.${o}@e2e.test`,
    name: `${role[0]}${r.slice(1)} ${org}`,
    // Same shape as real keys (lib/api-auth): "ch_live_" + random.
    apiKey: `ch_live_e2e_${r}_${o}_0123456789abcdef`,
    membershipId: `e2e_mem_${r}_${o}`,
  };
}

export const USERS = {
  A: { OWNER: person("A", "OWNER"), ADMIN: person("A", "ADMIN"), MEMBER: person("A", "MEMBER") },
  B: { OWNER: person("B", "OWNER"), ADMIN: person("B", "ADMIN"), MEMBER: person("B", "MEMBER") },
} as const;

/** Owner of an org that requires two-factor; has no authenticator set up. */
export const TWO_FACTOR_USER = {
  id: "e2e_user_2fa",
  email: "no-totp@e2e.test",
  name: "No Totp",
  membershipId: "e2e_mem_2fa",
};

export const ORG = {
  A: { id: "e2e_org_a", name: "E2E Org A", prefix: "A" },
  B: { id: "e2e_org_b", name: "E2E Org B", prefix: "B" },
  C: { id: "e2e_org_c", name: "E2E Org Requires 2FA", prefix: "C" },
  D: { id: "e2e_org_d", name: "E2E Org Roles", prefix: "D" },
} as const;

/** Org D exists only for role-change tests: two owners (so the "last owner"
 * guard can't mask a missing role check) and an admin. */
export const ORG_D_PEOPLE = {
  owner1: { id: "e2e_user_owner1_d", email: "owner1.d@e2e.test", name: "Owner One D", membershipId: "e2e_mem_owner1_d" },
  owner2: { id: "e2e_user_owner2_d", email: "owner2.d@e2e.test", name: "Owner Two D", membershipId: "e2e_mem_owner2_d" },
  admin: { id: "e2e_user_admin_d", email: "admin.d@e2e.test", name: "Admin D", membershipId: "e2e_mem_admin_d" },
} as const;

export const A = {
  client: { id: "e2e_client_a", name: "Alpha Client", shareToken: "e2e-share-client-a-token" },
  // Owners/admins and members may delete these via actions in tests.
  disposableClient: { id: "e2e_client_a_disposable", name: "Alpha Disposable Client" },
  contact: { id: "e2e_contact_a", name: "Alice Contact" },
  openProject: {
    id: "e2e_project_a_open",
    name: "Alpha Open Project",
    shareToken: "e2e-share-project-a-open",
    memberPmId: "e2e_pm_a_open_member",
  },
  disposableProject: { id: "e2e_project_a_disposable", name: "Alpha Disposable Project" },
  secretProject: {
    id: "e2e_project_a_secret",
    name: "Alpha Confidential Project",
    shareToken: "e2e-share-project-a-secret",
  },
  secretTask: { id: "e2e_task_a_secret", title: "Alpha secret task" },
  openTask: { id: "e2e_task_a_open", title: "Alpha open task" },
  milestone: { id: "e2e_milestone_a", name: "Alpha milestone" },
  memberEntry: { id: "e2e_te_a_member" },
  secretEntry: { id: "e2e_te_a_secret" },
  /** Unbilled, billable owner entries on the open project, for generate tests. */
  unbilledEntries: ["e2e_te_a_unbilled_1", "e2e_te_a_unbilled_2"],
  invoices: {
    /** Draft on the open project. Read-only. */
    openDraft: { id: "e2e_inv_a_open_draft", number: "A-0001" },
    /** Sent, with a line on the confidential project. Read-only. */
    secret: { id: "e2e_inv_a_secret", number: "A-0002" },
    /** Sent, its line on the confidential project; members try to void it. */
    secretSent: { id: "e2e_inv_a_secret_sent", number: "A-0003" },
    mcpSend: { id: "e2e_inv_a_mcp_send", number: "A-0010", status: "DRAFT" },
    mcpPay: { id: "e2e_inv_a_mcp_pay", number: "A-0011", status: "SENT" },
    mcpVoidDraft: { id: "e2e_inv_a_mcp_void_draft", number: "A-0012", status: "DRAFT" },
    mcpPaid: { id: "e2e_inv_a_mcp_paid", number: "A-0013", status: "PAID" },
    mcpVoided: { id: "e2e_inv_a_mcp_voided", number: "A-0014", status: "VOID" },
    memberTarget: { id: "e2e_inv_a_member_target", number: "A-0015", status: "SENT" },
    memberDraft: { id: "e2e_inv_a_member_draft", number: "A-0016", status: "DRAFT" },
    uiVoid: { id: "e2e_inv_a_ui_void", number: "A-0020", status: "SENT" },
    actionPay: { id: "e2e_inv_a_action_pay", number: "A-0021", status: "SENT" },
    /** Sent, $300: the API payments tests record part payments on it. */
    apiPartial: { id: "e2e_inv_a_api_partial", number: "A-0022", status: "SENT" },
  },
  /** Time entries billed on uiVoid / mcpVoidDraft (released when voided). */
  uiVoidEntries: ["e2e_te_a_ui_void_1", "e2e_te_a_ui_void_2"],
  mcpVoidEntries: ["e2e_te_a_mcp_void_1"],
} as const;

export const B = {
  client: { id: "e2e_client_b", name: "Beta Client", shareToken: "e2e-share-client-b-token" },
  contact: { id: "e2e_contact_b", name: "Bob Contact" },
  project: { id: "e2e_project_b", name: "Beta Project", memberPmId: "e2e_pm_b_member" },
  task: { id: "e2e_task_b", title: "Beta task" },
  milestone: { id: "e2e_milestone_b", name: "Beta milestone" },
  timeEntry: { id: "e2e_te_b" },
  invoice: { id: "e2e_inv_b", number: "B-0001" },
} as const;

/** All share tokens in the seed; none may ever show up in a member's API output. */
export const SHARE_TOKENS = [
  A.client.shareToken,
  A.openProject.shareToken,
  A.secretProject.shareToken,
  B.client.shareToken,
];

export const STORAGE = {
  ownerA: "tests/e2e/.auth/owner-a.json",
  adminA: "tests/e2e/.auth/admin-a.json",
  memberA: "tests/e2e/.auth/member-a.json",
  ownerB: "tests/e2e/.auth/owner-b.json",
  adminD: "tests/e2e/.auth/admin-d.json",
} as const;
