variable "root_domain" {
  description = "Root domain managed in Route 53 (e.g. consultainer.app)"
  type        = string
}

variable "alb_dns" {
  type = string
}

variable "alb_zone_id" {
  type = string
}
