import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme, type Theme } from "../src/contexts/ThemeContext";
import { WIRELINE_DESIGN_VISION } from "../src/lib/wireline-design-vision";

const h = vi.hoisted(() => ({
  values: [] as unknown[],
  dependencies: [] as Array<readonly unknown[]>,
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  stateCursor: 0,
  effectCursor: 0,
}));

// Run the real provider's preference initialization, updates, and DOM effects.
// The preload script is also executed so first paint cannot drift from hydration.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = h.stateCursor++;
    if (!(index in h.values)) h.values[index] = typeof initial === "function" ? initial() : initial;
    return [
      h.values[index],
      (value: unknown) => {
        h.values[index] = value;
      },
    ];
  },
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (callback: unknown) => callback,
  useContext: () => null,
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
    const index = h.effectCursor++;
    const previous = h.dependencies[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
      h.effects.push(effect);
      h.dependencies[index] = dependencies;
    }
  },
}));

const preload = readFileSync("index.html", "utf8").match(/<script>\s*([\s\S]*?)<\/script>/)![1];
const colors = { dark: "#0A0A0E", light: "#F6F5FA" };
let stored: string | null;
let storageFailure: "getter" | "read" | "write" | null;
let systemDark: boolean;
let mediaChanged: (() => void) | undefined;
let lightClass: boolean;
let meta: Record<string, { content: string }>;
let rootStyle: { colorScheme?: string };
let browser: object;
const storage = {
  getItem: vi.fn(() => {
    if (storageFailure === "read") throw new Error("Storage blocked");
    return stored;
  }),
  setItem: vi.fn((_key: string, value: string) => {
    if (storageFailure === "write") throw new Error("Storage blocked");
    stored = value;
  }),
};

function render() {
  h.stateCursor = h.effectCursor = 0;
  const provider = ThemeProvider({ children: null });
  for (const effect of h.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  }
  return provider.props.value;
}

beforeEach(() => {
  h.values = [];
  h.dependencies = [];
  h.effects = [];
  h.cleanups = [];
  stored = null;
  storageFailure = null;
  systemDark = false;
  mediaChanged = undefined;
  lightClass = false;
  rootStyle = {};
  meta = Object.fromEntries(
    ["color-scheme", "theme-color", "msapplication-TileColor"].map((name) => [
      name,
      { content: "" },
    ]),
  );
  browser = {
    get localStorage() {
      if (storageFailure === "getter") throw new Error("Storage unavailable");
      return storage;
    },
    matchMedia: () => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_event: string, callback: () => void) => {
        mediaChanged = callback;
      },
      removeEventListener: () => {
        mediaChanged = undefined;
      },
    }),
  };
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        toggle: (_name: string, enabled: boolean) => {
          lightClass = enabled;
        },
      },
      style: rootStyle,
    },
    querySelector: (selector: string) => meta[selector.match(/"(.+)"/)![1]],
  });
  vi.clearAllMocks();
});
afterEach(() => {
  h.cleanups.forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

describe("canonical theme preference", () => {
  it.each([
    ["first visit", null, false, null, "dark", "dark"],
    ["saved light", "light", true, null, "light", "light"],
    ["saved dark", "dark", false, null, "dark", "dark"],
    ["saved system on light OS", "system", false, null, "system", "light"],
    ["saved system on dark OS", "system", true, null, "system", "dark"],
    ["invalid saved preference", "unknown", false, null, "dark", "dark"],
    ["blocked storage getter", null, false, "getter", "dark", "dark"],
    ["blocked storage read", null, false, "read", "dark", "dark"],
  ] as const)(
    "honors %s before and after hydration",
    (_label, saved, osDark, failure, preference, resolved) => {
      stored = saved;
      systemDark = osDark;
      storageFailure = failure;
      let preloadLight = false;
      const sandbox = {
        window: browser,
        get localStorage() {
          if (storageFailure === "getter") throw new Error("Storage unavailable");
          return storage;
        },
        document: {
          documentElement: {
            classList: {
              add: () => {
                preloadLight = true;
              },
            },
          },
        },
      };
      runInNewContext(preload, sandbox);
      const value = render();
      expect(value.theme).toBe(preference);
      expect(value.resolvedTheme).toBe(resolved);
      expect(lightClass).toBe(resolved === "light");
      expect(preloadLight).toBe(lightClass);
      expect(rootStyle.colorScheme).toBe(resolved);
      expect(meta["theme-color"].content).toBe(colors[resolved]);
      expect(meta["msapplication-TileColor"].content).toBe(colors[resolved]);
      expect(meta["color-scheme"].content).toBe(resolved);
    },
  );

  it("follows OS changes only when the customer chose System", () => {
    stored = "system";
    expect(render().resolvedTheme).toBe("light");
    systemDark = true;
    mediaChanged!();
    const current = render();
    expect(current.resolvedTheme).toBe("dark");
    current.setTheme("light");
    render();
    systemDark = false;
    mediaChanged!();
    systemDark = true;
    mediaChanged!();
    expect(render().resolvedTheme).toBe("light");
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith("wireline-theme", "light");
  });

  it("keeps a new selection usable when storage writes are blocked", () => {
    storageFailure = "write";
    render().setTheme("light");
    expect(render().resolvedTheme).toBe("light");
    render().toggleTheme();
    expect(render().resolvedTheme).toBe("dark");
  });

  it("uses the manifest default outside a provider", () => {
    const fallback = useTheme();
    expect(fallback.theme).toBe(WIRELINE_DESIGN_VISION.appearance.default satisfies Theme);
    expect(fallback.resolvedTheme).toBe("dark");
  });
});
