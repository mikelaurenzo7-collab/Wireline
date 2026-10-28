import { type ReactNode } from "react";

import WorkspaceShell from "../WorkspaceShell";

export default function StudioPageShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      title=""
      eyebrow=""
      contentClassName="min-h-0 flex-1 overflow-hidden p-0"
      fullBleed
    >
      {children}
    </WorkspaceShell>
  );
}
