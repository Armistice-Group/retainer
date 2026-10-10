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

These docs aren't hosted anywhere the app can link to yet, so in-app setup
cards carry their own step-by-step instructions. Keep the two in step when
you change either.

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

Not connected to Mintlify's hosting yet. To publish: create a project at
[mintlify.com](https://mintlify.com), point it at this `docs/` folder (or
this whole repo, or a dedicated docs repo if you split it out), and it
builds from `docs.json` automatically on push.
