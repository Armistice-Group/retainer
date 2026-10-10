"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { EstimateError, respondToEstimate } from "@/lib/services/estimates";
import { estimateResponseSchema } from "@/lib/validations/estimate";

export type EstimateResponseState = { error?: string; status?: string } | null;

/** The client's Accept / Decline on /e/<token>. Public (the token is the
 * credential); the service only moves a SENT, unexpired estimate, once, so
 * double submits and replays don't record twice. */
export async function respondToEstimateAction(
  token: string,
  _prev: EstimateResponseState,
  formData: FormData
): Promise<EstimateResponseState> {
  const parsed = estimateResponseSchema.safeParse({
    decision: formData.get("decision"),
    name: formData.get("name"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const h = await headers();
  try {
    const result = await respondToEstimate(token, parsed.data, {
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent"),
    });
    revalidatePath(`/e/${token}`);
    return { status: result.status };
  } catch (err) {
    if (err instanceof EstimateError) return { error: err.message };
    throw err;
  }
}
