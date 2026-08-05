import { z } from "zod";

export const expenseSchema = z.object({
  projectId: z.string().min(1),
  description: z.string().trim().min(1, "Description is required").max(200),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  incurredAt: z.string().min(1, "Date is required"),
});
