import { PageHeader } from "@/components/layout/page-header";
import { ImportForm } from "./import-form";

export default function ImportClientsPage() {
  return (
    <div>
      <PageHeader
        title="Import clients & projects"
        description="Bring in your existing client and project list from a CSV — a client name that already exists is matched, not duplicated, so it's safe to re-run."
      />
      <div className="max-w-xl">
        <ImportForm />
      </div>
    </div>
  );
}
