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

/** Org E: client share-link email verification and expiry
 * (share-gate.spec.ts). No members — everything is reached through share
 * links, so nothing here shows up in other orgs' tests. */
export const E = {
  org: { id: "e2e_org_e", name: "E2E Org Gate", prefix: "E" },
  /** Requires email verification (client override ON). */
  gated: { id: "e2e_client_e_gated", name: "Gamma Gated Client", shareToken: "e2e-share-client-e-gated" },
  gatedProject: { id: "e2e_project_e_gated", name: "Gamma Gated Project", shareToken: "e2e-share-project-e-gated" },
  /** Sent, on the gated project. */
  invoice: { id: "e2e_inv_e_gated", number: "E-0001", viewToken: "e2e-view-inv-e-gated" },
  /** Uploaded, shared with the client. */
  document: { id: "e2e_doc_e_gated", fileName: "gamma-brief.txt" },
  contacts: {
    /** Goes through the code form. */
    code: { id: "e2e_contact_e_code", name: "Cora Code", email: "cora@gamma.test" },
    /** Runs out of code attempts. */
    attempts: { id: "e2e_contact_e_attempts", name: "Ada Attempts", email: "ada@gamma.test" },
    /** Gets a session; their email is then changed. */
    renamed: { id: "e2e_contact_e_renamed", name: "Rene Renamed", email: "rene@gamma.test" },
    /** Gets a session; then deleted. */
    removed: { id: "e2e_contact_e_removed", name: "Rita Removed", email: "rita@gamma.test" },
  },
  /** Client and project links whose expiry has passed. */
  expired: { id: "e2e_client_e_expired", name: "Delta Expired Client", shareToken: "e2e-share-client-e-expired" },
  expiredProject: { id: "e2e_project_e_expired", name: "Delta Expired Project", shareToken: "e2e-share-project-e-expired" },
} as const;

/** All share tokens in the seed; none may ever show up in a member's API output. */
export const SHARE_TOKENS = [
  A.client.shareToken,
  A.openProject.shareToken,
  A.secretProject.shareToken,
  B.client.shareToken,
  E.gated.shareToken,
  E.gatedProject.shareToken,
  E.expired.shareToken,
  E.expiredProject.shareToken,
];

export const STORAGE = {
  ownerA: "tests/e2e/.auth/owner-a.json",
  adminA: "tests/e2e/.auth/admin-a.json",
  memberA: "tests/e2e/.auth/member-a.json",
  ownerB: "tests/e2e/.auth/owner-b.json",
  adminD: "tests/e2e/.auth/admin-d.json",
} as const;

/** Credential links (pointers to password-manager items; no secrets). */
export const VAULT = {
  /** Client-wide, on Alpha Client: everyone in org A sees it. */
  clientWide: {
    id: "e2e_vault_a_client",
    label: "Alpha AWS root",
    url: "https://start.1password.com/open/i?a=E2EACCOUNTAAAAAAAAAAAAAAAA&v=e2evaultaaaaaaaaaaaaaaaaaa&i=e2eitemclientaaaaaaaaaaaaa&h=alpha.1password.com",
  },
  /** On the open project: every member of org A sees it. */
  openProject: {
    id: "e2e_vault_a_open",
    label: "Alpha staging database",
    url: "https://vault.bitwarden.com/#/vault?itemId=0b6c1f0e-1d0a-4c4e-9f5e-e2e000000001",
  },
  /** On the confidential project: owner/admin only (the member isn't on it). */
  secretProject: {
    id: "e2e_vault_a_secret",
    label: "Alpha confidential deploy key",
    url: "https://vault.bitwarden.com/#/vault?itemId=0b6c1f0e-1d0a-4c4e-9f5e-e2e000000002",
  },
  /** Org B's client. */
  orgB: {
    id: "e2e_vault_b_client",
    label: "Beta registrar login",
    url: "https://start.1password.com/open/i?a=E2EACCOUNTBBBBBBBBBBBBBBBB&v=e2evaultbbbbbbbbbbbbbbbbbb&i=e2eitembbbbbbbbbbbbbbbbbbb&h=beta.1password.com",
  },
} as const;

/** Due dates, deliverables and the calendar feed (schedule.spec.ts). Days
 * are counted from the day the seed runs. */
export const SCHEDULE = {
  /** Due dates set on A.openTask (the member's) and A.secretTask (the owner's). */
  openTaskDueIn: 2,
  secretTaskDueIn: 3,
  /** Billable, on the confidential project. */
  secretMilestone: { id: "e2e_milestone_a_secret", name: "Alpha secret milestone", dueIn: 4 },
  /** Not billable and already complete, on the confidential project (so the
   * open project keeps exactly one milestone): never offered for invoicing. */
  deliverable: { id: "e2e_deliverable_a", name: "Alpha secret deliverable", dueIn: 5 },
  /** Member A's calendar subscription token (only its hash is stored). */
  memberFeedToken: "e2e-calendar-feed-member-a-0123456789abcdef",
} as const;

/** Must match INTEGRATION_ENCRYPTION_KEY in playwright.config.ts: the seed
 * encrypts the scheduling secrets below with it, and the server decrypts. */
export const E2E_ENCRYPTION_KEY =
  process.env.INTEGRATION_ENCRYPTION_KEY ?? "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";

/** Cal.com / Calendly intake (booking.spec.ts). Org A. */
export const BOOKING = {
  calcom: {
    id: "e2e_sched_calcom_a",
    /** Path token in /api/webhooks/scheduling/calcom/<token>. */
    token: "e2e-calcom-hook-token-a-0123456789abcdef",
    secret: "e2e-calcom-signing-secret-a",
  },
  calendly: {
    id: "e2e_sched_calendly_a",
    token: "e2e-calendly-hook-token-a-0123456789abcdef",
    secret: "e2e-calendly-signing-key-a",
  },
  /** A Cal.com event type mapped to Ignore. */
  ignoredEventType: { id: "e2e_sched_type_ignored", externalId: "9999", name: "Internal sync" },
  /** A contact with an email on Alpha Client: their bookings attach there. */
  knownContact: { id: "e2e_contact_a_known", name: "Kim Known", email: "kim.known@alpha-client.test" },
  /** A seeded draft client (status LEAD) with an upcoming booking hosted by
   * owner A. Members try to make it a client, merge or discard it. */
  draft: { id: "e2e_client_a_draft", name: "Delta Draft Co", email: "dana@delta-draft.test" },
  draftContact: { id: "e2e_contact_a_draft", name: "Dana Draft" },
  draftBooking: { id: "e2e_booking_a_draft", title: "Intro call with Dana Draft", inDays: 3 },
  /** Owner A's calendar feed, with one meeting that hasn't happened yet. */
  feed: { id: "e2e_feed_owner_a" },
  upcomingMeeting: { id: "e2e_meeting_owner_a_upcoming", title: "E2E upcoming kickoff", inDays: 2 },
} as const;
