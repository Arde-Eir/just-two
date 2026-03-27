import React, { useState } from "react";
import { signOut } from "../lib/api";
import { Avatar, Button } from "./UI";
import { APP_NAME } from "../lib/constants";

export function Header({ user }) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await signOut();
    } catch {
      // Even if signOut fails, the auth state listener clears local session
    }
    setLoading(false);
  }

  return (
    <header style={s.header} role="banner">
      <span style={s.logo}>✦ {APP_NAME}</span>
      <div style={s.right}>
        <Avatar email={user.email} size={28} />
        <span style={s.email}>{user.email}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          loading={loading}
          aria-label="Sign out"
        >
          sign out
        </Button>
      </div>
    </header>
  );
}

const s = {
  header: {
    position: "sticky",
    top: 0,
    background: "rgba(245,243,238,0.88)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderBottom: "0.5px solid var(--color-border-md)",
    padding: "12px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 100,
  },
  logo: {
    fontFamily: "var(--font-display)",
    fontStyle: "italic",
    fontSize: 17,
    color: "var(--color-text-1)",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  email: {
    fontSize: 12,
    color: "var(--color-text-3)",
    maxWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};