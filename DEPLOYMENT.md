# Retainer — Deployment & Infrastructure

> **Legacy.** This describes the former hosted AWS deployment (torn down). For
> self-hosting, see the "Self-hosting" section of the README.

This document covers standing up Retainer on AWS: an EC2 instance running the
app container, backed by a dedicated RDS Postgres instance, behind an ALB
that terminates TLS.

---

## Architecture Overview

```
Internet
  │
  └─ ALB  consultainer.app / www.consultainer.app  (HTTPS, ACM cert; HTTP→HTTPS redirect)
       └─ EC2 (Ubuntu, single instance, public subnet)
            └─ docker compose: app (Retainer image from ECR, port 3000 → instance port 80)
                    │
                    └─ RDS Postgres (private subnet, not publicly accessible,
                                      encrypted at rest, automated backups)
```

The app container is the only thing docker compose runs on the instance —
Postgres is RDS, not a local container. (If `docker compose ps` on the
instance still shows a `db` service, that's leftover from before the RDS
migration; see "Known Limitations" below.)

All infrastructure is defined in `terraform/`. CI/CD is in `.github/workflows/`
— `ci.yml` lints/type-checks/builds on every push and PR, `deploy.yml` builds
+ pushes the image to ECR and redeploys the instance on every push to `main`.
Both run on **self-hosted runners** (see below); everything can also be done
manually with the commands in this doc.

**RDS requires TLS.** The default parameter group sets `rds.force_ssl = 1`,
but `pg` (via `@prisma/adapter-pg`, `src/lib/prisma.ts`) doesn't negotiate
TLS by default the way `psql` does. `DATABASE_URL` must include
`&sslmode=no-verify` (or better, real certificate verification — see
`src/lib/prisma.ts` and the SSL section below) or every query fails with a
Prisma P1010 "denied access" error the moment the app container restarts
with a plain connection string. This took production down once; the fix is
already baked into `terraform/modules/ec2/user_data.sh.tpl`.

---

## Prerequisites

- **Terraform** ≥ 1.6 — [install](https://developer.hashicorp.com/terraform/install)
- **AWS CLI** v2 configured with a user/role that has administrator access
- **Docker** (for building and pushing the image)
- **A Route 53 hosted zone** for `consultainer.app`
  - If the domain is registered elsewhere, delegate NS records to Route 53

---

## First-Time Setup

### 1. Configure Variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`. At minimum set:

| Variable | Description |
|---|---|
| `root_domain` | `consultainer.app` |
| `db_password` | Strong password, min 8 chars, no `@`/spaces |
| `ec2_ssh_public_key` | Contents of an SSH public key (see below) |

Generate a deploy key if you don't have one:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/retainer-deploy -C deploy@retainer
```

### 2. Apply Terraform

```bash
terraform init
terraform plan   # review what will be created (~25 resources)
terraform apply
```

> First apply takes a few minutes — ACM certificate DNS validation is the
> slow step.

### 3. Populate Secrets Manager

Terraform creates the secret with placeholder values. After `apply`, fill in
the real ones:

```bash
SECRET_ARN=$(terraform output -raw secrets_arn)

aws secretsmanager put-secret-value \
  --secret-id "$SECRET_ARN" \
  --secret-string "$(cat <<'EOF'
{
  "AUTH_SECRET":                "",
  "INTEGRATION_ENCRYPTION_KEY": "",
  "RESEND_API_KEY":             "",
  "RESEND_FROM_EMAIL":          "",
  "QUICKBOOKS_CLIENT_ID":       "",
  "QUICKBOOKS_CLIENT_SECRET":   ""
}
EOF
)"
```

Generate `AUTH_SECRET` / `INTEGRATION_ENCRYPTION_KEY`:
```bash
openssl rand -hex 32
```

> Terraform has `ignore_changes = [secret_string]` on this resource, so future
> `terraform apply` runs will **not** overwrite values you set here.

### 4. Build & Push the Initial Image

ECR is empty after `terraform apply` — the instance's first boot will fail to
pull an image until one exists.

```bash
ECR_REPO=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin "$(echo "$ECR_REPO" | cut -d/ -f1)"

docker build -t "$ECR_REPO:latest" ..
docker push "$ECR_REPO:latest"
```

### 5. Start the Stack

The instance's bootstrap script (`user_data`) tries to start the stack on
first boot, but if the image wasn't in ECR yet it will have failed. Once the
image is pushed:

```bash
IP=$(terraform output -raw instance_public_ip)
ssh ubuntu@"$IP" "sudo systemctl restart retainer"
```

Or use SSM instead of SSH (the instance's IAM role already has
`AmazonSSMManagedInstanceCore`):
```bash
aws ssm start-session --target "$(cd terraform && terraform output -raw instance_id)"
```

Migrations run automatically — the app container's entrypoint runs
`prisma migrate deploy` before starting the server, every time it boots.

### 6. Verify

```bash
open "$(terraform output -raw app_url)"
```

Check target health:
```bash
aws elbv2 describe-target-health \
  --target-group-arn "$(cd terraform && terraform output -raw target_group_arn)"
```

---

## CI/CD Setup

### Self-Hosted Runner

Both workflows require a self-hosted runner registered to this repo (or an
org-level runner shared with other projects) labeled `self-hosted` and, for
the Docker build jobs, `x64`:

- Linux x86_64 host
- Docker installed and the runner user able to run it
- Node.js is installed per-job via `actions/setup-node` — no need to
  preinstall it on the runner
- `jq` and AWS CLI v2 available on `PATH` (used by `deploy.yml`)

Register one at **repo → Settings → Actions → Runners → New self-hosted
runner** and follow GitHub's instructions.

### IAM User for GitHub Actions

Create a deploy-only IAM user (do **not** reuse your admin credentials) and
attach a policy scoped to just what the workflows need:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "REPLACE_WITH_terraform_output_ecr_repository_arn"
    },
    {
      "Effect": "Allow",
      "Action": ["ssm:SendCommand"],
      "Resource": [
        "arn:aws:ssm:us-east-1::document/AWS-RunShellScript",
        "REPLACE_WITH_terraform_output_instance_arn"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["ssm:GetCommandInvocation"],
      "Resource": "*"
    }
  ]
}
```

