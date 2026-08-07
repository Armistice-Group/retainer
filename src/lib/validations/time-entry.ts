import { z } from "zod";

export const timeEntrySchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  taskId: z.string().optional().or(z.literal("")),
  date: z.string().min(1, "Date is required"),
  hours: z.coerce
    .number()
    .positive("Hours must be greater than zero")
    .max(24, "Hours can't exceed 24 in a single entry"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  billable: z.boolean().default(true),
  userId: z.string().optional().or(z.literal("")),
  // z.literal("") must come first — Number("") coerces to 0 in JS, so a plain
  // z.coerce.number().or(z.literal("")) would match the numeric branch first
  // and silently turn a blank field into a real $0 rate override.
  rateOverride: z.union([z.literal(""), z.coerce.number().min(0)]).optional(),
});
