import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminSettings from "../src/components/AdminSettings";

const h = vi.hoisted(() => ({ search: "?tab=team", state: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    h.state();
    return [initial, vi.fn()];
  },
  useEffect: vi.fn(),
}));
vi.mock("react-router", async (original) => ({
  ...(await original<typeof import("react-router")>()),
  Navigate: "route-redirect",
  useLocation: () => ({ pathname: "/admin", search: h.search }),
  useNavigate: () => vi.fn(),
}));
vi.mock("../src/contexts/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock("../src/contexts/BrandingContext", () => ({
  useBranding: () => ({ updateBranding: vi.fn() }),
}));

beforeEach(() => {
  h.state.mockClear();
  h.search = "?tab=team";
});

describe("legacy admin Team entry", () => {
  it("replaces the legacy URL with canonical Team settings before loading admin controls", () => {
    const view = AdminSettings();
    expect(isValidElement(view)).toBe(true);
    expect(view.type).toBe("route-redirect");
    expect(view.props).toMatchObject({ to: "/settings/team", replace: true });
    expect(h.state).not.toHaveBeenCalled();
  });

  it("keeps unrelated admin sections on their existing surface", () => {
    h.search = "?tab=branding";
    const view = AdminSettings();
    expect(view.type).not.toBe("route-redirect");
  });
});
