import { z } from "zod";

export const milestoneSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  dueDate: z.string().optional().or(z.literal("")),
});

export const completeMilestoneSchema = z.object({
  milestoneId: z.string().min(1),
  completionNote: z
    .string()
    .trim()
    .min(1, "Describe what was delivered or how completion was verified")
    .max(2000),
  completionUrl: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
});
