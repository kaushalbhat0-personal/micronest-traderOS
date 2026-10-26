import { ToolCard } from "@/components/ui/tool-card";
import { TOOL_GROUPS, toolsInGroup } from "@/config/tools";

/**
 * The toolkit index. Groups, tools and statuses all come from
 * `config/tools.ts`; nothing here restates the registry.
 */
export function ToolGrid() {
  return (
    <div className="space-y-12">
      {TOOL_GROUPS.map((group) => {
        const tools = toolsInGroup(group.id);

        return (
          <section
            key={group.id}
            id={`group-${group.id}`}
            aria-labelledby={`group-${group.id}-heading`}
            className="scroll-mt-6 space-y-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
              <div className="space-y-1">
                <h2 id={`group-${group.id}-heading`} className="type-section">
                  {group.name}
                </h2>
                <p className="type-helper text-ink-muted">{group.description}</p>
              </div>
              <p className="type-caption shrink-0 text-ink-muted">
                {tools.length} {tools.length === 1 ? "tool" : "tools"}
              </p>
            </div>

            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => (
                <li key={tool.id}>
                  <ToolCard tool={tool} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
