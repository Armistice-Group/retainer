import type { Metadata } from "next";
import { requireOrgContext } from "@/lib/org-context";
import { phoneEntries, phoneTimeData } from "@/lib/services/phone";
import { addDays, parseLocalDate, toISODate } from "@/lib/date";
import { ShareInbox } from "./share-inbox";

export const metadata: Metadata = { title: "Inbox" };

const dayLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(date);

/** Where the share sheet lands (public/sw.js keeps the files in the
 * browser; nothing is uploaded until you pick where they go). */
export default async function PhoneSharePage() {
  const { org, user, role } = await requireOrgContext();
  const viewer = { orgId: org.id, userId: user.id, role, clockRoundingMinutes: org.clockRoundingMinutes };
  const todayStart = parseLocalDate(toISODate(new Date()));
  const [data, entries] = await Promise.all([
    phoneTimeData(viewer),
    phoneEntries(viewer, addDays(todayStart, -13), addDays(todayStart, 1)),
  ]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-medium">Inbox</h1>
      <ShareInbox
        dialog={data.dialog}
        entries={entries.map((e) => ({
          id: e.id,
          day: dayLabel(new Date(e.date)),
          project: e.project.name,
          detail: [e.task?.title, e.description].filter(Boolean).join(" · "),
          hours: Number(e.hours),
        }))}
      />
    </div>
  );
}
