output "app_url" {
  description = "Main application URL"
  value       = "https://${var.root_domain}"
}

output "alb_dns" {
  description = "ALB DNS name (for debugging / manual CNAME)"
  value       = module.ec2.alb_dns
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
