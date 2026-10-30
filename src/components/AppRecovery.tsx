import { Component, type ReactNode } from "react";

// An unexpected render failure must never remove every control and leave only
// the dark body. The library is on disk; a safe-graphics reload can recover it.
export class AppRecovery extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("Inkling renderer recovered from an unexpected error", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <h1>Inkling couldn’t display this view.</h1>
        <p>Your saved library is still on this computer.</p>
        <button
          type="button"
          className="rounded-xl border border-border px-5 py-3"
          onClick={() => {
            const url = new URL(location.href);
            url.searchParams.set("safeGraphics", "1");
            location.replace(url.href);
          }}
        >
          Reopen library with safe graphics
        </button>
      </main>
    );
  }
}
