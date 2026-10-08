# Consultainer

Client, project, and billing management for consultants and contractors. Track clients and their contacts/links, run projects with per-person bill rates and tasks, log time, generate invoices, and get Slack/email/in-app notifications — self-hosted.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dashboard-dark.png">
  <img alt="Consultainer dashboard" src="docs/screenshots/dashboard-light.png">
</picture>

| | |
|---|---|
| ![Time tracking](docs/screenshots/time-light.png) | ![Project with budget and rates](docs/screenshots/project-light.png) |
| ![Invoices](docs/screenshots/invoices-light.png) | ![Client with a billing cycle](docs/screenshots/client-light.png) |

More at [consultainer.app](https://consultainer.app). Screenshots use the fictional demo data in `prisma/seed-demo.ts`; regenerate them with `scripts/screenshots.mjs`.

## Stack

- **Next.js 16** (App Router, TypeScript, Server Actions) + **Tailwind v4** + **shadcn/ui**
- **PostgreSQL** via **Prisma 7** (driver adapters, `@prisma/adapter-pg`)
- **Auth.js v5** (Credentials provider, JWT sessions) — multi-tenant via an `Organization` → `Membership` model
- **@react-pdf/renderer** for invoice PDFs, **Resend** for transactional email, Slack incoming webhooks, **QuickBooks Online** (OAuth 2.0) for pushing invoices
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

This starts Postgres, the app, and a small scheduler for recurring invoices and Mercury sync. The app runs `prisma migrate deploy` on every start, so upgrading is `docker compose pull && docker compose up -d`. Image tags: `latest` (every change to main — what compose runs by default), and `X.Y.Z` / `X.Y` release tags to pin with `CONSULTAINER_VERSION` in `.env`. To build from a checkout instead: `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`.

**First run.** Open the app (port `APP_PORT`, 3113 by default). On an empty database every route sends you to `/setup`, where you create the organization and its local admin (owner) account. If `SETUP_TOKEN` is set, the form asks for it — set one if the instance is reachable from the internet before you've finished setup. Once an account exists `/setup` is closed for good. You then land on a checklist (`/welcome`) for SSO, invites, and your first client.

**No public signup.** People join by invite (Settings → Members), by SSO auto-provisioning, or via Google sign-in on an org's auto-join domain.

**Email is optional.** Without `RESEND_API_KEY`, invites and contractor-review requests give you a link to copy and share, magic-link login is hidden, and email changes apply immediately after a password check.

**URLs.** Sign-in, SSO and OAuth redirects follow whatever address the app is reached at — `localhost`, `hp.local`, or a domain behind a TLS proxy (Caddy, nginx, Traefik; forward `X-Forwarded-Host`/`-Proto`). Links that leave the browser (emails, invite/share/review links) use the **instance URL** you confirm at setup, editable by owners in Settings → General. Set `AUTH_URL` only to force a single URL for everything.

To try it with realistic demo data (on an empty database): `docker compose exec consultainer-app node_modules/.bin/tsx prisma/seed-demo.ts`, then log in as `maya@northwind.example` / `password123`.

## Single sign-on (OIDC)

Settings → Security → Single sign-on. Works with any OpenID Connect provider (Okta, Entra ID, Google Workspace, Authentik, Keycloak, Zitadel, Auth0):

1. Create a confidential "web" OIDC client in your IdP, with the **redirect URI** shown on the settings card (`<your URL>/api/sso/callback` — open the settings page on the address people will sign in from) and scopes `openid email profile`.
2. Paste the issuer URL, client ID, and client secret. Endpoints come from the issuer's `/.well-known/openid-configuration`.
3. Optionally set a button label, restrict allowed email domains, choose whether first-time users get an account automatically (and with which role), and **require SSO** — this blocks password, passkey, magic-link, and Google login for everyone except owners, who keep local login as a break-glass path.

Once enabled, a "Sign in with …" button appears on the login page. The flow uses PKCE, a nonce, and a state value bound to the browser that started it. Identities are matched to accounts by email, and an IdP that reports `email_verified: false` is refused.

## Data model

- **Organization / Membership** — the tenant boundary. A user can belong to multiple organizations with a role (`OWNER` / `ADMIN` / `MEMBER`); every query is scoped by the active org.
- **Client / Contact / Link** — a client's profile, its points of contact, and arbitrary links (login URLs, Google Drive folders, docs, repos).
- **Project / ProjectMember / Task / Link** — work under a client, with its own links, a per-person hourly bill rate, and a task list (optionally assigned) that time gets logged against.
- **TimeEntry** — hours logged by a user against a project (and optionally a task), flagged billable or not. Owners/admins can reassign an entry to someone else or set a one-off `rateOverride` for it. Locked once it's been pulled into an invoice.
- **Invoice / InvoiceLineItem** — generated by selecting unbilled billable time for a client (grouped by project + person + effective rate, so a rate override splits into its own line); line items are editable while in `DRAFT`, then move through `SENT` → `PAID` (or `VOID`). PDFs are rendered on demand at `/invoices/:id/pdf`.
- **Notification** — in-app notifications (invite accepted, added to a project, task assigned, time logged, invoice sent/paid).
- **ApiKey** — per-user API keys (Settings → Profile) used to authenticate the REST API and MCP server.

## Notifications: Slack + email

- **Slack**: paste an [Incoming Webhook](https://api.slack.com/messaging/webhooks) URL into Settings → Organization. Posts there when an invoice is sent/paid and when time is logged.
- **Email** (optional, via [Resend](https://resend.com)): set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. Used for team invites, magic-link login, and invoice sent/paid notices to the org owner. Without it the app works fully — see Self-hosting above.
- **In-app**: always on, no config needed — see the bell icon in the top bar.

## REST API + MCP

Create a key under **Settings → Profile → API keys**. A key acts as that specific person (their role/permissions apply) in that organization.

```bash
curl -H "Authorization: Bearer ch_live_..." https://your-domain/api/v1/clients

curl -X POST https://your-domain/api/v1/time-entries \
  -H "Authorization: Bearer ch_live_..." \
  -H "Content-Type: application/json" \
  -d '{"projectId":"...", "date":"2026-07-23", "hours":2.5, "description":"Client call", "billable":true}'
```

Endpoints: `clients`, `projects`, `projects/:id/tasks`, `tasks/:id`, `time-entries`, `time-entries/:id`, `invoices`, `invoices/generate` (owner/admin only).

The same key works as an **MCP server** at `/api/mcp` (Streamable HTTP) for Claude Desktop/Code or any MCP client — add it as a remote connector with an `Authorization: Bearer <key>` header. Tools: `list_clients`, `list_projects`, `list_my_tasks`, `log_time`, `list_time_entries`, `update_time_entry`, `delete_time_entry`, `list_invoices`, `generate_invoice`.

## QuickBooks Online integration

An org owner/admin can connect QuickBooks (Settings → Organization → Integrations) and push any invoice to it as a real QBO invoice, creating the customer and a "Consulting Services" line item automatically on first use.

Setup:
1. `INTEGRATION_ENCRYPTION_KEY=$(openssl rand -base64 32)` — required to store OAuth tokens encrypted at rest.
2. Register a free app at [developer.intuit.com](https://developer.intuit.com) → set `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET`. Add `<your-domain>/api/integrations/quickbooks/callback` as the app's redirect URI.
3. `QUICKBOOKS_ENVIRONMENT=sandbox` works immediately against Intuit's free sandbox company. Real (non-sandbox) companies require Intuit's standard app-review/publishing step on their end first — that's expected, not a bug here.
4. Click Connect in Settings, authorize, and push a draft/sent invoice from its detail page.

**Why QuickBooks and not Found.com, Novo, or Bill.com:** researched directly against each vendor before building anything. Found.com and Novo are banking apps with invoicing as a built-in feature — neither exposes a public developer API; their "partners" programs are referral/reseller relationships, not integration platforms. Bill.com does have a real API, but its core AR/AP endpoints authenticate via the user's actual BILL.com username/password (no OAuth, no org-scoped key) — storing or handling that felt like the wrong security tradeoff for a self-hosted tool, so it was set aside in favor of QuickBooks' genuine OAuth 2.0 flow.

## What's intentionally not built yet

- Bill.com/Found/Novo integrations — see above; the "external billing tool" link field in Settings remains as a manual fallback for any provider without a real integration.
- Two-way sync with QuickBooks (pulling payment status back) — push-only for now.
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
