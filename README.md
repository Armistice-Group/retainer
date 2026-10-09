# Consultainer

Client, project, and billing management for consultants and contractors. Track clients, contacts and documents; run projects with per-person bill rates, budgets and tasks (synced with Linear); log time by hand, with timers, or from your calendar; invoice clients by email with open tracking and online payment; and see utilization and profit — with Slack/email alerts, an audit log, a REST API and an MCP server. Open source (Apache-2.0) and self-hosted.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dashboard-dark.png">
  <img alt="Consultainer dashboard" src="docs/screenshots/dashboard-light.png">
</picture>

| | |
|---|---|
| ![Time tracking](docs/screenshots/time-light.png) | ![Project with budget and rates](docs/screenshots/project-light.png) |
| ![Invoices](docs/screenshots/invoices-light.png) | ![Client with a billing cycle](docs/screenshots/client-light.png) |

More at [consultainer.app](https://consultainer.app); full documentation in [`docs/`](docs/introduction.mdx). Screenshots use the fictional demo data in `prisma/seed-demo.ts`; regenerate them with `scripts/screenshots.mjs`.

## Stack

- **Next.js 16** (App Router, TypeScript, Server Actions) + **Tailwind v4** + **shadcn/ui**
- **PostgreSQL** via **Prisma 7** (driver adapters, `@prisma/adapter-pg`)
- **Auth.js v5** (Credentials provider, JWT sessions) — multi-tenant via an `Organization` → `Membership` model
- **@react-pdf/renderer** for invoice PDFs, **Resend** for email, Slack incoming webhooks
- Integrations: **Linear** (two-way task sync, OAuth + webhooks), **QuickBooks Online** (OAuth 2.0), **Stripe Connect** and **Mercury** (invoice payments), iCal calendar feeds (**node-ical**)
- **REST API + MCP server** for external tools and AI agents (Claude, etc.), authenticated with per-user API keys
- **Docker Compose** for self-hosting (Postgres + the app), portable to any container host later

## Local development

Requires Node 20+, Docker, and npm.

```bash
cp .env.example .env        # then edit values, or generate a fresh AUTH_SECRET:
#   npx auth secret --raw >> .env   (or: openssl rand -base64 32)

docker run -d --name consultainer-dev-db -p 5433:5432 \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=consultainer postgres:16-alpine
# DATABASE_URL=postgresql://app:app@localhost:5433/consultainer?schema=public
npm install
npm run db:migrate          # apply the schema
npm run db:seed             # optional: seed a demo org (demo@example.com / password123)
npm run dev                 # http://localhost:3000 — an empty DB redirects to /setup
```

> Host port **5433** (not 5432) avoids clashing with a Postgres install you may already have running.

## Self-hosting

Consultainer is self-hosted only — no billing, no plan limits, no telemetry.

No checkout needed — the app is published as a multi-arch (amd64/arm64) image at `ghcr.io/armistice-group/retainer`:

```bash
curl -O https://raw.githubusercontent.com/Armistice-Group/retainer/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/Armistice-Group/retainer/main/.env.example
# Fill in the Required section: AUTH_SECRET, INTEGRATION_ENCRYPTION_KEY,
# CRON_SECRET, POSTGRES_PASSWORD (and ideally SETUP_TOKEN).
docker compose up -d
```

This starts Postgres, the app, and a small scheduler for the hourly syncs (Linear, calendars, Mercury) and daily billing jobs (recurring invoices, billing cycles, overdue reminders, the weekly digest). The app runs `prisma migrate deploy` on every start, so upgrading is `docker compose pull && docker compose up -d`. Image tags: `latest` (every change to main — what compose runs by default), and `X.Y.Z` / `X.Y` release tags to pin with `CONSULTAINER_VERSION` in `.env`. To build from a checkout instead: `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`.

**First run.** Open the app (port `APP_PORT`, 3113 by default). On an empty database every route sends you to `/setup`, where you create the organization and its local admin (owner) account. If `SETUP_TOKEN` is set, the form asks for it — set one if the instance is reachable from the internet before you've finished setup. Once an account exists `/setup` is closed for good. You then land on a checklist (`/welcome`) for SSO, invites, and your first client.

**No public signup.** People join by invite (Settings → Members), by SSO auto-provisioning, or via Google sign-in on an org's auto-join domain.

**Integrations are configured in the app.** Owners add email (Resend), QuickBooks, Linear, and Stripe credentials under Settings → Integrations / Payments — each card shows the callback and webhook URLs to register. Environment variables still work and take precedence. Every setting, the scheduled jobs, which paths to leave open behind an authenticating proxy, upgrades and backups are in [docs/self-hosting.mdx](docs/self-hosting.mdx).

**Email is optional.** Without it, invites and contractor-review requests give you a link to copy and share, magic-link login is hidden, email changes apply immediately after a password check, and email-only features (emailing invoices to clients, overdue reminders, email alerts, the weekly digest) are off — invoices can still be shared with a tracked client link.

**URLs.** Sign-in, SSO and OAuth redirects follow whatever address the app is reached at — `localhost`, `hp.local`, or a domain behind a TLS proxy (Caddy, nginx, Traefik; forward `X-Forwarded-Host`/`-Proto`). Links that leave the browser (emails, invite/share/review links) use the **instance URL** you confirm at setup, editable by owners in Settings → General. Set `AUTH_URL` only to force a single URL for everything.

To try it with realistic demo data (on an empty database): `docker compose exec consultainer-app node_modules/.bin/tsx prisma/seed-demo.ts`, then log in as `maya@northwind.example` / `password123`.

## Single sign-on (OIDC)

Settings → Security → Single sign-on. Works with any OpenID Connect provider (Okta, Entra ID, Google Workspace, Authentik, Keycloak, Zitadel, Auth0):

1. Create a confidential "web" OIDC client in your IdP, with the **redirect URI** shown on the settings card (`<your URL>/api/sso/callback` — open the settings page on the address people will sign in from) and scopes `openid email profile`.
2. Paste the issuer URL, client ID, and client secret. Endpoints come from the issuer's `/.well-known/openid-configuration`.
3. Optionally set a button label, restrict allowed email domains, choose whether first-time users get an account automatically (and with which role), and **require SSO** — this blocks password, passkey, magic-link, and Google login for everyone except owners, who keep local login as a break-glass path.

Once enabled, a "Sign in with …" button appears on the login page. The flow uses PKCE, a nonce, and a state value bound to the browser that started it. Identities are matched to accounts by email, and an IdP that reports `email_verified: false` is refused.

## Data model

- **Organization / Membership** — the tenant boundary. A user can belong to multiple organizations with a role (`OWNER` / `ADMIN` / `MEMBER`), an employment type (employee/contractor) and an optional hourly cost; every query is scoped by the active org.
- **Client / Contact / Link / ClientDocument / PaymentMethod** — a client's profile, its contacts (some marked to receive invoices), links, access-controlled documents, and how it pays (its own payment methods and/or the org's).
- **Project / ProjectMember / Milestone / Expense** — work under a client: per-person bill rates, billing type (hourly, flat fee, milestones), an hour budget, payment-term override, and a client share link.
- **Task / TaskComment / TaskWatcher** — tasks with comments (internal, posted to Linear, or shared with the client), @mentions and watchers. **ExternalProjectLink / ExternalTaskLink** tie them to Linear.
- **TimeEntry / ActiveTimer / Timesheet** — hours against a project (and optionally a task), billable or not, with optional rate overrides; one running timer per person; weekly timesheet approval when the org requires it. Locked once invoiced.
- **CalendarFeed / CalendarEvent / CalendarRule** — people's calendar subscriptions, their meetings waiting to be logged or ignored, and remembered per-series choices.
- **Invoice / InvoiceLineItem / InvoiceEvent** — invoices generated from unbilled time, milestones and expenses (`DRAFT` → `SENT` → `PAID`, or `VOID`), with a client-facing link and a record of emails, reminders and client opens. **ClientBillingCycle** and **RecurringInvoiceSchedule** generate them on a schedule.
- **Notification / AuditLog** — in-app notifications, and a record of every change to org data (written by a Prisma extension in `src/lib/audit.ts`).
- **ApiKey** — per-user API keys (Profile → API keys & AI agents) for the REST API and MCP server.

