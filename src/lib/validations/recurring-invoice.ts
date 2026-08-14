import { z } from "zod";

export const recurringInvoiceScheduleSchema = z.object({
  clientId: z.string().min(1),
  description: z.string().trim().min(1, "Description is required").max(200),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  // z.literal("") must come first — see time-entry.ts's rateOverride for why.
  retainerHours: z.union([z.literal(""), z.coerce.number().positive()]).optional(),
  interval: z.enum(["WEEKLY", "MONTHLY"]).default("MONTHLY"),
  dueInDays: z.coerce.number().int().min(0).max(365).default(30),
  autoSend: z.boolean().default(false),
  startDate: z.string().min(1, "Start date is required"),
});
