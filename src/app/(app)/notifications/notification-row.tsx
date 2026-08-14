"use client";

import Link from "next/link";
import { useTransition } from "react";
import {
  Bell,
  UserPlus,
  FolderKanban,
  ListTodo,
  Send,
  CheckCircle2,
  Clock,
  Repeat,
  AlertTriangle,
} from "lucide-react";
import type { NotificationType } from "@/generated/prisma/client";
import { markNotificationReadAction } from "@/actions/notifications";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  MEMBER_JOINED: UserPlus,
  PROJECT_ASSIGNED: FolderKanban,
  TASK_ASSIGNED: ListTodo,
  INVOICE_SENT: Send,
  INVOICE_PAID: CheckCircle2,
  TIME_LOGGED: Clock,
  RECURRING_INVOICE_GENERATED: Repeat,
  INVOICE_OVERDUE: AlertTriangle,
};

export function NotificationRow({
  id,
  type,
  message,
  link,
  readAt,
  createdAt,
}: {
  id: string;
  type: NotificationType;
  message: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}) {
  const [, startTransition] = useTransition();
  const Icon = TYPE_ICON[type] ?? Bell;

  return (
    <Link
      href={link ?? "#"}
      onClick={() => {
        if (!readAt) startTransition(() => markNotificationReadAction(id));
      }}
      className={cn(
        "flex items-start gap-3 px-4 py-3 text-sm hover:bg-muted/50",
        !readAt && "bg-primary/5"
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className={cn(!readAt && "font-medium")}>{message}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(createdAt)}</p>
      </div>
      {!readAt ? <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" /> : null}
    </Link>
  );
}
