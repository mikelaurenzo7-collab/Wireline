// WidgetBoundary — small inline error boundary for individual dashboard
// widgets / panels. The route-level <ErrorBoundary> handles whole-page
// crashes; this scoped boundary keeps the rest of the dashboard
// rendering when a single widget breaks.
//
// Compact fallback fits inside a panel without disrupting the grid.

import { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";
import { captureException } from "../lib/sentry";
import { ShadButton } from "./ui/shadcn/ShadButton";

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
    // Send to Sentry with the widget label so we can group failures
    // by surface in the dashboard.
    console.error("WidgetBoundary caught:", this.props.label ?? "(unlabeled)", error, info);
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
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="w-10 h-10 rounded-md flex items-center justify-center bg-rose-500/12 border border-rose-500/30">
          <AlertOctagon className="w-5 h-5 text-rose-400" />
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-[0.4em] text-rose-400">Widget unavailable</p>
          {this.props.label && (
            <p className="text-[11px] text-ink/80 font-medium">{this.props.label}</p>
          )}
          <p className="text-[10px] text-muted/70 max-w-[220px] leading-relaxed mt-1">
            The rest of the page is fine. We've logged the error.
          </p>
        </div>
        <ShadButton
          type="button"
          disableAnimations
          variant="outline"
          size="sm"
          onClick={this.reset}
          className="rounded-full text-[10px] uppercase tracking-[0.28em] text-ink/70 hover:text-ink hover:border-brand/25"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </ShadButton>
      </div>
    );
  }
}
