import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

if (!window.api && !window.nightOps) {
  console.error("preload API not found");
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Renderer error"
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            color: "var(--text-main)",
            background: "linear-gradient(180deg, #20242a 0%, #1e2227 100%)"
          }}
        >
          <div
            style={{
              width: "min(640px, 100%)",
              background: "rgba(37, 42, 48, 0.96)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "16px",
              boxShadow: "var(--shadow)"
            }}
          >
            <strong>NightOps failed to render</strong>
            <div style={{ marginTop: "8px", color: "var(--text-sub)" }}>{this.state.message}</div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
