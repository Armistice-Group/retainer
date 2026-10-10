// Newer features over the REST API: payments, estimates and agreements —
// roles, org isolation, confidential projects and bad input.
import { test, expect } from "@playwright/test";
import { A, B, USERS } from "./fixtures";
import { bearer, json, sql } from "./helpers";

const ownerA = bearer(USERS.A.OWNER.apiKey);
const adminA = bearer(USERS.A.ADMIN.apiKey);
const memberA = bearer(USERS.A.MEMBER.apiKey);
const ownerB = bearer(USERS.B.OWNER.apiKey);

test.describe("payments", () => {
  // One test so the steps run in order on the same invoice.
  test("part payments, overpaying and roles", async ({ request }) => {
    const url = `/api/v1/invoices/${A.invoices.apiPartial.id}/payments`;

    const member = await request.post(url, { headers: memberA, data: { amount: 10 } });
    expect(member.status()).toBe(403);
    const otherOrg = await request.post(url, { headers: ownerB, data: { amount: 10 } });
    expect(otherOrg.status()).toBe(404);
    const bad = await request.post(url, { headers: ownerA, data: { amount: -5 } });
    expect(bad.status()).toBe(422);
    const badDate = await request.post(url, { headers: ownerA, data: { amount: 5, receivedAt: "soon" } });
    expect(badDate.status()).toBe(422);

    const first = await request.post(url, { headers: ownerA, data: { amount: 100, method: "Wire" } });
    expect(first.status()).toBeLessThan(300);
    let [row] = await sql(`SELECT status, "amountPaid"::text AS paid FROM "Invoice" WHERE id = $1`, [
      A.invoices.apiPartial.id,
    ]);
    expect(row).toEqual({ status: "SENT", paid: "100.00" });

    const over = await request.post(url, { headers: adminA, data: { amount: 500 } });
    expect(over.status()).toBe(422);

    const rest = await request.post(url, { headers: adminA, data: { amount: 200 } });
    expect(rest.status()).toBeLessThan(300);
    [row] = await sql(`SELECT status, "amountPaid"::text AS paid FROM "Invoice" WHERE id = $1`, [
      A.invoices.apiPartial.id,
    ]);
    expect(row).toEqual({ status: "PAID", paid: "300.00" });

    const ledger = await json(await request.get(url, { headers: ownerA }));
    expect(ledger.payments).toHaveLength(2);
    expect(Number(ledger.balanceDue)).toBe(0);
  });

  test("members can't read payments on a confidential project's invoice", async ({ request }) => {
    const res = await request.get(`/api/v1/invoices/${A.invoices.secret.id}/payments`, { headers: memberA });
    expect(res.status()).toBe(404);
  });

  test("invoices list carries the balance", async ({ request }) => {
    const { invoices } = await json(await request.get("/api/v1/invoices", { headers: ownerA }));
    const paid = invoices.find((i: { id: string }) => i.id === A.invoices.mcpPaid.id);
    expect(Number(paid.balanceDue)).toBe(0);
  });
});

test.describe("estimates", () => {
  const estimate = {
    clientId: A.client.id,
    title: "Discovery phase",
    lineItems: [{ description: "Workshops", quantity: 2, rate: 1500 }],
  };

  test("members can't create estimates", async ({ request }) => {
    const res = await request.post("/api/v1/estimates", { headers: memberA, data: estimate });
    expect(res.status()).toBe(403);
  });

  test("bad input gets 422", async ({ request }) => {
    const res = await request.post("/api/v1/estimates", {
      headers: ownerA,
      data: { ...estimate, lineItems: [], expiresAt: "tomorrow" },
    });
    expect(res.status()).toBe(422);
  });

  test("another org's client is refused", async ({ request }) => {
    const res = await request.post("/api/v1/estimates", { headers: ownerA, data: { ...estimate, clientId: B.client.id } });
    expect([404, 422]).toContain(res.status());
  });

  test("an owner creates one; it never exposes the client link token", async ({ request }) => {
    const res = await request.post("/api/v1/estimates", { headers: ownerA, data: estimate });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.estimate.number).toMatch(/^EST-\d{4}$/);
    expect(Number(body.estimate.total)).toBe(3000);
    expect(JSON.stringify(body)).not.toContain("viewToken");

    const forB = await json(await request.get("/api/v1/estimates", { headers: ownerB }));
    expect(forB.estimates.map((e: { id: string }) => e.id)).not.toContain(body.estimate.id);
    const [stored] = await sql(`SELECT "viewToken" FROM "Estimate" WHERE id = $1`, [body.estimate.id]);
    const list = await (await request.get("/api/v1/estimates", { headers: memberA })).text();
    if (stored?.viewToken) expect(list).not.toContain(stored.viewToken);
  });
});

test.describe("agreements", () => {
  test("another org's client agreements are not found", async ({ request }) => {
    const res = await request.get(`/api/v1/clients/${B.client.id}/agreements`, { headers: ownerA });
    expect(res.status()).toBe(404);
  });

  test("a client's agreements list loads for a member", async ({ request }) => {
    const res = await request.get(`/api/v1/clients/${A.client.id}/agreements`, { headers: memberA });
    expect(res.status()).toBe(200);
  });
});
