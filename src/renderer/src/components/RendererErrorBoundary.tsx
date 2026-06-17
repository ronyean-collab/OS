import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/** Prevents a single render failure from leaving a blank Electron window. */
export class RendererErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[continuity] renderer error boundary", error, info.componentStack);
    }
    void window.continuity?.reportRendererCrash({
      message: error.message,
      stack: error.stack,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      const showStack = import.meta.env.DEV && this.state.error.stack;
      return (
        <div className="app-shell loading renderer-error-fallback" role="alert">
          <h1>Something went wrong</h1>
          <p className="muted small">{this.state.error.message}</p>
          {showStack ? (
            <pre className="renderer-error-stack mono small" data-testid="renderer-error-stack">
              {this.state.error.stack}
            </pre>
          ) : null}
          <button type="button" className="small-btn" onClick={this.handleReload}>
            Reload ContinuityOS
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
