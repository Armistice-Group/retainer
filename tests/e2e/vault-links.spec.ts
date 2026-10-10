// Credential links (pointers to password-manager items): who can add them,
// secrets refused, confidential projects' links hidden from members (API,
// MCP and pages), and never on client-facing share pages.
import { test as base, expect, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { A, B, STORAGE, USERS, VAULT } from "./fixtures";
import { bearer, callAction, expectRefused, json, mcp, mcpOk, sql } from "./helpers";

type Sessions = { owner: APIRequestContext; member: APIRequestContext };

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
});

const ownerA = bearer(USERS.A.OWNER.apiKey);
const memberA = bearer(USERS.A.MEMBER.apiKey);
const ownerB = bearer(USERS.B.OWNER.apiKey);

const FILE = "vault-links.ts";
const GOOD_URL = "https://start.1password.com/open/i?a=E2EACCOUNTCCCCCCCCCCCCCCCC&v=e2evaultcccccccccccccccccc&i=e2eitemcccccccccccccccccccc&h=alpha.1password.com";

async function linksLabelled(label: string) {
  return sql<{ id: string; projectId: string | null; url: string }>(
    `SELECT id, "projectId", url FROM "VaultLink" WHERE label = $1`,
    [label]
  );
}

test.describe("adding links (server actions)", () => {
  test("harness check: an owner can add, and remove, a link", async ({ owner }) => {
    const label = "E2E owner-added link";
    const r = await callAction(owner, FILE, "addVaultLinkAction", [
      A.client.id,
      null,
      { label, url: GOOD_URL, note: "Break-glass only.", itemKind: "login", projectId: A.openProject.id },
    ]);
    expect(r.status, r.body.slice(0, 300)).toBe(200);
    const [row] = await linksLabelled(label);
    expect(row).toMatchObject({ projectId: A.openProject.id, url: GOOD_URL });
    const [{ provider }] = await sql<{ provider: string }>(`SELECT provider FROM "VaultLink" WHERE id = $1`, [row.id]);
    expect(provider).toBe("ONEPASSWORD");

    await callAction(owner, FILE, "deleteVaultLinkAction", [row.id]);
    expect(await linksLabelled(label)).toHaveLength(0);
  });

  test("a member can't add, edit or remove links", async ({ member }) => {
    const label = "E2E member-added link";
    await expectRefused(member, FILE, "addVaultLinkAction", [A.client.id, null, { label, url: GOOD_URL }]);
    expect(await linksLabelled(label)).toHaveLength(0);

    await expectRefused(member, FILE, "updateVaultLinkAction", [
      VAULT.clientWide.id,
      null,
      { label: "Renamed by member", url: GOOD_URL },
    ]);
    await callAction(member, FILE, "deleteVaultLinkAction", [VAULT.clientWide.id]);
    const [row] = await sql<{ label: string }>(`SELECT label FROM "VaultLink" WHERE id = $1`, [VAULT.clientWide.id]);
    expect(row?.label).toBe(VAULT.clientWide.label);
  });

  test("an owner can't add a link to another org's client", async ({ owner }) => {
    const label = "E2E cross-org link";
    await expectRefused(owner, FILE, "addVaultLinkAction", [B.client.id, null, { label, url: GOOD_URL }]);
    expect(await linksLabelled(label)).toHaveLength(0);
    await callAction(owner, FILE, "deleteVaultLinkAction", [VAULT.orgB.id]);
    expect(await sql(`SELECT 1 FROM "VaultLink" WHERE id = $1`, [VAULT.orgB.id])).toHaveLength(1);
  });

  test("secrets are refused, in the link, the label and the note", async ({ owner }) => {
    const cases: { name: string; label: string; url: string; note?: string }[] = [
      { name: "userinfo", label: "E2E secret 1", url: "https://admin:hunter2@vault.example.com/item/1" },
      { name: "token param", label: "E2E secret 2", url: "https://vault.example.com/item/1?access_token=abc123" },
      { name: "1Password share link", label: "E2E secret 3", url: "https://share.1password.com/s#Zm9vYmFyYmF6cXV4" },
      { name: "Bitwarden Send", label: "E2E secret 4", url: "https://send.bitwarden.com/#/abc/def" },
      { name: "not https", label: "E2E secret 5", url: "http://vault.example.com/item/1" },
      { name: "password label", label: "password: hunter2", url: GOOD_URL },
      // AWS's documented example key id, not a real one.
      { name: "AWS key in note", label: "E2E secret 7", url: GOOD_URL, note: "key AKIAIOSFODNN7EXAMPLE" },
      { name: "private key in note", label: "E2E secret 8", url: GOOD_URL, note: "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaA==" },
      { name: "random string in note", label: "E2E secret 9", url: GOOD_URL, note: "Xk9q2LmPz8RtYvWb3NcFh7JdGs5KaQe1" },
    ];
    for (const c of cases) {
      const r = await callAction(owner, FILE, "addVaultLinkAction", [
        A.client.id,
        null,
        { label: c.label, url: c.url, note: c.note ?? "" },
      ]);
      expect(r.status === 200 && /"error":"/.test(r.body), `${c.name} was accepted`).toBe(true);
      expect(await linksLabelled(c.label), c.name).toHaveLength(0);
    }
    const secret = await callAction(owner, FILE, "addVaultLinkAction", [
      A.client.id,
      null,
      { label: "E2E secret 10", url: GOOD_URL, note: "token=abcdef" },
    ]);
    expect(secret.body).toContain("This looks like a secret. Paste the link to the vault item instead.");
  });
});

test.describe("REST API", () => {
  const url = `/api/v1/clients/${A.client.id}/vault-links`;

  test("a member sees client-wide and open-project links, not the confidential project's", async ({ request }) => {
    const body = await json(await request.get(url, { headers: memberA }));
    const labels = body.vaultLinks.map((l: { label: string }) => l.label);
    expect(labels).toContain(VAULT.clientWide.label);
    expect(labels).toContain(VAULT.openProject.label);
    expect(labels).not.toContain(VAULT.secretProject.label);
    expect(JSON.stringify(body)).not.toContain(A.secretProject.id);
  });

  test("a member asking for the confidential project gets 404", async ({ request }) => {
    const res = await request.get(`${url}?projectId=${A.secretProject.id}`, { headers: memberA });
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toContain(VAULT.secretProject.label);
  });

  test("an owner sees every link, and ?projectId narrows to one project", async ({ request }) => {
    const all = await json(await request.get(url, { headers: ownerA }));
    const labels = all.vaultLinks.map((l: { label: string }) => l.label);
    expect(labels).toEqual(expect.arrayContaining([VAULT.clientWide.label, VAULT.openProject.label, VAULT.secretProject.label]));
    const one = await json(await request.get(`${url}?projectId=${A.secretProject.id}`, { headers: ownerA }));
    expect(one.vaultLinks.map((l: { id: string }) => l.id)).toEqual([VAULT.secretProject.id]);
    expect(one.vaultLinks[0]).toMatchObject({ provider: "BITWARDEN", providerName: "Bitwarden", url: VAULT.secretProject.url });
  });

  test("another org's client is not found", async ({ request }) => {
    const res = await request.get(url, { headers: ownerB });
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toContain(VAULT.clientWide.label);
    const own = await request.get(`/api/v1/clients/${B.client.id}/vault-links?projectId=${A.openProject.id}`, {
      headers: ownerB,
    });
    expect(own.status()).toBe(404);
  });

  test("needs an API key", async ({ request }) => {
    const res = await request.get(url);
    expect(res.status()).toBe(401);
  });
});

test.describe("MCP", () => {
  test("list_vault_links follows project visibility", async ({ request }) => {
    const memberLinks = await mcpOk(request, USERS.A.MEMBER.apiKey, "list_vault_links", { clientId: A.client.id });
    const labels = memberLinks.map((l: { label: string }) => l.label);
    expect(labels).toContain(VAULT.clientWide.label);
    expect(labels).not.toContain(VAULT.secretProject.label);

    const denied = await mcp(request, USERS.A.MEMBER.apiKey, "list_vault_links", {
      clientId: A.client.id,
      projectId: A.secretProject.id,
    });
    expect(denied.isError).toBe(true);
    expect(denied.text).not.toContain(VAULT.secretProject.label);

    const ownerLinks = await mcpOk(request, USERS.A.OWNER.apiKey, "list_vault_links", { clientId: A.client.id });
    expect(ownerLinks.map((l: { label: string }) => l.label)).toContain(VAULT.secretProject.label);

    const otherOrg = await mcp(request, USERS.B.OWNER.apiKey, "list_vault_links", { clientId: A.client.id });
    expect(otherOrg.isError).toBe(true);
  });
});

/** The page's Credentials card. */
function credentialsCard(page: Page) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator('[data-slot="card-title"]', { hasText: /^Credentials$/ }) });
}

