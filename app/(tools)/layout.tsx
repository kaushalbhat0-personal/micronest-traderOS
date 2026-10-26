import type { ReactNode } from "react";

import { Container } from "@/components/layout/container";

/**
 * Tool routes get a quiet context strip. It stays server-rendered so tool
 * pages can remain Server Components with a single client island later.
 */
export default function ToolsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-canvas">
      <div className="border-b border-line bg-surface-muted">
        <Container className="py-2">
          <p className="text-xs text-ink-muted">
            Toolkit · calculations only · no broker connection
          </p>
        </Container>
      </div>
      {children}
    </div>
  );
}
