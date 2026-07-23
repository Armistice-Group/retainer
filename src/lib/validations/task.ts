import { z } from "zod";

export const taskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  assigneeId: z.string().optional().or(z.literal("")),
});

export const taskStatusValues = ["TODO", "IN_PROGRESS", "DONE"] as const;