test.describe("pages", () => {
  test("a member sees the links they may see, with no Add, and not the confidential project's", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE.memberA });
    const page = await context.newPage();
    await page.goto(`/clients/${A.client.id}`);
    const card = credentialsCard(page);
    await expect(card).toContainText(VAULT.clientWide.label);
    await expect(card).toContainText(VAULT.openProject.label);
    await expect(
      card.locator("li", { hasText: VAULT.clientWide.label }).getByRole("link", { name: "Open in 1Password" })
    ).toHaveAttribute("href", VAULT.clientWide.url);
    await expect(card.getByRole("button", { name: "Add" })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(VAULT.secretProject.label);

    await page.goto(`/projects/${A.openProject.id}`);
    await expect(credentialsCard(page)).toContainText(VAULT.openProject.label);
    await expect(page.locator("body")).not.toContainText(VAULT.secretProject.label);

    const res = await page.goto(`/projects/${A.secretProject.id}`);
    expect(res?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText(VAULT.secretProject.label);
    await context.close();
  });

  test("an owner sees the confidential project's link and can add", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE.ownerA });
    const page = await context.newPage();
    await page.goto(`/projects/${A.secretProject.id}`);
    const card = credentialsCard(page);
    await expect(card).toContainText(VAULT.secretProject.label);
    await expect(card).toContainText(VAULT.clientWide.label); // Client-wide links show on projects too.
    const open = card.locator("li", { hasText: VAULT.secretProject.label }).getByRole("link", { name: "Open in Bitwarden" });
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", "noopener noreferrer");
    await expect(card.getByRole("button", { name: "Add" })).toBeVisible();
    await context.close();
  });

  test("links never appear on client-facing share pages", async ({ request }) => {
    const all = [VAULT.clientWide, VAULT.openProject, VAULT.secretProject];
    for (const path of [
      `/share/client/${A.client.shareToken}`,
      `/share/${A.openProject.shareToken}`,
      `/share/${A.secretProject.shareToken}`,
    ]) {
      const res = await request.get(path);
      expect(res.status(), path).toBeLessThan(500);
      const html = await res.text();
      for (const v of all) {
        expect(html, `${v.label} on ${path}`).not.toContain(v.label);
        expect(html, `${v.id} on ${path}`).not.toContain(v.id);
      }
      expect(html).not.toContain("1password.com/open");
      expect(html).not.toContain("vault.bitwarden.com");
    }
  });
});
