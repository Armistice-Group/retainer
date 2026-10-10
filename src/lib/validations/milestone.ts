import { z } from "zod";
import { optionalDueDate } from "@/lib/validations/task";

// A milestone is either billable (a payment: billed once it's complete) or a
// deliverable (billable = false: tracked and dated, never invoiced, amount 0).
export const milestoneSchema = z
  .object({
    projectId: z.string().min(1),
    name: z.string().trim().min(1, "Name is required").max(200),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    billable: z.boolean().default(true),
    amount: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.coerce.number("Enter an amount").min(0, "Amount can't be negative").max(1e10).optional()
    ),
    dueDate: optionalDueDate,
  })
  .superRefine((data, ctx) => {
    if (data.billable && !(data.amount && data.amount > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Amount must be greater than zero (or make it a deliverable, which isn't billed)",
      });
    }
  })
  .transform((data) => ({ ...data, amount: data.billable ? data.amount! : 0 }));

export const completeMilestoneSchema = z.object({
  milestoneId: z.string().min(1),
  completionNote: z
    .string()
    .trim()
    .min(1, "Describe what was delivered or how completion was verified")
    .max(2000),
  completionUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
});
