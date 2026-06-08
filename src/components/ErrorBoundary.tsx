import { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RefreshCw, Home } from "lucide-react";
import { captureException } from "../lib/sentry";
import { cn } from "../lib/utils";
import { WL_APP_CLASSES } from "../lib/wireline-director-design";
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
 * app. With this, the operator sees a friendly recovery panel and the rest
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
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught:", error, info);
    }
    captureException(error, { componentStack: info.componentStack });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    // Use `in` so an explicit `fallback={null}` (used by App.tsx to
    // silently drop non-critical lazy chrome on chunk-load failure)
    // is honored. A truthy check would treat null as "no fallback"
    // and render the full crash panel instead, which is the opposite
    // of what those callers want.
    if ("fallback" in this.props) return this.props.fallback;

    return (
      <div className="min-h-[70svh] flex items-center justify-center p-6">
        <div className={cn(WL_APP_CLASSES.panelFrame, "max-w-xl w-full")}>
          <div className="relative p-8 md:p-10 space-y-6">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full max-w-[50vw] max-h-[50vw] sm:max-w-none sm:max-h-none opacity-30 blur-3xl pointer-events-none bg-[radial-gradient(circle,#E8466A,transparent)]" />
            <div className="relative z-10 flex items-center gap-4">
              <div className="w-14 h-14 rounded-md flex items-center justify-center bg-rose-500/15 border border-rose-500/30">
                <AlertOctagon className="w-7 h-7 text-rose-500" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-rose-500">
                  Something broke
                </div>
                <h2 className="font-display italic text-3xl text-ink leading-tight mt-1">
                  This view crashed
                </h2>
              </div>
            </div>
            <p className="relative z-10 text-sm text-ink/65 leading-relaxed">
              The rest of the app is fine — only this view failed. Reload the page or head back to
              the dashboard.
            </p>
            <details className="relative z-10 rounded-md bg-ink/[0.03] border border-black/8 dark:bg-white/[0.04] dark:border-white/[0.08] p-4 text-xs text-ink/70 font-mono overflow-x-auto">
              <summary className="cursor-pointer text-[10px] uppercase tracking-[0.3em] text-muted hover:text-ink transition-colors">
                Error details
              </summary>
              <pre className="mt-3 whitespace-pre-wrap break-words">{this.state.error.message}</pre>
            </details>
            <div className="relative z-10 flex flex-wrap gap-3">
              <ShadButton
                variant="editorial"
                onClick={this.reset}
                disableAnimations
                className="!py-3 !px-6 !text-[11px] !tracking-[0.3em]"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Try Again
              </ShadButton>
              <ShadButton
                variant="outline"
                asChild
                disableAnimations
                className="!text-[11px] !tracking-[0.3em] uppercase"
              >
                <a href="/" className="flex items-center gap-2">
                  <Home className="w-3.5 h-3.5" /> Back to Dashboard
                </a>
              </ShadButton>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
