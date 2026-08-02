// Common free/public email providers — never eligible for domain-based org
// auto-join, since anyone can register an address at these.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "mail.com",
  "gmx.com",
  "zoho.com",
  "yandex.com",
  "qq.com",
  "163.com",
]);

export function isPublicEmailDomain(domain: string) {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}
