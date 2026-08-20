output "app_url" {
  description = "Main application URL"
  value       = "https://${var.root_domain}"
}

output "alb_dns" {
  description = "ALB DNS name — add manually at the registrar: ALIAS/ANAME @ -> this, CNAME www -> this"
  value       = module.ec2.alb_dns
}

output "dns_validation_records" {
  description = "ACM validation records — add manually at the registrar before the cert can validate"
  value       = module.dns.validation_records
}

output "instance_public_ip" {
  description = "EC2 instance public IP"
  value       = module.ec2.instance_public_ip
}

output "instance_id" {
  description = "EC2 instance ID (for aws ssm start-session --target)"
  value       = module.ec2.instance_id
}

output "ssh_command" {
  description = "SSH command for manual access (using the key pair you provided)"
  value       = "ssh ubuntu@${module.ec2.instance_public_ip}"
}

output "ecr_repository_url" {
  description = "Push images here: docker push <this>:latest"
  value       = module.ecr.repository_url
}

output "ecr_repository_arn" {
  description = "ECR repo ARN — used to scope the CI deploy user's IAM policy"
  value       = module.ecr.repository_arn
}

output "instance_arn" {
  description = "EC2 instance ARN — used to scope the CI deploy user's SSM policy"
  value       = "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${module.ec2.instance_id}"
}

output "target_group_arn" {
  description = "ALB target group ARN (for checking target health)"
  value       = module.ec2.target_group_arn
}

output "secrets_arn" {
  description = "Secrets Manager ARN — update values here before first deploy"
  value       = aws_secretsmanager_secret.app.arn
}

# ── Shared-infra values, for a *different* app's Terraform to consume by value
# (e.g. pewmarket/terraform sharing this VPC + RDS instance). Deliberately
# plain values, not a remote-state data source — state here is local-only
# (see versions.tf), so cross-repo remote state isn't set up. Copy these via
# `terraform output` into the other repo's tfvars when standing it up; they
# only change if this VPC/RDS is ever recreated.

output "vpc_id" {
  description = "Shared VPC ID — for another app's EC2/ALB to live in the same network as this RDS instance."
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "Shared public subnet IDs (2 AZs) — ALB requires 2+."
  value       = module.networking.public_subnet_ids
}

output "rds_endpoint" {
  description = "Shared RDS Postgres endpoint (hostname only, no port)."
  value       = module.rds.endpoint
}

output "rds_port" {
  value = module.rds.port
}

output "rds_security_group_id" {
  description = "The RDS instance's security group — a sharing app's EC2 SG must be added to rds_additional_allowed_security_group_ids here (in retainer's own tfvars, applied from this repo) before it can connect. Adding an ingress rule to this SG from a different Terraform state won't stick — it's managed as a single inline block here and would get reverted on the next apply."
  value       = module.rds.sg_rds_id
}
