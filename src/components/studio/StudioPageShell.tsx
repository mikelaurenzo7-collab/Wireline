import { type ReactNode } from "react";

import WorkspaceShell from "../WorkspaceShell";

export default function StudioPageShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell title="" eyebrow="" contentClassName="h-full min-h-0 overflow-hidden p-0">
      {children}
    </WorkspaceShell>
  );
}
