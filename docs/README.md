# Consultainer docs

Source for [Mintlify](https://mintlify.com) docs. This folder is meant to be
usable standalone — if it gets split into its own repo later, just copy the
whole `docs/` directory over.

## Preview locally

```bash
npm install -g mint
cd docs
mint dev
```

Opens at `http://localhost:3000` (a different port if the app is also
running locally).

Or preview exactly what's published at consultainer.app/docs (see
[Deploying](#deploying)):

```bash
cd docs-site
npm ci
npm run build    # fails on MDX errors and broken internal links
npm run serve    # http://localhost:4321/docs/
```

## Structure

- `docs.json` — Mintlify config: nav, theme, colors, logo. A new page only
  shows up once it's added to the `navigation` here.
- `logo/` — **placeholder SVGs** (a plain text wordmark and a purple "C").
  Swap these for real brand assets before this goes live anywhere public.
- `introduction.mdx`, `quickstart.mdx`, `self-hosting.mdx` — getting started:
  what it is, the first hour, and installing/running/administering an
  instance.
- `concepts/` — how clients and projects, tasks, time, milestones, expenses,
  invoicing, reports, alerts and the audit log, and team & security (roles,
  SSO, 2FA, API keys) work.
- `integrations/` — documents & files, Linear, calendars, payments (Stripe,
  Mercury), QuickBooks.
- `mcp-server.mdx` — connecting an AI agent via MCP.
- `api-reference/` — the REST API (`/api/v1/*`).
- `screenshots/` — images used by the repo README.

In-app setup cards carry their own step-by-step instructions and a
"Full guide" link to the matching page here (`src/lib/docs-url.ts`). Keep
the two in step when you change either, and update the link if you rename
or move a page.

## Writing style

Plain, direct, second person, short sentences. Bold UI labels exactly as the
app shows them (**Settings → Members**). Setup flows are numbered `<Steps>`,
say which role can do them, and end with how to check it worked and the real
error messages with their fixes.

## Keeping this accurate

Everything here was written by reading the actual route handlers,
validation schemas, and Prisma models in `src/` at the time it was written
— not from memory or assumption. If a feature's behavior changes (a new
payment term, a new MCP tool, a changed field), the corresponding page here
will drift out of date silently. There's no automated check tying these
docs to the code, so treat this as a snapshot to review and update
alongside future feature work, not something that stays correct on its own.

## Deploying

Published at https://consultainer.app/docs/ by the GitHub Pages workflow
(`.github/workflows/pages.yml`) on every push to main that touches `docs/`.
`docs-site/` renders these MDX files into static HTML with the sidebar from
`docs.json`, shims for the Mintlify components (`docs-site/components.mjs`),
and Pagefind search. This folder stays plain Mintlify: if a page uses a
Mintlify component that has no shim yet, the build fails with
`Expected component X to be defined`; add one there.

To move to Mintlify's hosting instead, create a project at
[mintlify.com](https://mintlify.com) and point it at this `docs/` folder;
it builds from `docs.json` on push.
