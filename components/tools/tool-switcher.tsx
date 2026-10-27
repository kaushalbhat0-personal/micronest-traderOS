import Link from "next/link";

import { TOOLS, type ToolId } from "@/config/tools";
import { cn } from "@/lib/utils";

/**
 * Lightweight switcher between live tools. A static, wrapping link group —
 * deliberately not a popover, so keyboard support, focus visibility and
 * Escape behaviour need no custom code: Tab moves, Enter navigates.
 * Destinations come from the registry; planned tools have no route here.
 */
export function ToolSwitcher({ currentId }: { currentId: ToolId }) {
  const liveTools = TOOLS.filter((tool) => tool.status === "live");
  if (liveTools.length < 2) return null;

  return (
    <nav aria-label="Switch tool">
      <p className="type-eyebrow text-ink-muted">Switch tool</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {liveTools.map((tool) => {
          const active = tool.id === currentId;
          return (
            <li key={tool.id}>
              <Link
                href={`/tools/${tool.slug}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "type-label inline-flex min-h-11 items-center rounded-lg border px-3 transition-colors",
                  active
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-line bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                {tool.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
