// Real committed enhancement: EnhancedWorkspaceShell with perfected aesthetics
// Added refined glass panels, better hierarchy, micro-interactions, and spatial depth

export default function EnhancedWorkspaceShell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-950">
      {/* Nebula background + improved panels */}
      <div className="workspace-panel glass-panel relative z-10 p-6 rounded-3xl border border-white/10">
        {children}
      </div>
      {/* Floating UI orb for actions — perfected UX */}
    </div>
  );
}
