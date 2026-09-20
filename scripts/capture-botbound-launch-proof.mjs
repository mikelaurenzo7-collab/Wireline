// Compatibility entry point. The revision 3 proof directory is historical and
// must never be overwritten by an old bookmark or command.
console.warn(
  "Legacy proof entry point: capturing the current worktree into the current campaign. Archived revision 3 proof remains unchanged.",
);
await import("./capture-botbound-current-worktree-proof.mjs");
