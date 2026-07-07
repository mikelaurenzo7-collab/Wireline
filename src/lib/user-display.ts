/**
 * Human-friendly workspace labels — never greet or sidebar-truncate raw machine usernames.
 */

function capitalizeWord(word: string): string {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function looksMachineGenerated(token: string): boolean {
  return /[._-]/.test(token) || /\d{2,}/.test(token);
}

function cleanEmailLocalPart(local: string): string {
  const token = local
    .split(/[._-]/)[0]
    .replace(/\d+$/, "")
    .replace(/[^A-Za-z]/g, "");
  if (!token || token.length < 2 || token.length > 14) return "";
  return capitalizeWord(token);
}

function friendlyNameToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";
  if (looksMachineGenerated(trimmed)) {
    return cleanEmailLocalPart(trimmed);
  }
  return capitalizeWord(trimmed);
}

function friendlyFromName(name?: string | null): string {
  const token = name?.trim().split(/\s+/)[0];
  if (!token) return "";
  return friendlyNameToken(token);
}

/** First name for greetings ("Good morning, Visual."). Falls back to "there". */
export function workspaceFirstName(name?: string | null, email?: string | null): string {
  const fromName = friendlyFromName(name);
  if (fromName) return fromName;
  const local = email?.split("@")[0]?.trim();
  if (!local) return "there";
  return cleanEmailLocalPart(local) || "there";
}

/** Sidebar / account chip — short, never a 20+ char QA mailbox local-part. */
export function workspaceSidebarLabel(
  name?: string | null,
  email?: string | null,
  fallback = "Workspace",
): string {
  const fromName = friendlyFromName(name);
  if (fromName) {
    if (fromName.length <= 20) return fromName;
    return `${fromName.slice(0, 17)}…`;
  }
  const fromEmail = workspaceFirstName(null, email);
  if (fromEmail !== "there") return fromEmail;
  const local = email?.split("@")[0]?.trim();
  if (!local) return fallback;
  if (local.length > 18) return `${local.slice(0, 15)}…`;
  return local;
}
