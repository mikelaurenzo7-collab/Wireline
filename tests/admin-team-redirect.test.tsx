import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminSettings from "../src/components/AdminSettings";
import { parseChannelEntitlements } from "../src/hooks/useChannelEntitlements";

type Access = {
  status: "loading" | "ready" | "error";
  data: { is_platform_admin?: boolean } | null;
};

const h = vi.hoisted(() => ({
  search: "?tab=team",
  state: vi.fn(),
  user: { id: "owner", is_owner: true } as { id: string; is_owner?: boolean } | null,
  access: { status: "ready", data: {} } as Access,
}));
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
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ signOut: vi.fn(), user: h.user }),
}));
vi.mock("../src/contexts/BrandingContext", () => ({
  useBranding: () => ({ updateBranding: vi.fn() }),
}));
vi.mock("../src/hooks/useChannelEntitlements", async (original) => ({
  ...(await original<typeof import("../src/hooks/useChannelEntitlements")>()),
  useChannelEntitlements: () => h.access,
}));
vi.mock("../src/components/layout/ClientRouteLoading", () => ({ default: "route-loading" }));

beforeEach(() => {
  h.state.mockClear();
  h.search = "?tab=team";
  h.user = { id: "owner", is_owner: true };
  h.access = { status: "ready", data: {} };
});

describe("legacy admin Team entry", () => {
  it("replaces the legacy URL with canonical Team settings before loading admin controls", () => {
    const view = AdminSettings();
    expect(isValidElement(view)).toBe(true);
    expect(view.type).toBe("route-redirect");
    expect(view.props).toMatchObject({ to: "/settings/team", replace: true });
    expect(h.state).not.toHaveBeenCalled();
  });

  it("keeps unrelated admin sections on their existing surface for the platform owner", () => {
    h.search = "?tab=branding";
    const view = AdminSettings();
    expect(view.type).not.toBe("route-redirect");
    expect(view.type).not.toBe("route-loading");
  });
});

describe("who sees the platform console", () => {
  it("sends every other account to the matching Settings page before loading admin controls", () => {
    h.user = { id: "customer", is_owner: false };
    h.access = { status: "ready", data: { is_platform_admin: false } };
    const destinations: Array<[string, string]> = [
      ["", "/settings"],
      ["?tab=accounts", "/settings"],
      ["?tab=branding", "/settings/customization"],
      ["?tab=subscription", "/settings/billing"],
      ["?tab=carrier", "/phone?tab=lines"],
      ["?tab=activity", "/settings/compliance"],
      ["?tab=dnc", "/settings/compliance"],
      ["?tab=team", "/settings/team"],
    ];
    for (const [search, to] of destinations) {
      h.search = search;
      const view = AdminSettings();
      expect(view.type, search).toBe("route-redirect");
      expect(view.props, search).toMatchObject({ to, replace: true });
    }
    expect(h.state).not.toHaveBeenCalled();
  });

  it("keeps the console for an account the database marks as a platform admin", () => {
    h.user = { id: "second-admin", is_owner: false };
    h.access = { status: "ready", data: { is_platform_admin: true } };
    h.search = "?tab=carrier";
    const view = AdminSettings();
    expect(view.type).not.toBe("route-redirect");
    expect(view.type).not.toBe("route-loading");
  });

  it("waits for the answer instead of flashing the console or bouncing an admin", () => {
    h.user = { id: "second-admin", is_owner: false };
    h.access = { status: "loading", data: null };
    h.search = "?tab=carrier";
    expect(AdminSettings().type).toBe("route-loading");
    expect(h.state).not.toHaveBeenCalled();
  });

  it("treats a failed or older answer as an ordinary account", () => {
    h.search = "?tab=carrier";
    for (const user of [{ id: "legacy-session" }, { id: "customer", is_owner: false }]) {
      h.user = user;
      for (const access of [
        { status: "error", data: null },
        { status: "ready", data: {} },
      ] as Access[]) {
        h.access = access;
        expect(AdminSettings().props).toMatchObject({ to: "/phone?tab=lines", replace: true });
      }
    }
  });

  it("accepts the admin flag only as a boolean, and still reads responses without it", () => {
    const base = {
      plan_id: "lite",
      subscription_status: "active",
      channels: ["voice"],
      is_owner: false,
    };
    expect(parseChannelEntitlements(base)?.is_platform_admin).toBeUndefined();
    expect(parseChannelEntitlements({ ...base, is_platform_admin: true })?.is_platform_admin).toBe(
      true,
    );
    expect(parseChannelEntitlements({ ...base, is_platform_admin: "yes" })).toBeNull();
  });
});
