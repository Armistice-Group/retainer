# DNS for root_domain is NOT managed here — it stays on the registrar's
# nameservers (Namecheap), with records added there by hand. This module only
# creates the ACM cert; validation blocks on the manual CNAME below existing.

resource "aws_acm_certificate" "main" {
  domain_name       = var.root_domain
  validation_method = "DNS"
  subject_alternative_names = [
    "www.${var.root_domain}",
  ]
  lifecycle { create_before_destroy = true }
  tags = { Name = "${var.root_domain}-cert" }
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn = aws_acm_certificate.main.arn
  validation_record_fqdns = [
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.resource_record_name
  ]
}
