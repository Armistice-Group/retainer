import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "Not a valid date");

const optionalIsoDate = isoDate.nullable().optional().or(z.literal("").transform(() => null));

export const estimateLineItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(500),
  quantity: z.coerce.number().min(0, "Quantity can't be negative").max(999999),
  rate: z.coerce.number().min(0, "Unit price can't be negative").max(99999999),
  isMilestone: z.boolean().default(false),
  /** A fixed due date for the milestone… */
  milestoneDueDate: optionalIsoDate,
  /** …or a number of days after the estimate is accepted. */
  milestoneDueDays: z.coerce.number().int().min(0).max(3650).nullable().optional(),
});

export const estimateBillingTypes = ["HOURLY", "FLAT_FEE", "MILESTONE"] as const;

export const estimateInputSchema = z
  .object({
    clientId: z.string().min(1, "Client is required"),
    projectId: z.string().min(1).nullable().optional().or(z.literal("").transform(() => null)),
    title: z.string().trim().min(1, "Title is required").max(200),
    intro: z.string().trim().max(20000).nullable().optional(),
    issueDate: isoDate.optional(),
    expiresAt: optionalIsoDate,
    taxRate: z.coerce.number().min(0).max(100).default(0),
    proposedBillingType: z.enum(estimateBillingTypes).nullable().optional(),
    proposedRate: z.coerce.number().positive("Rate must be greater than zero").max(99999999).nullable().optional(),
    proposedBudget: z.coerce.number().positive("Budget must be greater than zero").max(9999999999).nullable().optional(),
    lineItems: z
      .array(estimateLineItemSchema)
      .min(1, "Add at least one line item")
      .max(200, "At most 200 line items"),
  })
  .refine((d) => !d.expiresAt || !d.issueDate || d.expiresAt >= d.issueDate, {
    message: "The expiry date can't be before the issue date",
    path: ["expiresAt"],
  });

export type EstimateInput = z.input<typeof estimateInputSchema>;
export type ParsedEstimateInput = z.output<typeof estimateInputSchema>;

export const estimateResponseSchema = z.object({
  decision: z.enum(["ACCEPT", "DECLINE"]),
  name: z.string().trim().min(1, "Enter your name").max(200),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});
