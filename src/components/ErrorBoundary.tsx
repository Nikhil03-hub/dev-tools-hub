import { Component, type ReactNode } from "react";

/**
 * Per-tool boundary. "Your input is still here" is only true because the tool's
 * state lives in the component that crashed, not in this boundary — resetting
 * remounts the tree, which is the escape hatch when a tool is unusable.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-[14px] font-semibold text-ink">This tool hit an error. Your input is still here.</p>
          <button
            type="button"
            onClick={() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))}
            className="focus-ring inline-flex h-9 items-center rounded-lg border border-border bg-raised px-3 text-[13px] font-medium text-ink transition-colors hover:border-accent/40"
          >
            Reset tool
          </button>
        </div>
      );
    }
    return <div key={this.state.attempt} className="h-full">{this.props.children}</div>;
  }
}
