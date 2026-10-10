// Builds docs/ (Mintlify MDX, the single source of truth) into a static site
// in docs-site/dist, served at https://consultainer.app/docs/.
//
//   cd docs-site && npm ci && npm run build   # then: npm run serve
//
// Navigation comes from docs/docs.json; Mintlify components are shimmed in
// components.mjs. The build fails on MDX errors, unknown components and broken
// internal links or anchors. Search is Pagefind (run by `npm run build`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as runtime from "react/jsx-runtime";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { evaluate } from "@mdx-js/mdx";
import matter from "gray-matter";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeShiki from "@shikijs/rehype";
import { makeComponents, iconSvg } from "./components.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(here, "../docs");
const OUT = path.resolve(here, "dist");
// Path the site is served under. "/docs/" on consultainer.app.
const BASE = (process.env.DOCS_BASE || "/docs/").replace(/\/?$/, "/");
const SITE = process.env.DOCS_SITE_URL || "https://consultainer.app";
const REPO = "https://github.com/Armistice-Group/retainer";

const config = JSON.parse(fs.readFileSync(path.join(DOCS, "docs.json"), "utf8"));

// ── Navigation ───────────────────────────────────────────────────────────────
const tabs = config.navigation.tabs.map((t) => ({
  name: t.tab,
  groups: t.groups.map((g) => ({ name: g.group, pages: g.pages.filter((p) => typeof p === "string") })),
}));
const order = tabs.flatMap((t, ti) => t.groups.flatMap((g) => g.pages.map((slug) => ({ slug, tab: ti }))));
const pages = new Map(); // slug -> { title, description, sidebarTitle, source }
for (const { slug } of order) {
  const file = path.join(DOCS, `${slug}.mdx`);
  if (!fs.existsSync(file)) throw new Error(`docs.json lists "${slug}" but ${file} doesn't exist`);
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  pages.set(slug, { title: data.title || slug, sidebarTitle: data.sidebarTitle, description: data.description || "", content });
}
for (const f of walk(DOCS).filter((f) => f.endsWith(".mdx"))) {
  const slug = path.relative(DOCS, f).replace(/\.mdx$/, "").split(path.sep).join("/");
  if (!pages.has(slug)) console.warn(`warning: ${slug}.mdx isn't in docs.json navigation, so it isn't published`);
}

