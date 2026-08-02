# ── ALB (consumed by DNS module and root outputs) ─────────────────────────────
output "alb_dns" { value = aws_lb.main.dns_name }
output "alb_zone_id" { value = aws_lb.main.zone_id }
output "alb_arn" { value = aws_lb.main.arn }
output "target_group_arn" { value = aws_lb_target_group.app.arn }

# ── EC2 instance ───────────────────────────────────────────────────────────────
output "instance_id" { value = aws_instance.app.id }
output "instance_public_ip" { value = aws_instance.app.public_ip }

# ── Key pair / security group ────────────────────────────────────────────────
output "key_pair_name" { value = aws_key_pair.deploy.key_name }
output "sg_ec2_id" { value = aws_security_group.ec2.id }
