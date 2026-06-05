import { useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  isAdminHubPath,
  resolveAppPageSubTabId,
  resolveAppPageSubTabRoute,
  type AppPageSubTabRoute,
} from "../lib/page-sub-tabs";

export function useAppPageSubTabs():
  | (AppPageSubTabRoute & {
      activeId: string;
      setActiveId: (id: string) => void;
      showAdminTabs: false;
    })
  | { showAdminTabs: true }
  | null {
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
          return prev;
        },
        { replace: true },
      );
    },
    [route, setSearchParams],
  );

  if (route) {
    const tabParam = searchParams.get("tab");
    const activeId = resolveAppPageSubTabId(route, tabParam);
    return { ...route, activeId, setActiveId, showAdminTabs: false as const };
  }

  if (isAdminHubPath(pathname)) {
    return { showAdminTabs: true as const };
  }

  return null;
}
