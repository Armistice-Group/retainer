import { PageHeader } from "@/components/layout/page-header";
import { requireOrgContext } from "@/lib/org-context";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireOrgContext();

  return (
    <div>
      <PageHeader title="Settings" />
      <SettingsNav showAuditLog={role === "OWNER" || role === "ADMIN"} />
      {children}
    </div>
  );
}
