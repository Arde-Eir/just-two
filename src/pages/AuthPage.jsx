import React, { useState } from "react";
import { signIn, signUp } from "../lib/api";
import { isValidEmail, validatePassword } from "../lib/validation";
import { Button, Input, ErrorBanner } from "../components/UI";
import { APP_NAME, APP_TAGLINE } from "../lib/constants";
export function AuthPage() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  function validate() {
    const errs = {};
    if (!isValidEmail(email)) errs.email = "Enter a valid email address.";

    if (mode === "signup") {
      const pwCheck = validatePassword(password);
      if (!pwCheck.ok) errs.password = pwCheck.error;
      if (password !== confirmPassword) errs.confirmPassword = "Passwords do not match.";
    } else {
      if (!password) errs.password = "Password is required.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setGlobalError("");
    setSuccessMsg("");
    if (!validate()) return;

    setLoading(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        // onAuth is triggered by the Supabase auth state listener in useAuth()
      } else {
        await signUp(email, password);
        setSuccessMsg("Account created! Check your email to confirm before signing in.");
        setMode("login");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      // Supabase returns fairly safe error messages
      // Map known errors to user-friendly messages
      console.error("Auth Error:", err);
      const msg = err.message ?? "Something went wrong. Please try again.";
      if (msg.includes("Invalid login credentials")) {
        setGlobalError("Incorrect email or password.");
      } else if (msg.includes("Email not confirmed")) {
        setGlobalError("Please confirm your email before signing in.");
      } else if (msg.includes("User already registered")) {
        setGlobalError("This email is already registered. Try signing in.");
      } else if (msg.includes("Signups not allowed")) {
        setGlobalError("Sign-ups are currently disabled. Contact the app owner.");
      } else {
        setGlobalError(msg);
      }
    }
    setLoading(false);
  }

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    setErrors({});
    setGlobalError("");
    setSuccessMsg("");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <div style={s.wrap}>
      <div className="fade-up" style={s.card}>
        <div style={s.logo}>✦</div>
        <h1 style={s.title}>{APP_NAME}</h1>
        <p style={s.sub}>{APP_TAGLINE}</p>

        {successMsg && (
          <div style={s.successBanner} role="status">{successMsg}</div>
        )}

        <ErrorBanner message={globalError} onDismiss={() => setGlobalError("")} />

        <form onSubmit={handleSubmit} noValidate style={{ width: "100%" }}>
          <Input
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            disabled={loading}
            required
          />
          <Input
            id="password"
            label="Password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "signup" ? "Min 8 chars, 1 uppercase, 1 number" : "••••••••"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            disabled={loading}
            required
          />
          {mode === "signup" && (
            <Input
              id="confirmPassword"
              label="Confirm Password"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={errors.confirmPassword}
              disabled={loading}
              required
            />
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            style={{ width: "100%", marginTop: 4, fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            {mode === "login" ? "sign in" : "create account"}
          </Button>
        </form>

        <Button variant="ghost" size="sm" onClick={switchMode} style={{ marginTop: 12 }}>
          {mode === "login" ? "no account? sign up" : "have an account? sign in"}
        </Button>
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
    padding: "48px 40px",
    width: "100%",
    maxWidth: 380,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  },
  logo: { fontSize: 40, marginBottom: 4 },
  title: {
    fontFamily: "var(--font-display)",
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: 30,
    color: "var(--color-text-1)",
    letterSpacing: "-0.5px",
    marginBottom: 2,
  },
  sub: {
    fontSize: 13,
    color: "var(--color-text-3)",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 1.5,
  },
  successBanner: {
    width: "100%",
    background: "var(--color-accent-bg)",
    border: "0.5px solid rgba(59,109,17,0.25)",
    borderRadius: "var(--radius-md)",
    padding: "10px 14px",
    fontSize: 13,
    color: "var(--color-accent-text)",
    marginBottom: 8,
  },
};