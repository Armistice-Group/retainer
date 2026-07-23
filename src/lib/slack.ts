import "server-only";

export async function postToSlack(webhookUrl: string | null | undefined, text: string) {
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.warn(`Slack webhook responded with ${res.status}`);
    }
  } catch (err) {
    console.warn("Failed to post to Slack webhook", err);
  }
}
