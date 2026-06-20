/**
 * Retired visual compatibility component.
 *
 * Wireline now uses a single calm light canvas. Keeping this null component
 * preserves older call sites while ensuring no route can reintroduce a glow,
 * gradient, or route-specific color system.
 */
export default function ClientRouteAmbience() {
  return null;
}
