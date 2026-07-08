export function isBalanceFundedVoicePlan(planId: string | null | undefined): boolean {
  return !planId || planId === "personal";
}
