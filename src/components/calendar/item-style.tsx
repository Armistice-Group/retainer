import {
  CalendarCheck,
  CalendarClock,
  FileSignature,
  FileText,
  Flag,
  FolderKanban,
  ListTodo,
  RefreshCw,
  Repeat,
  Send,
  Video,
} from "lucide-react";
import type { CalendarType } from "@/lib/services/calendar-items";

/** Icon and colour per kind of calendar item (also the filter chips). */
export const CALENDAR_STYLE: Record<CalendarType, { icon: typeof Flag; className: string }> = {
  meeting: { icon: Video, className: "text-sky-600 dark:text-sky-400" },
  booking: { icon: CalendarCheck, className: "text-cyan-600 dark:text-cyan-400" },
  task: { icon: ListTodo, className: "text-violet-600 dark:text-violet-400" },
  milestone: { icon: Flag, className: "text-emerald-600 dark:text-emerald-400" },
  project: { icon: FolderKanban, className: "text-slate-600 dark:text-slate-300" },
  invoice: { icon: FileText, className: "text-rose-600 dark:text-rose-400" },
  scheduled_send: { icon: Send, className: "text-amber-600 dark:text-amber-400" },
  recurring: { icon: Repeat, className: "text-indigo-600 dark:text-indigo-400" },
  billing_cycle: { icon: RefreshCw, className: "text-teal-600 dark:text-teal-400" },
  estimate: { icon: FileSignature, className: "text-orange-600 dark:text-orange-400" },
};

export const FallbackIcon = CalendarClock;
