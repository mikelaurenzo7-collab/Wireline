import { useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  isAdminHubPath,
  resolveAppPageSecondaryRoute,
  resolveAppPageSecondaryTabId,
  resolveAppPageSubTabId,
  resolveAppPageSubTabRoute,
  resolveInsightsGroupForView,
  type AppPageSecondaryTabRoute,
  type AppPageSubTabRoute,
} from "../lib/page-sub-tabs";

export type AppChromeSecondaryTabs = Omit<AppPageSecondaryTabRoute, "whenPrimaryTab"> & {
  activeId: string;
  setActiveId: (id: string) => void;
};

export function useAppChromeTabs():
  | (AppPageSubTabRoute & {
      activeId: string;
      setActiveId: (id: string) => void;
      showAdminTabs: false;
      secondary: AppChromeSecondaryTabs | null;
    })
  | { showAdminTabs: true; secondary: null }
  | { showAdminTabs: false; secondary: null; activeId: string; setActiveId: () => void; tabs: [] } {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const route = useMemo(() => resolveAppPageSubTabRoute(pathname), [pathname]);

  const setActiveId = useCallback(
    (id: string) => {
      if (!route) return;
      setSearchParams(
        (prev) => {
          if (id === route.defaultTab) prev.delete("tab");
          else prev.set("tab", id);
          const secondary = resolveAppPageSecondaryRoute(pathname, id);
          if (!secondary) prev.delete("view");
          else if (route.pathname === "/insights") prev.delete("view");
          return prev;
        },
        { replace: true },
      );
    },
    [route, pathname, setSearchParams],
  );

  const setSecondaryActiveId = useCallback(
    (id: string, secondaryRoute: Pick<AppPageSecondaryTabRoute, "defaultView">) => {
      setSearchParams(
        (prev) => {
          if (pathname === "/insights") {
            const ownerRoute = resolveAppPageSubTabRoute(pathname);
            const nextGroup = resolveInsightsGroupForView(id);
            if (nextGroup && ownerRoute) {
              if (nextGroup === ownerRoute.defaultTab) prev.delete("tab");
              else prev.set("tab", nextGroup);
            }
          }
          if (id === secondaryRoute.defaultView) prev.delete("view");
          else prev.set("view", id);
          return prev;
        },
        { replace: true },
      );
    },
    [pathname, setSearchParams],
  );

  const secondary = useMemo((): AppChromeSecondaryTabs | null => {
    if (!route) return null;
    const tabParam = searchParams.get("tab");
    const viewParam = searchParams.get("view");
    const inferredGroup = route.pathname === "/insights" ? resolveInsightsGroupForView(viewParam) : null;
    const primaryId = inferredGroup ?? resolveAppPageSubTabId(route, tabParam);
    const secondaryRoute = resolveAppPageSecondaryRoute(pathname, primaryId);
    if (!secondaryRoute) return null;
    const activeId = resolveAppPageSecondaryTabId(secondaryRoute, viewParam);
    return {
      ...secondaryRoute,
      activeId,
      setActiveId: (id: string) => setSecondaryActiveId(id, secondaryRoute),
    };
  }, [route, pathname, searchParams, setSecondaryActiveId]);

  if (route) {
    const tabParam = searchParams.get("tab");
    const viewParam = searchParams.get("view");
    const inferredGroup = route.pathname === "/insights" ? resolveInsightsGroupForView(viewParam) : null;
    const activeId = inferredGroup ?? resolveAppPageSubTabId(route, tabParam);
    return { ...route, activeId, setActiveId, showAdminTabs: false as const, secondary };
  }

  if (isAdminHubPath(pathname)) {
    return { showAdminTabs: true as const, secondary: null };
  }

  return {
    showAdminTabs: false as const,
    secondary: null,
    activeId: "",
    setActiveId: () => {},
    tabs: [] as [],
  };
}

/** @deprecated Use useAppChromeTabs — kept for narrow imports. */
export function useAppPageSubTabs() {
  const chrome = useAppChromeTabs();
  if (chrome.showAdminTabs) return { showAdminTabs: true as const };
  if ("tabs" in chrome && chrome.tabs.length > 0) {
    const { secondary: _s, ...primary } = chrome;
    return { ...primary, showAdminTabs: false as const };
  }
  return null;
}
