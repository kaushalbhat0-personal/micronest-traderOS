import { ToolCard } from "@/components/ui/tool-card";
import { TOOL_GROUPS, TOOLS } from "@/config/tools";

export function ToolGrid() {
  return (
    <div className="space-y-10">
      {TOOL_GROUPS.map((group) => {
        const tools = TOOLS.filter((tool) => tool.group === group.id);

        return (
          <section key={group.id} aria-labelledby={`group-${group.id}`} className="space-y-4">
            <div className="space-y-1">
              <h2 id={`group-${group.id}`} className="text-lg font-semibold tracking-tight">
                {group.name}
              </h2>
              <p className="text-sm text-ink-muted">{group.description}</p>
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
