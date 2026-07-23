import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader title="Settings" />
      <SettingsNav />
      {children}
    </div>
  );
}
