import { useState, useEffect } from "react";
import { getSession, onAuthChange } from "../lib/api";

/**
 * useAuth
 * Returns { user, loading } and keeps state in sync with Supabase auth events.
 * - `user`    → null if signed out, User object if signed in
 * - `loading` → true during initial session check
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // 1. Check for existing session on mount
    getSession()
      .then((session) => {
        if (mounted) setUser(session?.user ?? null);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    // 2. Keep in sync with auth state changes (login, logout, token refresh)
    const subscription = onAuthChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}