Get the values to substitute:
```bash
cd terraform
terraform output -raw ecr_repository_arn
terraform output -raw instance_arn
```

Generate an access key for this user and add it to GitHub.

### GitHub Actions Secrets

Go to **repo → Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | The deploy IAM user's access key |
| `AWS_SECRET_ACCESS_KEY` | The deploy IAM user's secret key |
| `ECR_REPOSITORY` | `terraform output -raw ecr_repository_url \| cut -d/ -f2-` (e.g. `retainer-prod/app`) |
| `EC2_INSTANCE_ID` | `terraform output -raw instance_id` |

### Pipeline

- `ci.yml` — every push and PR: `npm run lint`, `tsc --noEmit`, `docker build`
  (no push) + Trivy HIGH/CRITICAL scan (non-blocking — set `exit-code: '1'`
  once you've triaged the initial findings)
- `deploy.yml` — triggered by a successful `ci.yml` run on `main` (or manually
  via **Actions → Deploy to AWS → Run workflow**): builds and pushes the image
  to ECR, then redeploys the instance over SSM (`docker compose pull` +
  `up -d`) — no SSH key needs to live in GitHub, since the instance's own IAM
  role already grants it SSM access

---

## Day-to-Day Operations

### Deploy a New Version

Normally this happens automatically — `deploy.yml` runs on every push to
`main`. To do it by hand:

```bash
cd terraform
ECR_REPO=$(terraform output -raw ecr_repository_url)
IP=$(terraform output -raw instance_public_ip)

docker build -t "$ECR_REPO:latest" ..
docker push "$ECR_REPO:latest"

# The instance's ECR login (done at boot) expires after 12h, so re-login
# before pulling rather than assuming it's still valid.
ssh ubuntu@"$IP" "aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $(echo "$ECR_REPO" | cut -d/ -f1) && cd /opt/retainer && docker compose pull && docker compose up -d --remove-orphans"
```

### View Logs

```bash
IP=$(terraform output -raw instance_public_ip)
ssh ubuntu@"$IP" "cd /opt/retainer && docker compose logs -f app"
```

Bootstrap (user_data) log, if the instance ever fails to come up cleanly:
```bash
ssh ubuntu@"$IP" "cat /var/log/user-data.log"
```

### Update a Secret

```bash
SECRET_ARN=$(cd terraform && terraform output -raw secrets_arn)
CURRENT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)

# Edit CURRENT JSON, then:
aws secretsmanager put-secret-value --secret-id "$SECRET_ARN" --secret-string 'UPDATED_JSON_HERE'
```

Secrets Manager is only read once, at first boot. To pick up a change on the
running instance, SSH in, hand-edit the relevant line in `/opt/retainer/.env`,
then:
```bash
cd /opt/retainer && docker compose up -d
```

### Resize the Instance

```bash
# terraform.tfvars
ec2_instance_type = "t3.medium"
```
```bash
terraform apply
```
This replaces the instance (new `user_data` boot). Postgres data is
unaffected — it lives in RDS, not on the instance — but this is still a
brief-downtime event: the app is unreachable from instance termination until
the new one finishes booting and passes the ALB health check.

### Apply Infrastructure Changes

```bash
cd terraform
terraform plan   # always review first
terraform apply
```

---

## Teardown

```bash
cd terraform
terraform apply -var="deletion_protection=false"   # if not already false
terraform destroy
```

> `terraform destroy` deletes the RDS instance along with everything else.
> RDS keeps automated backups per `backup_retention_days`, but take an
> explicit final snapshot first if you want a durable, standalone copy:
> ```bash
> aws rds create-db-snapshot \
>   --db-instance-identifier retainer-prod-postgres \
>   --db-snapshot-identifier retainer-final-$(date +%Y%m%d)
> ```

---

## Known Limitations of This Setup

This is scoped for **initial users**, not long-term production:

- **Single app instance, no HA** — an instance failure takes the app down
  until Terraform/systemd brings it back. Postgres itself is RDS (managed,
  automated backups, point-in-time recovery), so this limitation is scoped
  to the app tier only, not the database.
- **RDS TLS uses `sslmode=no-verify`** — encrypted in transit, but the
  client doesn't validate RDS's certificate chain against a CA. Full
  verification means vendoring Amazon's RDS CA bundle
  (`https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`) and
  passing it via `ssl.ca` in `src/lib/prisma.ts` instead of relying on the
  connection string alone.
- **Self-hosted runner reliability** — `ci.yml`/`deploy.yml` depend on a
  self-hosted runner (see "CI/CD Setup" above) that has intermittently shown
  0 registered runners (`gh api repos/OWNER/REPO/actions/runners`) between
  jobs, possibly ephemeral (spins up, runs one job, deregisters). Don't
  assume a push auto-deployed — check `gh run list --branch main` after
  pushing, and fall back to the manual "Deploy a New Version" steps above if
  nothing picks the job up.
- **No rolling deploys** — `deploy.yml` restarts the single instance in place,
  so there's a brief window of downtime on every deploy (a few seconds for
  the container to restart, longer if a migration runs). Fine for initial
  users; needs a second instance + ALB draining for zero-downtime deploys.
