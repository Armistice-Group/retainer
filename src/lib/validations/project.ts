import { z } from "zod";

export const projectSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).default("ACTIVE"),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  confidential: z.boolean().default(false),
  budgetHours: z.coerce.number().positive("Budget must be greater than zero").optional(),
  billingType: z.enum(["HOURLY", "FLAT_FEE", "MILESTONE"]).default("HOURLY"),
  flatFeeAmount: z.coerce.number().positive("Flat fee must be greater than zero").optional(),
});

export const projectMemberSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1, "Team member is required"),
  billRate: z.coerce.number().min(0, "Rate must be zero or more"),
  currency: z.string().trim().min(1).max(10).default("USD"),
  requiresApproval: z.coerce.boolean().default(false),
});
