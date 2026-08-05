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

/**
 * Best-effort push of a contact-form submission into Attio as a Person
 * (and Company, if given). Never throws — a CRM sync failure must never
 * block the contact form from succeeding for the person submitting it.
 */
export async function syncAttioContact({
  name,
  email,
  company,
}: {
  name: string;
  email: string;
  company: string | null;
}) {
  if (!isAttioConfigured()) return;

  // Isolated from the person upsert below — company matching on "name"
  // (rather than the "domains" attribute the signup sync uses) is less
  // certain to be configured as a unique/matchable attribute in Attio, and
  // a failure here shouldn't also drop the person record.
  let companyRecordId: string | null = null;
  if (company) {
    try {
      const companyRecord = await attioUpsert("companies", "name", {
        name: [{ value: company }],
      });
      companyRecordId = companyRecord.data?.id?.record_id ?? null;
    } catch (err) {
      console.warn("[attio] Failed to sync contact form company", err);
    }
  }

  try {
    await attioUpsert("people", "email_addresses", {
      email_addresses: [{ email_address: email }],
      name: [splitName(name)],
      ...(companyRecordId
        ? { company: [{ target_object: "companies", target_record_id: companyRecordId }] }
        : {}),
    });
  } catch (err) {
    console.warn("[attio] Failed to sync contact form person", err);
  }
}
