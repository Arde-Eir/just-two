/**
 * useE2E.js
 * 
 * Full E2E key lifecycle. On every device login:
 * 1. Check IndexedDB for encrypted private key
 * 2. If missing (new device / cleared browser), check Supabase backup
 * 3. Restore from backup if found, prompt setup if not
 * 4. After unlock, derive shared key with partner
 */

import { useState, useEffect, useCallback } from "react";
import {
  generateKeyPair, importPublicKey, importPrivateKey,
  deriveSharedKey, encryptPrivateKey, decryptPrivateKey,
} from "../lib/crypto";
import {
  saveEncryptedPrivateKey, loadEncryptedPrivateKey, hasPrivateKey,
} from "../lib/keystore";
import {
  publishPublicKey, fetchOtherUserPublicKey,
  backupEncryptedPrivateKey, fetchEncryptedPrivateKeyBackup,
} from "../lib/api";
import {
  setSessionKeys, getSessionKeys, clearSessionKeys, hasSessionKeys,
} from "../lib/sessionKeys";

export function useE2E(user) {
  const [status, setStatus]         = useState("loading");
  const [error, setError]           = useState("");
  const [otherUserReady, setOtherUserReady] = useState(false);
  const [restoredFromBackup, setRestoredFromBackup] = useState(false);

  // ── On mount: check key status ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (hasSessionKeys()) { setStatus("ready"); return; }

    async function checkKeyStatus() {
      try {
        const localKeyExists = await hasPrivateKey(user.id);

        if (localKeyExists) {
          setStatus("need_unlock");
          return;
        }

        // No local key — check Supabase backup
        const backup = await fetchEncryptedPrivateKeyBackup(user.id);
        if (backup) {
          // Restore backup to IndexedDB, then ask for password to unlock
          await saveEncryptedPrivateKey(user.id, backup);
          setRestoredFromBackup(true);
          setStatus("need_unlock");
        } else {
          // Truly first time — generate new keys
          setStatus("need_setup");
        }
      } catch (err) {
        setError("Failed to check key status: " + err.message);
        setStatus("error");
      }
    }

    checkKeyStatus();
  }, [user]);

  // ── Poll for the other user's public key ──────────────────────────────────
  useEffect(() => {
    if (status !== "waiting" && status !== "ready") return;
    let cancelled = false;

    async function pollForOtherKey() {
      try {
        const other = await fetchOtherUserPublicKey(user.id);
        if (cancelled) return;

        if (other?.public_key) {
          const myKeys = getSessionKeys();
          if (!myKeys) return;

          const theirPublicCryptoKey = await importPublicKey(other.public_key);
          const sharedAesKey = await deriveSharedKey(myKeys.myPrivateCryptoKey, theirPublicCryptoKey);

          setSessionKeys({ myPrivateCryptoKey: myKeys.myPrivateCryptoKey, theirPublicCryptoKey, sharedAesKey });
          setOtherUserReady(true);
          setStatus("ready");
        } else {
          setStatus("waiting");
          setTimeout(pollForOtherKey, 5000);
        }
      } catch (err) {
        if (!cancelled) setError("Failed to fetch partner's key: " + err.message);
      }
    }

    pollForOtherKey();
    return () => { cancelled = true; };
  }, [status, user]);

  // ── First-time setup ──────────────────────────────────────────────────────
  const setupKeys = useCallback(async (password) => {
    setError("");
    try {
      const { publicKeyB64, privateKeyJwk } = await generateKeyPair();
      const encryptedBundle = await encryptPrivateKey(privateKeyJwk, password);

      // Save locally
      await saveEncryptedPrivateKey(user.id, encryptedBundle);
      // Backup to Supabase (still encrypted — server can't read it)
      await backupEncryptedPrivateKey(user.id, encryptedBundle);

      const myPrivateCryptoKey = await importPrivateKey(privateKeyJwk);
      setSessionKeys({ myPrivateCryptoKey, theirPublicCryptoKey: null, sharedAesKey: null });

      await publishPublicKey(user.id, publicKeyB64);
      setStatus("waiting");
    } catch (err) {
      setError("Key setup failed: " + err.message);
    }
  }, [user]);

  // ── Unlock ────────────────────────────────────────────────────────────────
  const unlockKeys = useCallback(async (password) => {
    setError("");
    try {
      let encryptedBundle = await loadEncryptedPrivateKey(user.id);

      // If still not in IndexedDB, try fetching backup one more time
      if (!encryptedBundle) {
        const backup = await fetchEncryptedPrivateKeyBackup(user.id);
        if (!backup) { setStatus("need_setup"); return; }
        await saveEncryptedPrivateKey(user.id, backup);
        encryptedBundle = backup;
      }

      let privateKeyJwk;
      try {
        privateKeyJwk = await decryptPrivateKey(encryptedBundle, password);
      } catch {
        setError("Incorrect password. Your private key could not be unlocked.");
        return;
      }

      const myPrivateCryptoKey = await importPrivateKey(privateKeyJwk);
      setSessionKeys({ myPrivateCryptoKey, theirPublicCryptoKey: null, sharedAesKey: null });

      // Also re-backup in case it was restored from Supabase to this device
      await backupEncryptedPrivateKey(user.id, encryptedBundle);

      setStatus("waiting");
    } catch (err) {
      setError("Failed to unlock keys: " + err.message);
    }
  }, [user]);

  // ── Lock ──────────────────────────────────────────────────────────────────
  const lock = useCallback(() => {
    clearSessionKeys();
    setStatus("need_unlock");
    setOtherUserReady(false);
  }, []);

  return { status, error, otherUserReady, restoredFromBackup, setupKeys, unlockKeys, lock };
}