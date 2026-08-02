import { z } from "zod";

export const generateInvoiceSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  timeEntryIds: z.array(z.string()).min(1, "Select at least one time entry"),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const lineItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().trim().min(1, "Description is required").max(500),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  rate: z.coerce.number().min(0, "Rate must be zero or more"),
});

export const updateInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  taxRate: z.coerce.number().min(0).max(100),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

const domainPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export const orgSettingsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  invoicePrefix: z.string().trim().min(1).max(20),
  defaultCurrency: z.string().trim().min(1).max(10),
  defaultTaxRate: z.coerce.number().min(0).max(100),
  externalBillingLabel: z.string().trim().max(100).optional().or(z.literal("")),
  externalBillingUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
  slackWebhookUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .regex(domainPattern, "Enter a valid domain, e.g. acme.com")
    .optional()
    .or(z.literal("")),
  autoJoinDomain: z.boolean().default(true),
  logoUrl: z.string().trim().url("Enter a valid image URL").optional().or(z.literal("")),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Enter a hex color, e.g. #7c5cf4")
    .optional()
    .or(z.literal("")),
});
