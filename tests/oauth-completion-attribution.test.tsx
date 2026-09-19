import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OAuthComplete from "../src/pages/OAuthComplete";

const h = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  signIn: vi.fn(),
  navigate: vi.fn(),
  sync: vi.fn(),
  markFresh: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: () => [null, vi.fn()],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (effect: () => void) => h.effects.push(effect),
  useLayoutEffect: (effect: () => void) => effect(),
}));
vi.mock("react-router", () => ({
  Link: "a",
  useNavigate: () => h.navigate,
  useLocation: () => ({
    pathname: "/auth/oauth-complete",
    search: "?code=valid-bridge-code",
    hash: "",
  }),
}));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ signIn: h.signIn }) }));
vi.mock("../src/lib/signup-intent", () => ({
  getStoredSignupIntent: () => ({ preferredPlanId: "starter" }),
  syncSignupIntent: h.sync,
}));
vi.mock("../src/lib/auth-redirect", () => ({
  readStoredWorkspaceMode: () => "personal",
  resolvePostAuthDestination: () => "/studio?create=1",
}));
vi.mock("../src/lib/post-signup-onboarding", () => ({
  clearFreshSignupSession: vi.fn(),
  markFreshSignupSession: h.markFresh,
}));
vi.mock("../src/components/marketing/MarketingChrome", () => ({ default: "main" }));
vi.mock("../src/components/brand/WirelineBrand", () => ({ WirelineLockup: "span" }));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: "page-meta" }));

beforeEach(() => {
  vi.clearAllMocks();
  h.effects = [];
  vi.stubGlobal("window", { history: { state: null, replaceState: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe("OAuth completion optional attribution", () => {
  it("opens the authenticated workspace without waiting for signup attribution", async () => {
    const user = { id: "new-account", email: "qa@example.test" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ user, is_new_user: true }))),
    );
    let finishSync!: () => void;
    h.sync.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSync = resolve;
      }),
    );
    OAuthComplete();
    h.effects.forEach((effect) => effect());
    try {
      await vi.waitFor(() =>
        expect(h.navigate).toHaveBeenCalledWith("/studio?create=1", { replace: true }),
      );
      expect(h.signIn).toHaveBeenCalledWith({ user });
      expect(h.markFresh).toHaveBeenCalledOnce();
      expect(h.sync).toHaveBeenCalledOnce();
    } finally {
      finishSync();
    }
  });
});
