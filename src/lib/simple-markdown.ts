// A deliberately small markdown subset for estimate scope text: headings
// (#, ##, ###), bullet and numbered lists, paragraphs, **bold**, *italic*
// and [links](https://…). It produces plain data, rendered as React elements
// (web) or react-pdf nodes (PDF), never as HTML, so nothing a user types can
// inject markup or script. Plain text without any markdown renders as
// paragraphs.

export type Inline = { text: string; bold?: boolean; italic?: boolean; href?: string };
export type Block =
  | { type: "heading"; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "paragraph"; lines: Inline[][] };

/** Only web and mail links; anything else (javascript:, data:, …) renders
 * as its text. */
export function safeHref(url: string): string | undefined {
  const trimmed = url.trim();
  if (/^https?:\/\/[^\s]+$/i.test(trimmed) || /^mailto:[^\s]+$/i.test(trimmed)) return trimmed;
  return undefined;
}

const INLINE_RE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ text: text.slice(last, index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) out.push({ text: m[2], italic: true });
    else if (m[3] !== undefined) out.push({ text: m[3], italic: true });
    else if (m[4] !== undefined) {
      const href = safeHref(m[5] ?? "");
      out.push(href ? { text: m[4], href } : { text: `${m[4]} (${m[5]})` });
    }
    last = index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function parseSimpleMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: Inline[][] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph });
    if (list) blocks.push({ type: "list", ...list });
    paragraph = [];
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        inlines: parseInline(heading[2]),
      });
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (paragraph.length || (list && list.ordered !== ordered)) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push(parseInline((bullet ?? numbered)![1]));
      continue;
    }
    if (list) flush();
    paragraph.push(parseInline(line.trim()));
  }
  flush();
  return blocks;
}

/** Plain text of a run of inlines (for the PDF, links get their URL). */
export function inlineText(inlines: Inline[], withUrls = false) {
  return inlines
    .map((i) => (withUrls && i.href && i.href !== i.text ? `${i.text} (${i.href})` : i.text))
    .join("");
}
