import React from "react";
import { useAuth } from "./hooks/useAuth";
import { useE2E } from "./hooks/useE2E";
import { useTheme } from "./hooks/useTheme";
import { AuthPage } from "./pages/AuthPage";
import { FeedPage } from "./pages/FeedPage";
import { KeySetupScreen } from "./components/KeySetupScreen";
import { Spinner } from "./components/UI";
import { clearSessionKeys } from "./lib/sessionKeys";
import { signOut } from "./lib/api";
import "src/styles/global.css";

export default function App() {
  const { user, loading: authLoading }                          = useAuth();
  const { status, error: e2eError, setupKeys, unlockKeys, lock, restoredFromBackup } = useE2E(user);
  const { theme, toggle: toggleTheme }                          = useTheme();

  async function handleSignOut() {
    lock();
    clearSessionKeys();
    await signOut();
  }

  const loadingScreen = (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }}>
      <Spinner size={28} />
    </div>
  );

  if (authLoading) return loadingScreen;
  if (!user) return <AuthPage />;
  if (status === "loading") return loadingScreen;

  if (status !== "ready") {
    return (
      <KeySetupScreen
        status={status}
        e2eError={e2eError}
        onSetup={setupKeys}
        onUnlock={unlockKeys}
        restoredFromBackup={restoredFromBackup}
      />
    );
  }

  return <FeedPage user={user} onSignOut={handleSignOut} theme={theme} onToggleTheme={toggleTheme} />;
}