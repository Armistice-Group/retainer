import { z } from "zod";

/** A calendar day, YYYY-MM-DD, that actually exists (no 2026-02-30). */
export const isoDay = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-07-23 (YYYY-MM-DD).")
  .refine((v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return true; // the regex already said so
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "That date doesn't exist.");

/** An optional due date: a day, or null / "" for none. Leaving it out
 * (undefined) means "don't change it" on updates. */
export const optionalDueDate = isoDay.nullable().optional().or(z.literal("").transform(() => null));

/** A due-date string as stored in a @db.Date column (UTC midnight). */
export function dueDateValue(v: string | null | undefined) {
  if (v === undefined) return undefined;
  return v ? new Date(`${v}T00:00:00Z`) : null;
}

export const taskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  assigneeId: z.string().optional().or(z.literal("")),
  estimatedHours: z.coerce.number().positive("Estimate must be greater than zero").optional(),
  dueDate: optionalDueDate,
});

// Editing a task (title/description/estimate) is a separate, smaller form
// than creating one — it doesn't manage assignee (that's the dropdown in
// TaskList / assignTaskAction), so this schema deliberately excludes it.
export const taskUpdateSchema = taskSchema.omit({ assigneeId: true });

export const taskStatusValues = ["TODO", "IN_PROGRESS", "DONE"] as const;

export const taskCommentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(5000),
  postToLinear: z.boolean(),
  shareWithClient: z.boolean().default(false),
});
