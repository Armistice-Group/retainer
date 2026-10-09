// @mentions in task comments are stored inline as `@[Name](user:<id>)` —
// the name keeps the text readable anywhere it's shown raw (Linear, the API),
// the id is what notifications go to.
const MENTION_RE = /@\[([^\]\n]{1,100})\]\(user:([A-Za-z0-9_-]{1,64})\)/g;

export function mentionToken(user: { id: string; name: string }) {
  return `@[${user.name.replace(/[\][\n]/g, "")}](user:${user.id})`;
}

export function mentionedUserIds(body: string) {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[2]))];
}

/** The body with mentions as plain "@Name", for places that can't render them. */
export function mentionsToPlain(body: string) {
  return body.replace(MENTION_RE, (_, name: string) => `@${name}`);
}

export type BodySegment = { text: string } | { mention: string; userId: string };

export function splitMentions(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index > last) segments.push({ text: body.slice(last, m.index) });
    segments.push({ mention: m[1], userId: m[2] });
    last = m.index + m[0].length;
  }
  if (last < body.length) segments.push({ text: body.slice(last) });
  return segments;
}
