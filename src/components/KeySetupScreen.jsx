import React, { useState } from "react";
import { Button, Input, ErrorBanner } from "./UI";

/**
 * KeySetupScreen
 * Shown when:
 *  - status === "need_setup"   → generate new keys (first time on this device)
 *  - status === "need_unlock"  → decrypt existing keys with password
 *  - status === "waiting"      → keys ready, waiting for the other person
 *  - status === "error"        → show error
 */
export function KeySetupScreen({ status, e2eError, onSetup, onUnlock }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSetup(e) {
    e.preventDefault();
    setLocalError("");
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setLocalError("Passwords do not match.");
      return;
    }
    setLoading(true);
    await onSetup(password);
    setLoading(false);
  }

  async function handleUnlock(e) {
    e.preventDefault();
    setLocalError("");
    if (!password) {
      setLocalError("Enter your encryption password.");
      return;
    }
    setLoading(true);
    await onUnlock(password);
    setLoading(false);
  }

  if (status === "waiting") {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.icon}>🔑</div>
          <h2 style={s.title}>waiting for your partner</h2>
          <p style={s.body}>
            Your encryption keys are ready. As soon as the other person signs in and sets up
            their keys, the feed will unlock automatically.
          </p>
          <div style={s.pulse} aria-label="Waiting" />
        </div>
      </div>
    );
  }

  if (status === "need_setup") {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.icon}>🔐</div>
          <h2 style={s.title}>set up encryption</h2>
          <p style={s.body}>
            Create a <strong>local encryption password</strong>. This protects your private key
            on this device. It is separate from your login password and is{" "}
            <strong>never sent to any server</strong>.
          </p>
          <p style={s.warning}>
            ⚠️ If you forget this password, you cannot recover your encryption keys.
            Write it down somewhere safe.
          </p>
          <ErrorBanner message={localError || e2eError} onDismiss={() => setLocalError("")} />
          <form onSubmit={handleSetup} style={{ width: "100%" }} noValidate>
            <Input
              id="ep"
              label="Encryption password"
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
            />
            <Input
              id="ep2"
              label="Confirm encryption password"
              type="password"
              placeholder="Repeat password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
            />
            <Button type="submit" variant="primary" size="lg" loading={loading}
              style={{ width: "100%", fontFamily: "var(--font-display)", fontStyle: "italic" }}>
              generate keys & continue
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (status === "need_unlock") {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.icon}>🔓</div>
          <h2 style={s.title}>unlock encryption</h2>
          <p style={s.body}>
            Enter your <strong>local encryption password</strong> to unlock your private key
            for this session.
          </p>
          <ErrorBanner message={localError || e2eError} onDismiss={() => setLocalError("")} />
          <form onSubmit={handleUnlock} style={{ width: "100%" }} noValidate>
            <Input
              id="ep"
              label="Encryption password"
              type="password"
              placeholder="Your encryption password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              required
            />
            <Button type="submit" variant="primary" size="lg" loading={loading}
              style={{ width: "100%", fontFamily: "var(--font-display)", fontStyle: "italic" }}>
              unlock
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // "error" or "loading"
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.icon}>⚠️</div>
        <h2 style={s.title}>encryption error</h2>
        <p style={s.body}>{e2eError || "An unexpected error occurred."}</p>
      </div>
    </div>
  );
}

const s = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--color-bg)",
    padding: 16,
  },
  card: {
    background: "var(--color-surface)",
    border: "0.5px solid var(--color-border-md)",
    borderRadius: "var(--radius-xl)",
    padding: "44px 40px",
    width: "100%",
    maxWidth: 400,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  },
  icon: { fontSize: 40, marginBottom: 4 },
  title: {
    fontFamily: "var(--font-display)",
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: 22,
    color: "var(--color-text-1)",
    textAlign: "center",
    margin: 0,
  },
  body: {
    fontSize: 14,
    color: "var(--color-text-2)",
    textAlign: "center",
    lineHeight: 1.6,
    margin: 0,
  },
  warning: {
    fontSize: 13,
    color: "#856404",
    background: "#fff3cd",
    border: "0.5px solid #ffc107",
    borderRadius: "var(--radius-md)",
    padding: "10px 14px",
    width: "100%",
    lineHeight: 1.5,
  },
  pulse: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "var(--color-accent)",
    animation: "pulse 1.5s ease-in-out infinite",
    marginTop: 8,
  },
};

// Add pulse animation to document head once
if (typeof document !== "undefined" && !document.getElementById("pulse-style")) {
  const style = document.createElement("style");
  style.id = "pulse-style";
  style.textContent = `@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.85)} }`;
  document.head.appendChild(style);
}