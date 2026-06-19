/** Optional Clerk sign-out hook registered by WirelineClerkProvider. */
let clerkSignOutHandler: (() => Promise<void>) | null = null;

export function registerClerkSignOutHandler(handler: (() => Promise<void>) | null): void {
  clerkSignOutHandler = handler;
}

export async function runClerkSignOut(): Promise<void> {
  if (!clerkSignOutHandler) return;
  await clerkSignOutHandler();
}
