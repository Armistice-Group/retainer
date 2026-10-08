import { z } from "zod";

export const taskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  assigneeId: z.string().optional().or(z.literal("")),
  estimatedHours: z.coerce.number().positive("Estimate must be greater than zero").optional(),
});

// Editing a task (title/description/estimate) is a separate, smaller form
// than creating one — it doesn't manage assignee (that's the dropdown in
// TaskList / assignTaskAction), so this schema deliberately excludes it.
export const taskUpdateSchema = taskSchema.omit({ assigneeId: true });

export const taskStatusValues = ["TODO", "IN_PROGRESS", "DONE"] as const;

export const taskCommentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(5000),
  postToLinear: z.boolean(),
});
