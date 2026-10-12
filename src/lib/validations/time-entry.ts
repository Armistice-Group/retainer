import { z } from "zod";
import { CLOCK_TIME_PATTERN, parseClockTime } from "@/lib/clock-time";

/** "HH:MM" (24-hour); blank or null means no time. */
const clockTime = z
  .string()
  .trim()
  .regex(CLOCK_TIME_PATTERN, "Use a 24-hour time, e.g. 09:30.")
  .or(z.literal(""))
  .nullable()
  .optional();

export const timeEntrySchema = z
  .object({
    projectId: z.string().min(1, "Project is required"),
    taskId: z.string().optional().or(z.literal("")),
    date: z
      .string()
      .min(1, "Date is required")
      .refine((v) => !Number.isNaN(new Date(v).getTime()), "Use an ISO date, e.g. 2026-07-23."),
    // Blank is allowed only with a start and end time (it's worked out from them).
    hours: z
      .union([
        z.literal(""),
        z.coerce
          .number()
          .positive("Hours must be greater than zero")
          .max(24, "Hours can't exceed 24 in a single entry"),
      ])
      .nullable()
      .optional(),
    startTime: clockTime,
    endTime: clockTime,
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    billable: z.boolean().default(true),
    userId: z.string().optional().or(z.literal("")),
    // z.literal("") must come first — Number("") coerces to 0 in JS, so a plain
    // z.coerce.number().or(z.literal("")) would match the numeric branch first
    // and silently turn a blank field into a real $0 rate override.
    rateOverride: z.union([z.literal(""), z.coerce.number().min(0)]).optional(),
  })
  .superRefine((data, ctx) => {
    const hasStart = !!data.startTime;
    const hasEnd = !!data.endTime;
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: "custom",
        path: [hasStart ? "endTime" : "startTime"],
        message: "Give both a start and an end time, or neither.",
      });
    }
    if ((data.hours === "" || data.hours == null) && !(hasStart && hasEnd)) {
      ctx.addIssue({
        code: "custom",
        path: ["hours"],
        message: "Enter hours, or a start and end time.",
      });
    }
  });

/** The parsed form/body as the time entry service's clock and hours fields. */
export function clockFields(data: z.infer<typeof timeEntrySchema>) {
  return {
    hours: data.hours === "" || data.hours == null ? null : data.hours,
    startMinute: data.startTime ? parseClockTime(data.startTime) : null,
    endMinute: data.endTime ? parseClockTime(data.endTime) : null,
  };
}
