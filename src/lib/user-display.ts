/**
 * Human-friendly workspace labels — never greet or sidebar-truncate raw machine usernames.
 */

function cleanEmailLocalPart(local: string): string {
  const token = local
    .split(/[._-]/)[0]
    .replace(/\d+$/, "")
    .replace(/[^A-Za-z]/g, "");
  if (!token || token.length < 2 || token.length > 14) return "";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** First name for greetings ("Good morning, Visual."). Falls back to "there". */
export function workspaceFirstName(name?: string | null, email?: string | null): string {
  const fromName = name?.trim().split(/\s+/)[0];
  if (fromName) return fromName.replace(/^./, (letter) => letter.toUpperCase());
  const local = email?.split("@")[0]?.trim();
  if (!local) return "there";
  const cleaned = cleanEmailLocalPart(local);
  return cleaned || "there";
}

/** Sidebar / account chip — short, never a 20+ char QA mailbox local-part. */
export function workspaceSidebarLabel(name?: string | null, email?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const token = trimmed.split(/\s+/)[0];
    if (token.length <= 20) return token;
    return `${token.slice(0, 17)}…`;
  }
  const friendly = workspaceFirstName(null, email);
  if (friendly !== "there") return friendly;
  const local = email?.split("@")[0]?.trim();
  if (!local) return "Workspace";
  if (local.length > 18) return `${local.slice(0, 15)}…`;
  return local;
}
