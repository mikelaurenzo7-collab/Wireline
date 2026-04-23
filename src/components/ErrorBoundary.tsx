import React, { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FBFBFB] flex items-center justify-center p-8">
          <div className="max-w-2xl w-full brutal-card !p-12 text-center bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
            <div className="w-24 h-24 bg-rose-500 brutal-border flex items-center justify-center mx-auto mb-10 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <AlertTriangle className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-black text-ink uppercase tracking-tight font-display italic mb-6 leading-none">
              System Signal Failure
            </h1>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-10 leading-loose">
              An unexpected anomaly occurred in the UI kernel. The fleet remains operational, but the interface requires a reset.
            </p>
            <div className="bg-rose-50 brutal-border border-rose-200 p-6 mb-10 text-left overflow-auto max-h-32">
              <code className="text-xs font-mono text-rose-950 font-bold uppercase">
                {this.state.error?.message || "Unknown Core Exception"}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="brutal-btn !bg-ink !text-brand !py-5 !px-10 flex items-center justify-center gap-4 mx-auto w-full md:w-auto"
            >
              <RotateCcw className="w-6 h-6" />
              RE-ESTABLISH LINK
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
