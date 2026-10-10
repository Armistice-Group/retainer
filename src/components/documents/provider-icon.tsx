import { Cloud, Database, FileText, Folder, Globe, HardDrive, NotebookText, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  UPLOAD: FileText,
  GOOGLE_DRIVE: HardDrive,
  DROPBOX: Package,
  ONEDRIVE: Cloud,
  NOTION: NotebookText,
  BOX: Package,
  LINK: Globe,
};

export const SOURCE_LABELS: Record<string, string> = {
  UPLOAD: "Uploaded",
  GOOGLE_DRIVE: "Google Drive",
  DROPBOX: "Dropbox",
  ONEDRIVE: "OneDrive",
  NOTION: "Notion",
  BOX: "Box",
  LINK: "Link",
};

export function DocumentIcon({
  source,
  kind,
  className,
}: {
  source: string;
  kind?: string | null;
  className?: string;
}) {
  const Icon = kind === "folder" ? Folder : kind === "database" ? Database : (ICONS[source] ?? FileText);
  return <Icon className={className} aria-hidden />;
}