## Alerts: Slack + email

Owners and admins always get alerts in the app; **Settings → Alerts** chooses which also go to Slack (an [incoming webhook](https://api.slack.com/messaging/webhooks) set in Settings → General) and email: a client opening an invoice, billing/payment details changing, access and security changes, invoices sent/paid/overdue, budgets, timesheets, and a Monday digest. See [docs/concepts/alerts-and-audit.mdx](docs/concepts/alerts-and-audit.mdx).

## REST API + MCP

Create a key under **Profile → API keys & AI agents**. A key acts as that specific person (their role and project visibility apply) in that organization.

```bash
curl -H "Authorization: Bearer ch_live_..." https://your-domain/api/v1/clients

curl -X POST https://your-domain/api/v1/time-entries \
  -H "Authorization: Bearer ch_live_..." \
  -H "Content-Type: application/json" \
  -d '{"projectId":"...", "date":"2026-07-23", "hours":2.5, "description":"Client call", "billable":true}'
```

REST endpoints cover clients, projects, tasks and their comments, time entries, invoices (list and generate), and the audit log — see [docs/api-reference](docs/api-reference/introduction.mdx).

The same key works as an **MCP server** at `/api/mcp` (Streamable HTTP) for Claude Code, Claude Desktop, Cursor or any MCP client. Its tools cover everything above plus timers, timesheets, calendar meetings, milestones, expenses, and emailing invoices — see [docs/mcp-server.mdx](docs/mcp-server.mdx).

## QuickBooks Online integration

An owner/admin connects QuickBooks under Settings → Integrations, then pushes invoices from their detail page as real QBO invoices (the customer and a "Consulting Services" item are created on first use). **Sync status from QuickBooks** pulls an invoice's sent/paid status back.

Setup:
1. Register a free app at [developer.intuit.com](https://developer.intuit.com) and add `<your-domain>/api/integrations/quickbooks/callback` as its redirect URI.
2. Enter its client ID and secret under Settings → Integrations (or set `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET`). `QUICKBOOKS_ENVIRONMENT=sandbox` works immediately against Intuit's sandbox; real companies need Intuit's app review first.
3. Click Connect, authorize, and push an invoice.

**Why QuickBooks and not Found.com, Novo, or Bill.com:** researched directly against each vendor before building anything. Found.com and Novo are banking apps with invoicing as a built-in feature — neither exposes a public developer API; their "partners" programs are referral/reseller relationships, not integration platforms. Bill.com does have a real API, but its core AR/AP endpoints authenticate via the user's actual BILL.com username/password (no OAuth, no org-scoped key) — storing or handling that felt like the wrong security tradeoff for a self-hosted tool, so it was set aside in favor of QuickBooks' genuine OAuth 2.0 flow.

## What's intentionally not built yet

- Bill.com/Found/Novo integrations — see above; the "external billing tool" link field in Settings remains as a manual fallback for any provider without a real integration.
- QuickBooks status sync is on demand per invoice, not automatic (QuickBooks doesn't push changes).
- Bill rates are a single current value per person/project (no rate history over time), though a specific time entry can carry a one-off override.
- No automated test suite yet.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` / `npm run start` | Production build / run |
| `npm run db:migrate` | Create/apply a Prisma migration (dev) |
| `npm run db:seed` | Seed a demo organization |
| `npm run db:studio` | Open Prisma Studio against `DATABASE_URL` |
| `npm run lint` | ESLint |

## License

Licensed under the [Apache License, Version 2.0](LICENSE). Copyright 2026 Armistice Group LLC — see [NOTICE](NOTICE).
