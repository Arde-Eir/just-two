import React from "react";

// ── Button ─────────────────────────────────────────────────────────────────
export function Button({
  children,
  variant = "primary", // primary | ghost | danger | icon
  size = "md",          // sm | md | lg
  disabled,
  loading,
  onClick,
  type = "button",
  title,
  style,
  ...rest
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "none",
    borderRadius: "var(--radius-md)",
    fontFamily: "var(--font-body)",
    fontWeight: 500,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.55 : 1,
    transition: "background var(--duration-fast), opacity var(--duration-fast), transform var(--duration-fast)",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const sizes = {
    sm:   { padding: "6px 12px", fontSize: 13 },
    md:   { padding: "9px 18px", fontSize: 14 },
    lg:   { padding: "12px 24px", fontSize: 15 },
    icon: { padding: 8, fontSize: 16, borderRadius: "var(--radius-md)" },
  };

  const variants = {
    primary: {
      background: "var(--color-text-1)",
      // Always use --color-on-text-1 so it's readable in both themes
      color: "var(--color-on-text-1)",
    },
    ghost: {
      background: "transparent",
      color: "var(--color-text-2)",
      border: "0.5px solid var(--color-border-md)",
    },
    danger: {
      background: "var(--color-danger-bg)",
      color: "var(--color-danger)",
      border: "0.5px solid rgba(192,57,43,0.18)",
    },
    icon: {
      background: "transparent",
      color: "var(--color-text-3)",
      border: "none",
    },
  };

  const finalSize = variant === "icon" ? sizes.icon : sizes[size];

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      style={{ ...base, ...finalSize, ...variants[variant], ...style }}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

// ── Spinner ────────────────────────────────────────────────────────────────
export function Spinner({ size = 16 }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `2px solid currentColor`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
      aria-label="Loading"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

// ── Input ──────────────────────────────────────────────────────────────────
export function Input({ label, id, error, style, ...rest }) {
  const inputStyle = {
    display: "block",
    width: "100%",
    padding: "10px 14px",
    border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border-md)"}`,
    borderRadius: "var(--radius-md)",
    background: "var(--color-surface)",
    color: "var(--color-text-1)",
    fontSize: 14,
    outline: "none",
    transition: "border-color var(--duration-fast), box-shadow var(--duration-fast)",
    ...style,
  };
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-text-2)",
            marginBottom: 5,
            letterSpacing: "0.03em",
          }}
        >
          {label}
        </label>
      )}
      <input id={id} style={inputStyle} {...rest} />
      {error && (
        <p style={{ fontSize: 12, color: "var(--color-danger)", marginTop: 4 }}>{error}</p>
      )}
    </div>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: "#EAF3DE", fg: "#27500A" }, // green
  { bg: "#E6F1FB", fg: "#0C447C" }, // blue
  { bg: "#FAEEDA", fg: "#633806" }, // amber
  { bg: "#FBEAF0", fg: "#72243E" }, // pink
];

export function Avatar({ email, size = 38 }) {
  const idx = email ? email.charCodeAt(0) % AVATAR_COLORS.length : 0;
  const { bg, fg } = AVATAR_COLORS[idx];
  const initial = email ? email[0].toUpperCase() : "?";
  return (
    <div
      aria-label={`Avatar for ${email}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 500,
        fontSize: Math.floor(size * 0.38),
        flexShrink: 0,
        userSelect: "none",
        fontFamily: "var(--font-display)",
        fontStyle: "italic",
      }}
    >
      {initial}
    </div>
  );
}

// ── ErrorBanner ────────────────────────────────────────────────────────────
export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        background: "var(--color-danger-bg)",
        border: "0.5px solid rgba(192,57,43,0.25)",
        borderRadius: "var(--radius-md)",
        padding: "10px 14px",
        fontSize: 13,
        color: "var(--color-danger)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 12,
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
          }}
          aria-label="Dismiss error"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ── CharCounter ────────────────────────────────────────────────────────────
export function CharCounter({ current, max }) {
  const pct = current / max;
  const color =
    pct > 0.9 ? "var(--color-danger)" :
    pct > 0.75 ? "#B87333" :
    "var(--color-text-3)";
  return (
    <span style={{ fontSize: 12, color, fontVariantNumeric: "tabular-nums" }}>
      {current}/{max}
    </span>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────
export function Divider({ style }) {
  return (
    <hr style={{ border: "none", borderTop: "0.5px solid var(--color-border)", ...style }} />
  );
}