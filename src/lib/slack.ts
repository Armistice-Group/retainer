import "server-only";
import { postPublicJson } from "@/lib/safe-fetch";

/** Best-effort post to an org's Slack incoming webhook. The URL is
 * user-supplied, so it goes through safe-fetch (no private/internal hosts
 * unless ALLOW_PRIVATE_FETCH=true) with a short timeout; failures are logged,
 * never thrown. */
export async function postToSlack(webhookUrl: string | null | undefined, text: string) {
  if (!webhookUrl) return;

  try {
    await postPublicJson(webhookUrl, { text }, { timeoutMs: 5_000 });
  } catch (err) {
    console.warn("Failed to post to Slack webhook:", err instanceof Error ? err.message : err);
  }
}
