import React, { useState } from "react";
import { signOut } from "../lib/api";
import { Avatar, Button } from "./UI";
import { APP_NAME } from "../lib/constants";

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
  </svg>
);

export function Header({ user, theme, onToggleTheme }) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try { await signOut(); } catch {}
    setLoading(false);
  }

  return (
    <header style={s.header} role="banner">
      <span style={s.logo}>✦ {APP_NAME}</span>
      <div style={s.right}>
        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          style={s.themeBtn}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <Avatar email={user.email} size={28} />
        <span style={s.email}>{user.email}</span>
        <Button variant="ghost" size="sm" onClick={handleSignOut} loading={loading}>
          sign out
        </Button>
      </div>
    </header>
  );
}

const s = {
  header: {
    position: "sticky", top: 0,
    background: "rgba(var(--color-bg-rgb, 245,243,238),0.88)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderBottom: "0.5px solid var(--color-border-md)",
    padding: "12px 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    zIndex: 100,
    background: "var(--color-surface)",
    transition: "background 0.25s ease",
  },
  logo: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 17, color: "var(--color-text-1)" },
  right: { display: "flex", alignItems: "center", gap: 10 },
  email: { fontSize: 12, color: "var(--color-text-3)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  themeBtn: {
    background: "var(--color-surface-2)",
    border: "0.5px solid var(--color-border-md)",
    borderRadius: "var(--radius-md)",
    padding: 7,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--color-text-2)",
    cursor: "pointer",
    transition: "background var(--duration-fast), color var(--duration-fast)",
  },
};