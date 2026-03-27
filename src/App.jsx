import React from "react";
import { useAuth } from "./hooks/useAuth";
import { useE2E } from "./hooks/useE2E";
import { AuthPage } from "./pages/AuthPage";
import { FeedPage } from "./pages/FeedPage";
import { KeySetupScreen } from "./components/KeySetupScreen";
import { Spinner } from "./components/UI";
import { clearSessionKeys } from "./lib/sessionKeys";
import { clearPlaintextCache } from "./lib/plaintextCache";
import { signOut } from "./lib/api";
import "./styles/global.css";

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { status, error: e2eError, setupKeys, unlockKeys, lock, restoredFromBackup } = useE2E(user);

  async function handleSignOut() {
    lock();
    clearSessionKeys();
    // Don't clear plaintext cache on sign out so posts still readable next login
    // clearPlaintextCache(); — only call this if you want full wipe
    await signOut();
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }}>
        <Spinner size={28} />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }}>
        <Spinner size={28} />
      </div>
    );
  }

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

  return <FeedPage user={user} onSignOut={handleSignOut} />;
}