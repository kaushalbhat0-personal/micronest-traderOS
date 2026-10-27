import Link from "next/link";

import { TOOLS, type ToolId } from "@/config/tools";

/**
 * Breadcrumb for tool pages: Tools / <Tool Name>. The tool identity comes
 * from the registry, never from hardcoded strings — the page passes its id
 * and the name resolves from `TOOLS`.
 */
export function ToolCrumbs({ toolId }: { toolId: ToolId }) {
  const tool = TOOLS.find((entry) => entry.id === toolId);
  if (tool === undefined) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li className="type-caption">
          <Link
            href="/tools"
            className="inline-flex min-h-11 items-center text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Tools
          </Link>
        </li>
        <li aria-hidden="true" className="type-caption text-ink-faint">
          /
        </li>
        <li className="type-caption text-ink" aria-current="page">
          {tool.name}
        </li>
      </ol>
    </nav>
  );
}
