import { z } from "zod";

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  website: z.string().trim().max(300).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  billingEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  billingAddress: z.string().trim().max(500).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const clientDocumentSchema = z.object({
  clientId: z.string().min(1),
  type: z.enum(["W9", "FORM_1099", "CONTRACT", "OTHER"]).default("OTHER"),
  label: z.string().trim().max(150).optional().or(z.literal("")),
});

export const contactSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  title: z.string().trim().max(150).optional().or(z.literal("")),
  contactRole: z.string().trim().max(100).optional().or(z.literal("")),
  isPrimary: z.boolean().default(false),
  receivesInvoices: z.boolean().default(false),
});

export const linkSchema = z.object({
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  label: z.string().trim().min(1, "Label is required").max(150),
  url: z.string().trim().url("Enter a valid URL"),
  type: z.enum(["LOGIN", "GDRIVE", "ONEDRIVE", "BOX", "DOC", "REPO", "OTHER"]).default("OTHER"),
});
