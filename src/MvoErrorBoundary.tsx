import React from "react";

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
  stack?: string;
};

const CACHE_KEYS = [
  "mvo-active-profile",
  "mvo-theme",
  "mvo-scale-mode",
  "mvo-manual-games",
  "mvo-game-profiles",
  "mvo-recent-games",
  "mvo-api-status",
];

function resetMvoCache() {
  try {
    CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  } finally {
    window.location.reload();
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showHardCrash(message: string, stack?: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.style.minHeight = "100vh";
  wrap.style.display = "grid";
  wrap.style.placeItems = "center";
  wrap.style.background = "radial-gradient(circle at center, rgba(0,174,255,.16), transparent 35%), #02060d";
  wrap.style.color = "#f3f8ff";
  wrap.style.fontFamily = "Inter, Segoe UI, system-ui, Arial, sans-serif";
  wrap.style.padding = "24px";
  wrap.innerHTML = `
    <div style="width:min(820px,92vw);border:1px solid rgba(0,174,255,.45);border-radius:18px;background:rgba(5,14,24,.94);box-shadow:0 0 60px rgba(0,125,255,.25);padding:26px;">
      <h1 style="margin:0 0 10px;letter-spacing:2px;">MVO Hub UI Guard</h1>
      <p style="color:#9db7d4;line-height:1.55;">The app hit a startup error. This guard is showing instead of a white screen.</p>
      <pre style="white-space:pre-wrap;max-height:320px;overflow:auto;padding:14px;border-radius:10px;background:rgba(0,0,0,.32);color:#ffb8c8;">${escapeHtml(message)}${stack ? "\n\n" + escapeHtml(stack) : ""}</pre>
      <button id="mvo-reset-cache" style="height:46px;padding:0 18px;border-radius:8px;border:1px solid rgba(0,234,255,.65);background:linear-gradient(135deg,#109dff,#006dff);color:white;font-weight:800;cursor:pointer;">Reset MVO Cache + Reload</button>
    </div>`;
  root.appendChild(wrap);
  document.getElementById("mvo-reset-cache")?.addEventListener("click", resetMvoCache);
}

window.addEventListener("error", (event) => {
  showHardCrash(event.message || "Unknown window error", event.error?.stack);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  showHardCrash(reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
});

class MvoErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
  }

  componentDidCatch(error: unknown) {
    console.error("MVO Hub UI crash:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at center, rgba(0,174,255,.16), transparent 35%), #02060d",
        color: "#f3f8ff",
        fontFamily: "Inter, Segoe UI, system-ui, Arial, sans-serif",
        padding: 24,
      }}>
        <div style={{
          width: "min(760px, 92vw)",
          border: "1px solid rgba(0,174,255,.45)",
          borderRadius: 18,
          background: "rgba(5, 14, 24, .94)",
          boxShadow: "0 0 60px rgba(0,125,255,.25)",
          padding: 26,
        }}>
          <h1 style={{ margin: "0 0 10px", letterSpacing: 2 }}>MVO Hub UI Guard</h1>
          <p style={{ color: "#9db7d4", lineHeight: 1.55 }}>
            React crashed after loading. This screen prevents a plain white screen.
          </p>
          <pre style={{
            whiteSpace: "pre-wrap",
            maxHeight: 260,
            overflow: "auto",
            padding: 14,
            borderRadius: 10,
            background: "rgba(0,0,0,.32)",
            color: "#ffb8c8",
          }}>{this.state.message}{this.state.stack ? `\n\n${this.state.stack}` : ""}</pre>
          <button onClick={resetMvoCache} style={{
            height: 46,
            padding: "0 18px",
            borderRadius: 8,
            border: "1px solid rgba(0,234,255,.65)",
            background: "linear-gradient(135deg, #109dff, #006dff)",
            color: "white",
            fontWeight: 800,
            cursor: "pointer",
          }}>Reset MVO Cache + Reload</button>
        </div>
      </div>
    );
  }
}

export { MvoErrorBoundary };