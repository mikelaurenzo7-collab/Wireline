## 2024-06-25 - [Context Value Memoization]
**Learning:** This codebase uses React Context heavily (AuthContext, ToastContext, BrandingContext). Passing un-memoized object literals directly to `Context.Provider` `value` props causes every component consuming that context to unnecessarily re-render on every provider render, even if the actual data hasn't changed.
**Action:** Always wrap context values in `useMemo` and callbacks in `useCallback` before passing them to `Context.Provider` to ensure reference equality and prevent widespread unnecessary re-renders.
