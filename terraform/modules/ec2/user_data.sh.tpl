#!/bin/bash
set -euo pipefail
exec > >(tee /var/log/user-data.log | logger -t user-data) 2>&1

echo "=== Retainer EC2 bootstrap starting ==="

# ── Wait for apt locks (cloud-init can hold them on first boot) ───────────────
export DEBIAN_FRONTEND=noninteractive
for i in $(seq 1 30); do
  fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || break
  echo "Waiting for apt lock... ($i/30)"
  sleep 3
done

apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release jq unzip

# ── AWS CLI v2 ────────────────────────────────────────────────────────────────
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp/awscli
/tmp/awscli/aws/install
rm -rf /tmp/awscliv2.zip /tmp/awscli
echo "AWS CLI installed: $(aws --version)"

# ── Docker Engine ─────────────────────────────────────────────────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list >/dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker ubuntu
systemctl enable --now docker
echo "Docker installed: $(docker --version)"

# ── App directory ─────────────────────────────────────────────────────────────
mkdir -p /opt/retainer
chown -R ubuntu:ubuntu /opt/retainer

# ── docker-compose.yml ─────────────────────────────────────────────────────────
# Single-quoted heredoc — bash will NOT expand the variable references below.
# The doubled dollar signs are Terraform template escapes; after templatefile()
# runs they collapse to single dollar signs, which docker compose then expands
# at runtime by reading /opt/retainer/.env (interpolation, not container env).
cat > /opt/retainer/docker-compose.yml << 'COMPOSE_EOF'
services:
  app:
    image: $${APP_IMAGE}
    restart: unless-stopped
    env_file: .env
    ports:
      - "80:3000"
COMPOSE_EOF

echo "docker-compose.yml written"

# ── .env — infrastructure values (Terraform-substituted) ─────────────────────
# Doubles as both the docker-compose interpolation file (project-root .env is
# read automatically) and the app container's env_file.
cat > /opt/retainer/.env << INFRA_EOF
APP_IMAGE=${ecr_repository_url}:${app_version}
DATABASE_URL=postgresql://${db_username}:${db_password}@${db_host}:5432/${db_name}?schema=public
AUTH_URL=https://${app_domain}
AUTH_TRUST_HOST=true
APP_URL=https://${app_domain}
NODE_ENV=production
QUICKBOOKS_ENVIRONMENT=sandbox
CRON_SECRET=${cron_secret}
INFRA_EOF

# ── .env — secrets (fetched from Secrets Manager at boot) ────────────────────
SECRETS=$(aws secretsmanager get-secret-value \
  --secret-id "${secrets_arn}" \
  --region "${aws_region}" \
  --query SecretString \
  --output text)

for key in AUTH_SECRET INTEGRATION_ENCRYPTION_KEY \
           RESEND_API_KEY RESEND_FROM_EMAIL \
           QUICKBOOKS_CLIENT_ID QUICKBOOKS_CLIENT_SECRET \
           AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET \
           LINEAR_CLIENT_ID LINEAR_CLIENT_SECRET \
           STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
           STRIPE_PRICE_ID_MONTHLY STRIPE_PRICE_ID_YEARLY \
           STRIPE_PRICE_ID_GROWTH_MONTHLY STRIPE_PRICE_ID_GROWTH_YEARLY \
           ATTIO_API_KEY; do
  value=$(echo "$SECRETS" | jq -r --arg k "$key" '.[$k] // empty')
  [ -n "$value" ] && echo "$key=$value" >> /opt/retainer/.env
done

chmod 600 /opt/retainer/.env
chown ubuntu:ubuntu /opt/retainer/.env
echo ".env written"

# ── ECR login (credentials come from the instance IAM role) ──────────────────
aws ecr get-login-password --region "${aws_region}" \
  | docker login --username AWS --password-stdin "${ecr_registry}"

# ── systemd service ───────────────────────────────────────────────────────────
cat > /etc/systemd/system/retainer.service << 'SERVICE_EOF'
[Unit]
Description=Retainer Application Stack
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/retainer
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300
Restart=on-failure
RestartSec=30
StartLimitIntervalSec=600
StartLimitBurst=5

[Install]
WantedBy=multi-user.target
SERVICE_EOF

systemctl daemon-reload
systemctl enable retainer
systemctl start retainer || echo "Initial stack start failed — check /var/log/user-data.log and 'docker compose logs' in /opt/retainer, then: systemctl restart retainer"

# ── Restricted bastion user for external tools (Retool, etc.) to reach RDS ────
# RDS stays non-publicly-accessible; this user can only forward a single
# port-forward channel to the RDS host:port, never get a shell, and never
# reach anything else on the network (e.g. the instance's own IMDS endpoint).
# Accepts multiple keys (see the variable comment) — re-run-safe, skips
# entirely if none were supplied.
%{ if length(retool_tunnel_public_keys) > 0 }
id -u retool >/dev/null 2>&1 || useradd -m -s /bin/sh retool
mkdir -p /home/retool/.ssh
chmod 700 /home/retool/.ssh
cat > /home/retool/.ssh/authorized_keys << 'AUTHKEYS_EOF'
%{ for key in retool_tunnel_public_keys ~}
command="echo This account only supports SSH port forwarding",no-agent-forwarding,no-X11-forwarding,no-pty,permitopen="${db_host}:5432" ${key}
%{ endfor ~}
AUTHKEYS_EOF
chmod 600 /home/retool/.ssh/authorized_keys
chown -R retool:retool /home/retool/.ssh
grep -q '^AllowTcpForwarding' /etc/ssh/sshd_config || echo 'AllowTcpForwarding yes' >> /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd || true
echo "retool bastion user configured"
%{ endif }

echo "=== Retainer EC2 bootstrap complete ==="
