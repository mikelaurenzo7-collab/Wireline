// WidgetBoundary — small inline error boundary for individual dashboard
// widgets / panels. The route-level <ErrorBoundary> handles whole-page
// crashes; this scoped boundary keeps the rest of the dashboard
// rendering when a single widget breaks.
//
// Compact fallback fits inside a panel without disrupting the grid.

import { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";
import { captureException } from "../lib/sentry";
import { isLikelyStaleChunkError, requestStaleChunkReload } from "../lib/chunk-recovery";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { cn } from "../lib/utils";

interface Props {
  children: ReactNode;
  /** Friendly name shown in the fallback (e.g. "Recent Calls"). */
  label?: string;
  /** Optional override for the entire fallback UI. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export default class WidgetBoundary extends Component<Props, State> {
  declare props: Readonly<Props>;
  declare setState: Component<Props, State>["setState"];
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The same stale-chunk recovery the route-level ErrorBoundary performs, for
    // the same reason — and this boundary needs it more, not less.
    //
    // Since the Insights charts became `lazy()`, this is the *nearest* boundary
    // to a dynamic import, so it is the one that catches a 404 on a hashed chunk
    // after a deploy. Being caught here is terminal in a way it is not upstream:
    // React caches a rejected lazy payload, so the fallback's Retry button
    // re-renders the same rejection forever and the panel can never come back
    // without a manual hard reload. Nothing else would notice either — React 19
    // routes boundary-caught errors to `onCaughtError` (a bare console.error by
    // default), so neither the window `error` nor `unhandledrejection` handler
    // in main.tsx ever sees them.
    if (isLikelyStaleChunkError(error) && requestStaleChunkReload("widget-boundary")) {
      return;
    }

    // Send to Sentry with the widget label so we can group failures
    // by surface in the dashboard.
    if (import.meta.env.DEV) {
      console.error("WidgetBoundary caught:", this.props.label ?? "(unlabeled)", error, info);
    }
    captureException(error, {
      widget: this.props.label ?? "(unlabeled)",
      componentStack: info.componentStack,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        className={cn(
          "h-full flex flex-col items-center justify-center gap-3 p-6 text-center",
          "wl-panel rounded-md border border-border/60",
        )}
      >
        <div className="w-10 h-10 rounded-md flex items-center justify-center bg-destructive/10 border border-destructive/25">
          <AlertOctagon className="w-5 h-5 text-destructive" aria-hidden />
        </div>
        <div className="space-y-0.5">
          <p className="wl-label text-destructive">Widget unavailable</p>
          {this.props.label && (
            <p className="text-[length:var(--wireline-typography-caption-size)] text-foreground font-medium">
              {this.props.label}
            </p>
          )}
          <p className="text-caption max-w-[220px] mt-1">
            The rest of the page is fine. We&apos;ve logged the error.
          </p>
        </div>
        <ShadButton
          type="button"
          disableAnimations
          variant="outline"
          size="sm"
          onClick={this.reset}
          className="touch-press rounded-full hover:text-foreground hover:border-brand/25 gap-1.5"
        >
          <RefreshCw className="w-3 h-3" aria-hidden /> Retry
        </ShadButton>
      </div>
    );
  }
}
