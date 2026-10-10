import { Fragment } from "react";
import { parseSimpleMarkdown, type Inline } from "@/lib/simple-markdown";
import { cn } from "@/lib/utils";

function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((part, i) => {
        let node: React.ReactNode = part.text;
        if (part.bold) node = <strong className="font-semibold">{node}</strong>;
        if (part.italic) node = <em>{node}</em>;
        if (part.href) {
          node = (
            <a
              href={part.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-brand underline underline-offset-2"
            >
              {node}
            </a>
          );
        }
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

/** An estimate's scope/intro text: light markdown rendered as React
 * elements (never raw HTML). */
export function ScopeText({ text, className }: { text: string; className?: string }) {
  const blocks = parseSimpleMarkdown(text);
  return (
    <div className={cn("flex flex-col gap-3 text-sm leading-relaxed", className)}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          const size =
            block.level === 1 ? "text-lg" : block.level === 2 ? "text-base" : "text-sm";
          return (
            <p key={i} className={cn("mt-1 font-semibold", size)}>
              <Inlines inlines={block.inlines} />
            </p>
          );
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={i} className={cn("flex flex-col gap-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inlines inlines={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                <Inlines inlines={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
