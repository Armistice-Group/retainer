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

## Structure

- `docs.json` — Mintlify config: nav, theme, colors, logo.
- `logo/` — **placeholder SVGs** (a plain text wordmark and a purple "C").
  Swap these for real brand assets before this goes live anywhere public.
- `introduction.mdx`, `quickstart.mdx` — top-level onboarding.
- `concepts/` — how clients, projects, time, invoicing, milestones, and
  expenses actually work.
- `integrations/` — QuickBooks and Linear.
- `mcp-server.mdx` — connecting an AI coding agent via MCP.
- `api-reference/` — the REST API (`/api/v1/*`).

## Keeping this accurate

Everything here was written by reading the actual route handlers,
validation schemas, and Prisma models in `src/` at the time it was written
— not from memory or assumption. If a feature's behavior changes (a new
payment term, a new MCP tool, a changed field), the corresponding page here
will drift out of date silently. There's no automated check tying these
docs to the code, so treat this as a snapshot to review and update
alongside future feature work, not something that stays correct on its own.

## Deploying

Not connected to Mintlify's hosting yet. To publish: create a project at
[mintlify.com](https://mintlify.com), point it at this `docs/` folder (or
this whole repo, or a dedicated docs repo if you split it out), and it
builds from `docs.json` automatically on push.
