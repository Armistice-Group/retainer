import "server-only";

const ATTIO_API_BASE = "https://api.attio.com/v2";

export function isAttioConfigured() {
  return !!process.env.ATTIO_API_KEY;
}

async function attioUpsert(objectSlug: string, matchingAttribute: string, values: unknown) {
  const res = await fetch(
    `${ATTIO_API_BASE}/objects/${objectSlug}/records?matching_attribute=${matchingAttribute}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.ATTIO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { values } }),
    }
  );
  if (!res.ok) {
    throw new Error(`Attio ${objectSlug} upsert failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ data?: { id?: { record_id?: string } } }>;
}

function splitName(fullName: string) {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { first_name: trimmed, last_name: "", full_name: trimmed };
  return {
    first_name: trimmed.slice(0, spaceIndex),
    last_name: trimmed.slice(spaceIndex + 1),
    full_name: trimmed,
  };
}

/**
 * Best-effort push of a new org signup into Attio as a Company + Person.
 * Never throws — a CRM sync failure must never block or break signup.
 */
export async function syncAttioSignup({
  orgName,
  orgDomain,
  userName,
  userEmail,
}: {
  orgName: string;
  orgDomain: string | null;
  userName: string;
  userEmail: string;
}) {
  if (!isAttioConfigured()) return;

  try {
    let companyRecordId: string | null = null;

    if (orgDomain) {
      const company = await attioUpsert("companies", "domains", {
        domains: [{ domain: orgDomain }],
        name: [{ value: orgName }],
      });
      companyRecordId = company.data?.id?.record_id ?? null;
    }

    await attioUpsert("people", "email_addresses", {
      email_addresses: [{ email_address: userEmail }],
      name: [splitName(userName)],
      ...(companyRecordId
        ? { company: [{ target_object: "companies", target_record_id: companyRecordId }] }
        : {}),
    });
  } catch (err) {
    console.warn("[attio] Failed to sync signup", err);
  }
}
