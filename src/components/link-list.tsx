import {
  ExternalLink,
  KeyRound,
  FolderOpen,
  Cloud,
  Archive,
  FileText,
  GitBranch,
  Link2,
  X,
} from "lucide-react";
import { deleteLinkAction } from "@/actions/clients";
import { Button } from "@/components/ui/button";

const ICONS: Record<string, typeof Link2> = {
  LOGIN: KeyRound,
  GDRIVE: FolderOpen,
  ONEDRIVE: Cloud,
  BOX: Archive,
  DOC: FileText,
  REPO: GitBranch,
  OTHER: Link2,
};

export function LinkList({
  links,
  redirectPath,
}: {
  links: { id: string; label: string; url: string; type: string }[];
  redirectPath: string;
}) {
  if (links.length === 0) {
    return <p className="text-sm text-muted-foreground">No links added yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {links.map((link) => {
        const Icon = ICONS[link.type] ?? Link2;
        return (
          <li key={link.id} className="flex items-center gap-3 py-2.5">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center gap-1.5 truncate text-sm hover:underline"
            >
              {link.label}
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
            </a>
            <form
              action={async () => {
                "use server";
                await deleteLinkAction(link.id, redirectPath);
              }}
            >
              <Button variant="ghost" size="icon" className="size-7" type="submit">
                <X className="size-3.5" />
              </Button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
