import { WL_APP_CLASSES } from "../lib/wireline-design-system";
import { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RefreshCw, Home } from "lucide-react";
import { isLikelyStaleChunkError, requestStaleChunkReload } from "../lib/chunk-recovery";
import { captureException } from "../lib/sentry";
import {
  isDomReconciliationError,
  requestDomReconciliationReload,
} from "../lib/dom-reconciliation-recovery";
import { cn } from "../lib/utils";

import { ShadButton } from "./ui/shadcn/ShadButton";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors anywhere in the React tree below it. Without this,
 * a single broken component (e.g. malformed API response) blanks the whole
 * app. With this, the Account Holder sees a friendly recovery panel and the rest
 * of the shell — sidebar, command bar, navigation — keeps working.
 */
export default class ErrorBoundary extends Component<Props, State> {
  // Re-declare inherited members so the strict TS config recognises them
  // even when class-field semantics interact oddly with React 19 types.
  declare props: Readonly<Props>;
  declare setState: Component<Props, State>["setState"];
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isLikelyStaleChunkError(error) && requestStaleChunkReload("error-boundary")) {
      return;
    }

    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught:", error, info);
    }
    const domReconciliation = isDomReconciliationError(error);
    captureException(error, {
      componentStack: info.componentStack,
      errorClass: domReconciliation ? "dom_reconciliation" : "react_boundary",
    });
    if (domReconciliation) requestDomReconciliationReload(error, "error-boundary");
  }

  reset = () => this.setState({ error: null });
  reload = () => window.location.reload();

  /**
   * ErrorBoundary sits above AuthProvider so it catches marketing crashes too.
   * If the crashed route is public (marketing, legal, auth), the recovery link
   * should go home — not `/overview`, which forces a redirect to /signin for
   * signed-out visitors and drops them into a login wall on top of the crash.
   */
  private recoveryHref(): { href: string; label: string } {
    if (typeof window === "undefined") return { href: "/", label: "Back home" };
    const path = window.location.pathname;
    const isWorkspace =
      /^\/(?:overview|studio|agents|approvals|call-logs|logs|inbox|phone|knowledge|insights|connections|settings|apps|admin|billing|audit|dnc|templates|onboarding)/.test(
        path,
      );
    if (isWorkspace) return { href: "/overview", label: "Back to workspace" };
    return { href: "/", label: "Back home" };
  }

  render() {
    if (!this.state.error) return this.props.children;
    // Use `in` so an explicit `fallback={null}` (used by App.tsx to
    // silently drop non-critical lazy chrome on chunk-load failure)
    // is honored. A truthy check would treat null as "no fallback"
    // and render the full crash panel instead, which is the opposite
    // of what those callers want.
    if ("fallback" in this.props) return this.props.fallback;

    const staleChunk = isLikelyStaleChunkError(this.state.error);
    const title = staleChunk ? "Wireline updated" : "This view crashed";
    const body = staleChunk
      ? "A new version is available. Reload once to fetch the current app bundle and keep working."
      : "The rest of the app is fine — only this view failed. Try again, reload, or head back to the workspace.";

    return (
      <div className="flex min-h-[70svh] items-center justify-center p-6">
        <div className={cn(WL_APP_CLASSES.panelFrame, "w-full max-w-xl")}>
          <div className="relative space-y-6 p-8 md:p-10">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 max-h-[50vw] w-64 max-w-[50vw] rounded-full bg-[radial-gradient(circle,var(--wireline-color-status-error),transparent)] opacity-30 blur-3xl sm:max-h-none sm:max-w-none" />
            <div className="relative z-10 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/15">
                <AlertOctagon className="h-7 w-7 text-rose-500" />
              </div>
              <div>
                <div className="wl-label text-rose-500">
                  {staleChunk ? "Update required" : "Something broke"}
                </div>
                <h2 className="mt-1 font-display text-3xl italic leading-tight text-foreground">
                  {title}
                </h2>
              </div>
            </div>
            <p className="relative z-10 text-sm leading-relaxed text-foreground/65">{body}</p>
            {import.meta.env.DEV ? (
              <details className="relative z-10 overflow-x-auto rounded-md border border-border bg-muted/10 p-4 font-mono text-xs text-foreground/70">
                <summary className="wl-label-muted cursor-pointer transition-colors hover:text-foreground">
                  Error details
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-words">
                  {this.state.error.message}
                </pre>
              </details>
            ) : null}
            <div className="relative z-10 flex flex-wrap gap-3">
              <ShadButton
                variant="editorial"
                onClick={staleChunk ? this.reload : this.reset}
                disableAnimations
                className="!px-6 !py-3 !text-[var(--wireline-typography-overline-size)] !tracking-[0.3em]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> {staleChunk ? "Reload" : "Try Again"}
              </ShadButton>
              <ShadButton
                variant="outline"
                asChild
                disableAnimations
                className="!text-[var(--wireline-typography-overline-size)] !uppercase !tracking-[0.3em]"
              >
                <a href={this.recoveryHref().href} className="flex items-center gap-2">
                  <Home className="h-3.5 w-3.5" /> {this.recoveryHref().label}
                </a>
              </ShadButton>
              {!staleChunk ? (
                <ShadButton
                  variant="outline"
                  onClick={this.reload}
                  disableAnimations
                  className="!text-[var(--wireline-typography-overline-size)] !uppercase !tracking-[0.3em]"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Reload
                </ShadButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
