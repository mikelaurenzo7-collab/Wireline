/** Spoken outbound identity. A blank business name uses the workspace, then the account. */
export function spokenBusinessName(input: {
  businessName?: string | null;
  workspaceDisplayName?: string | null;
  accountDisplayName?: string | null;
}): string | null {
  for (const value of [input.businessName, input.workspaceDisplayName, input.accountDisplayName]) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