// Internal link rewriting: "/self-hosting#email" -> "/docs/self-hosting/#email".
function link(href) {
  if (!href || /^(https?:|mailto:|#|data:)/.test(href)) return href;
  if (!href.startsWith("/")) return href;
  const [p, hash] = href.split("#");
  const clean = p.replace(/^\/+|\/+$/g, "");
  const isAsset = /\.[a-z0-9]+$/i.test(clean);
  const url = clean === "" ? BASE : isAsset ? BASE + clean : `${BASE}${clean}/`;
  return hash !== undefined ? `${url}#${hash}` : url;
}

// ── Render ───────────────────────────────────────────────────────────────────
const components = makeComponents({ link });
const shikiTitle = {
  name: "code-title",
  pre(node) {
    const meta = (this.options.meta?.__raw || "").trim();
    if (meta) node.properties.dataTitle = meta.replace(/\s*\{.*\}\s*$/, "");
  },
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const css = fs.readFileSync(path.join(here, "assets/docs.css"), "utf8");
const js = fs.readFileSync(path.join(here, "assets/docs.js"), "utf8");
const hash = shortHash(css + js);
fs.mkdirSync(path.join(OUT, "_assets"), { recursive: true });
fs.writeFileSync(path.join(OUT, `_assets/docs.${hash}.css`), css);
fs.writeFileSync(path.join(OUT, `_assets/docs.${hash}.js`), js);

// Static files from docs/ (logos, screenshots, any images a page uses).
for (const f of walk(DOCS)) {
  if (/\.(png|jpe?g|gif|svg|webp|avif|mp4|webm)$/i.test(f)) {
    const dest = path.join(OUT, path.relative(DOCS, f));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f, dest);
  }
}

let failed = false;
for (const [i, { slug, tab }] of order.entries()) {
  const page = pages.get(slug);
  let body;
  try {
    const mod = await evaluate(page.content, {
      ...runtime,
      baseUrl: pathToFileURL(path.join(DOCS, `${slug}.mdx`)),
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        rehypeSlug,
        [
          rehypeShiki,
          {
            themes: { light: "github-light", dark: "github-dark" },
            defaultColor: false,
            fallbackLanguage: "text",
            transformers: [shikiTitle],
          },
        ],
      ],
    });
    body = renderToStaticMarkup(React.createElement(mod.default, { components }));
  } catch (err) {
    console.error(`error in docs/${slug}.mdx: ${err.message}`);
    failed = true;
    continue;
  }
  const prev = order[i - 1] && order[i - 1].tab === tab ? order[i - 1].slug : null;
  const next = order[i + 1] && order[i + 1].tab === tab ? order[i + 1].slug : null;
  const html = layout({ slug, tab, page, body, prev, next });
  const dest = path.join(OUT, slug, "index.html");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}
if (failed) process.exit(1);

// /docs/ itself opens the first page.
const first = link(`/${order[0].slug}`);
fs.writeFileSync(
  path.join(OUT, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Consultainer docs</title><meta http-equiv="refresh" content="0; url=${first}"><link rel="canonical" href="${SITE}${first}"><a href="${first}">Consultainer docs</a>\n`
);

checkLinks();
console.log(`built ${order.length} pages into ${path.relative(process.cwd(), OUT) || "."} (base ${BASE})`);

// ── Layout ───────────────────────────────────────────────────────────────────
function layout({ slug, tab, page, body, prev, next }) {
  const url = link(`/${slug}`);
  const tabLinks = tabs
    .map((t, i) => {
      const firstSlug = t.groups[0].pages[0];
      return `<a href="${link(`/${firstSlug}`)}"${i === tab ? ' aria-current="true"' : ""}>${esc(t.name)}</a>`;
    })
    .join("");
  const sidebar = tabs[tab].groups
    .map(
      (g) =>
        `<div class="nav-group"><p>${esc(g.name)}</p><ul>${g.pages
          .map((p) => {
            const pg = pages.get(p);
            return `<li><a href="${link(`/${p}`)}"${p === slug ? ' aria-current="page"' : ""}>${esc(pg.sidebarTitle || pg.title)}</a></li>`;
          })
          .join("")}</ul></div>`
    )
    .join("");
  const toc = [...body.matchAll(/<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)]
    .map(([, level, id, text]) => `<li class="toc-${level}"><a href="#${id}">${text.replace(/<[^>]+>/g, "")}</a></li>`)
    .join("");
  const pager = (s, label, cls) =>
    s ? `<a class="${cls}" href="${link(`/${s}`)}"><span>${label}</span>${esc(pages.get(s).title)}</a>` : "<span></span>";
  const title = `${page.title} · Consultainer docs`;
  const navbar = config.navbar?.links || [];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:image" content="${SITE}/screenshots/dashboard-dark.png">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script>try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="stylesheet" href="${BASE}_assets/docs.${hash}.css">
<link rel="stylesheet" href="${BASE}pagefind/pagefind-ui.css">
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <button type="button" class="icon-btn menu-btn" aria-label="Menu" aria-expanded="false">${iconSvg("menu")}</button>
    <a class="mark" href="/">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" class="tile"/><circle cx="12" cy="12" r="6.6" fill="none" stroke-width="1.9" class="face"/><path d="M12 12V8.4" stroke-width="1.9" stroke-linecap="round" class="face"/><path d="M12 12l2.9 1.7" stroke-width="1.9" stroke-linecap="round" class="hand"/></svg>
      Consultainer <span class="mark-sub">Docs</span>
    </a>
    <nav class="tabs-nav" aria-label="Sections">${tabLinks}</nav>
    <button type="button" class="search-btn" aria-label="Search the docs">${iconSvg("search")}<span>Search</span><kbd>/</kbd></button>
    <div class="topbar-links">
      ${navbar.map((l) => `<a href="${esc(l.href)}" rel="noopener">${esc(l.label)}</a>`).join("")}
      <button type="button" class="icon-btn theme-btn" aria-label="Toggle dark mode"><span class="sun">${iconSvg("sun")}</span><span class="moon">${iconSvg("moon")}</span></button>
    </div>
  </div>
</header>
<div class="shell">
  <aside class="sidebar" aria-label="Pages">
    <nav class="tabs-nav tabs-nav-mobile" aria-label="Sections">${tabLinks}</nav>
    ${sidebar}
  </aside>
  <main class="content">
    <article data-pagefind-body>
      <p class="eyebrow" data-pagefind-ignore>${esc(groupOf(slug))}</p>
      <h1>${esc(page.title)}</h1>
      ${page.description ? `<p class="lede">${esc(page.description)}</p>` : ""}
      <div class="prose">${body}</div>
    </article>
    <nav class="pager" aria-label="Previous and next page">${pager(prev, "Previous", "prev")}${pager(next, "Next", "next")}</nav>
    <footer class="page-foot">
      <a href="${REPO}/edit/main/docs/${slug}.mdx" rel="noopener">Edit this page on GitHub</a>
      <span>Consultainer is open source under the Apache 2.0 license.</span>
    </footer>
  </main>
  <aside class="toc" aria-label="On this page">${toc ? `<p>On this page</p><ul>${toc}</ul>` : ""}</aside>
</div>
<dialog class="search-dialog" aria-label="Search"><div id="search"></div></dialog>
<script src="${BASE}pagefind/pagefind-ui.js"></script>
<script src="${BASE}_assets/docs.${hash}.js"></script>
</body>
</html>
`;
}

function groupOf(slug) {
  for (const t of tabs) for (const g of t.groups) if (g.pages.includes(slug)) return g.name;
  return "";
}

// ── Link check ───────────────────────────────────────────────────────────────
// Every href/src under BASE must point at a built file, and every #anchor at
// an id on that page.
function checkLinks() {
  const htmlFiles = walk(OUT).filter((f) => f.endsWith(".html"));
  const ids = new Map();
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, "utf8");
    ids.set(f, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  const broken = [];
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, "utf8");
    const page = "/" + path.relative(OUT, f).split(path.sep).join("/");
    for (const [, attr, raw] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
      const value = raw.replace(/&amp;/g, "&");
      if (/^(https?:|mailto:|data:)/.test(value) || value === "/" || value === "/icon.svg") continue;
      if (value.startsWith(`${BASE}pagefind/`)) continue; // generated after this check
      let target = f;
      let anchor = null;
      if (value.startsWith("#")) anchor = decodeURIComponent(value.slice(1));
      else if (value.startsWith(BASE)) {
        const [p, h] = value.slice(BASE.length).split("#");
        anchor = h !== undefined ? decodeURIComponent(h) : null;
        target = path.join(OUT, p);
        if (p === "" || p.endsWith("/")) target = path.join(target, "index.html");
        if (!fs.existsSync(target)) {
          broken.push(`${page}: ${attr}="${raw}" (no such page or file)`);
          continue;
        }
      } else {
        broken.push(`${page}: ${attr}="${raw}" (not under ${BASE})`);
        continue;
      }
      if (anchor && target.endsWith(".html") && !ids.get(target)?.has(anchor)) {
        broken.push(`${page}: ${attr}="${raw}" (no #${anchor} on that page)`);
      }
    }
  }
  if (broken.length) {
    console.error(`broken links:\n  ${[...new Set(broken)].join("\n  ")}`);
    process.exit(1);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    return e.isDirectory() ? walk(p) : [p];
  });
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function shortHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
