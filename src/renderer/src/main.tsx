import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RendererErrorBoundary } from "./components/RendererErrorBoundary";
import "./styles.css";

function registerRendererCrashReporting(): void {
  window.addEventListener("error", (event) => {
    void window.continuity?.reportRendererCrash({
      message: event.message,
      stack: event.error?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    void window.continuity?.reportRendererCrash({
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

const rootEl = document.getElementById("root");

if (!window.continuity) {
  if (rootEl) {
    rootEl.innerHTML = `
      <div class="app-shell loading">
        <p>Continuity preload bridge did not initialize.</p>
        <p class="muted small">Restart the app after <code>npm run dev</code> or <code>npm run build</code>.</p>
      </div>
    `;
  }
} else {
  registerRendererCrashReporting();
  createRoot(rootEl!).render(
    <StrictMode>
      <RendererErrorBoundary>
        <App />
      </RendererErrorBoundary>
    </StrictMode>,
  );
}
