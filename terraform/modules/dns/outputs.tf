output "certificate_arn" {
  value = aws_acm_certificate_validation.main.certificate_arn
}

output "validation_records" {
  description = "DNS records to add manually at the registrar to validate the ACM cert"
  value = [
    for dvo in aws_acm_certificate.main.domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ]
}
