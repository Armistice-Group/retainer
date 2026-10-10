// React shims for the Mintlify components used in docs/*.mdx. Each renders
// plain, static HTML; the little interactivity there is (code group tabs) is
// handled by assets/docs.js. Add a shim here when a page starts using a new
// Mintlify component — the build fails with "Expected component X to be
// defined" until you do.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import React from "react";

const h = React.createElement;
const require = createRequire(import.meta.url);
const iconDir = path.join(path.dirname(require.resolve("lucide-static/package.json")), "icons");
const iconCache = new Map();

// Inline SVG for a Lucide icon name (Mintlify's default icon set).
export function iconSvg(name) {
  if (!name) return "";
  if (!iconCache.has(name)) {
    const file = path.join(iconDir, `${name}.svg`);
    let svg = "";
    if (fs.existsSync(file)) {
      svg = fs
        .readFileSync(file, "utf8")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\s*\n\s*/g, " ")
        .replace(/ width="24" height="24"/, ' width="1em" height="1em" aria-hidden="true"')
        .trim();
    } else {
      console.warn(`warning: unknown icon "${name}" (not in lucide-static)`);
    }
    iconCache.set(name, svg);
  }
  return iconCache.get(name);
}

export function Icon({ icon, className = "icon" }) {
  const svg = iconSvg(icon);
  if (!svg) return null;
  return h("span", { className, dangerouslySetInnerHTML: { __html: svg } });
}

export function makeComponents({ link }) {
  const callout = (kind, icon) =>
    function Callout({ children, title }) {
      return h(
        "div",
        { className: `callout callout-${kind}` },
        h(Icon, { icon, className: "callout-icon" }),
        h("div", { className: "callout-body" }, title ? h("p", { className: "callout-title" }, title) : null, children)
      );
    };

  const A = ({ href, children, ...rest }) => {
    const external = /^https?:\/\//.test(href || "");
    return h(
      "a",
      { ...rest, href: link(href), ...(external ? { rel: "noopener" } : {}) },
      children
    );
  };

  const Img = ({ src, alt, ...rest }) => h("img", { ...rest, src: link(src), alt: alt || "", loading: "lazy" });

  // Code blocks: shiki adds data-title from the fence's meta (```text Caddyfile).
  const Pre = ({ children, ...rest }) => {
    const title = rest["data-title"];
    const pre = h("pre", rest, children);
    return h(
      "div",
      { className: "code-block", "data-title": title || undefined },
      title ? h("div", { className: "code-title" }, title) : null,
      pre,
      h("button", { type: "button", className: "copy", "aria-label": "Copy code" }, "Copy")
    );
  };

  const Card = ({ title, icon, href, children }) =>
    h(
      href ? "a" : "div",
      { className: "card", ...(href ? { href: link(href) } : {}) },
      icon ? h(Icon, { icon, className: "card-icon" }) : null,
      h("span", { className: "card-title" }, title),
      children ? h("span", { className: "card-body" }, children) : null
    );

  const CardGroup = ({ cols = 2, children }) =>
    h("div", { className: "card-group", style: { "--cols": cols } }, children);

  const Steps = ({ children }) => h("ol", { className: "steps" }, children);
  const Step = ({ title, children }) =>
    h(
      "li",
      { className: "step" },
      h("p", { className: "step-title" }, title),
      children ? h("div", { className: "step-body" }, children) : null
    );

  const Accordion = ({ title, children, defaultOpen }) =>
    h(
      "details",
      { className: "accordion", open: defaultOpen || undefined },
      h("summary", null, title),
      h("div", { className: "accordion-body" }, children)
    );
  const AccordionGroup = ({ children }) => h("div", { className: "accordion-group" }, children);

  const field = (kinds) =>
    function Field(props) {
      const kind = kinds.find((k) => props[k] !== undefined);
      const name = kind ? props[kind] : props.name;
      return h(
        "div",
        { className: "param" },
        h(
          "div",
          { className: "param-head" },
          h("code", { className: "param-name" }, name),
          props.type ? h("span", { className: "param-type" }, props.type) : null,
          kind && kind !== "name" && kind !== "body" ? h("span", { className: "param-in" }, kind) : null,
          props.required ? h("span", { className: "param-required" }, "required") : null,
          props.default !== undefined
            ? h("span", { className: "param-default" }, "default: ", h("code", null, String(props.default)))
            : null
        ),
        props.children ? h("div", { className: "param-body" }, props.children) : null
      );
    };

  // Tabbed code blocks. Tab labels come from each block's title.
  const CodeGroup = ({ children }) => {
    const blocks = React.Children.toArray(children).filter(Boolean);
    return h(
      "div",
      { className: "code-group" },
      h(
        "div",
        { className: "code-tabs", role: "tablist" },
        blocks.map((b, i) =>
          h(
            "button",
            { key: i, type: "button", role: "tab", "aria-selected": i === 0 ? "true" : "false" },
            b.props?.["data-title"] || b.props?.title || `Tab ${i + 1}`
          )
        )
      ),
      blocks.map((b, i) => h("div", { key: i, className: "code-panel", hidden: i === 0 ? undefined : true }, b))
    );
  };

  const Tabs = ({ children }) => {
    const tabs = React.Children.toArray(children).filter(Boolean);
    return h(
      "div",
      { className: "tabs" },
      h(
        "div",
        { className: "code-tabs", role: "tablist" },
        tabs.map((t, i) =>
          h("button", { key: i, type: "button", role: "tab", "aria-selected": i === 0 ? "true" : "false" }, t.props.title)
        )
      ),
      tabs.map((t, i) => h("div", { key: i, className: "code-panel", hidden: i === 0 ? undefined : true }, t.props.children))
    );
  };
  const Tab = ({ children }) => h(React.Fragment, null, children);

  const Frame = ({ children, caption }) =>
    h("figure", { className: "frame" }, children, caption ? h("figcaption", null, caption) : null);

  return {
    a: A,
    img: Img,
    pre: Pre,
    Note: callout("note", "info"),
    Info: callout("note", "info"),
    Tip: callout("tip", "lightbulb"),
    Check: callout("check", "circle-check"),
    Warning: callout("warning", "triangle-alert"),
    Card,
    CardGroup,
    Columns: CardGroup,
    Steps,
    Step,
    Accordion,
    AccordionGroup,
    ParamField: field(["path", "query", "body", "header", "name"]),
    ResponseField: field(["name"]),
    Expandable: ({ children, title }) => h(Accordion, { title: title || "Show properties" }, children),
    CodeGroup,
    Tabs,
    Tab,
    Frame,
    Icon: ({ icon }) => h(Icon, { icon }),
  };
}
