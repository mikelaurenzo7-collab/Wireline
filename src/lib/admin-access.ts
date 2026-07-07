/** Tabs reserved for legacy deep links — not shown in tenant Admin. */
export const OWNER_ONLY_ADMIN_TABS = ["cockpit", "system"] as const;

export type OwnerOnlyAdminTab = (typeof OWNER_ONLY_ADMIN_TABS)[number];

export function isWirelineAccountHolder(user: { is_owner?: boolean } | null | undefined): boolean {
  return user?.is_owner === true;
}

export function isOwnerOnlyAdminTab(tab: string): tab is OwnerOnlyAdminTab {
  return (OWNER_ONLY_ADMIN_TABS as readonly string[]).includes(tab);
}
