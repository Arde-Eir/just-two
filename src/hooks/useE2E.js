/**
 * useE2E.js — Manages the full E2E encryption lifecycle.
 *
 * States:
 *   "loading"       — checking if keys exist
 *   "need_setup"    — first time on this device, need to generate keys
 *   "need_unlock"   — keys exist locally but session expired, need password to decrypt
 *   "waiting"       — keys set up, waiting for the other user to publish their key
 *   "ready"         — both keys available, sharedKey derived, encryption active
 *   "error"         — something went wrong
 */

import { useState, useEffect, useCallback } from "react";
import {
  generateKeyPair,
  importPublicKey,
  importPrivateKey,
  deriveSharedKey,
  encryptPrivateKey,
  decryptPrivateKey,
} from "../lib/crypto";
import {
  saveEncryptedPrivateKey,
  loadEncryptedPrivateKey,
  hasPrivateKey,
} from "../lib/keystore";
import {
  publishPublicKey,
  fetchOtherUserPublicKey,
} from "../lib/api";
import {
  setSessionKeys,
  getSessionKeys,
  clearSessionKeys,
  hasSessionKeys,
} from "../lib/sessionKeys";

export function useE2E(user) {
  const [status, setStatus] = useState("loading"); // see states above
  const [error, setError] = useState("");
  const [otherUserReady, setOtherUserReady] = useState(false);

  // ── On mount: determine what state we're in ──────────────────────────────
  useEffect(() => {
    if (!user) return;

    // If session keys are already in memory (e.g. hook remounted), skip setup
    if (hasSessionKeys()) {
      setStatus("ready");
      return;
    }

    async function checkKeyStatus() {
      try {
        const localKeyExists = await hasPrivateKey(user.id);
        if (!localKeyExists) {
          setStatus("need_setup");
        } else {
          setStatus("need_unlock");
        }
      } catch (err) {
        setError("Failed to check key status: " + err.message);
        setStatus("error");
      }
    }

    checkKeyStatus();
  }, [user]);

  // ── Poll for the other user's public key once we're unlocked ────────────
  useEffect(() => {
    if (status !== "waiting" && status !== "ready") return;
    let cancelled = false;

    async function pollForOtherKey() {
      try {
        const other = await fetchOtherUserPublicKey(user.id);
        if (cancelled) return;

        if (other?.public_key) {
          // Derive the shared key and activate encryption
          const myKeys = getSessionKeys();
          if (!myKeys) return;

          const theirPublicCryptoKey = await importPublicKey(other.public_key);
          const sharedAesKey = await deriveSharedKey(myKeys.myPrivateCryptoKey, theirPublicCryptoKey);

          setSessionKeys({
            myPrivateCryptoKey: myKeys.myPrivateCryptoKey,
            theirPublicCryptoKey,
            sharedAesKey,
          });

          setOtherUserReady(true);
          setStatus("ready");
        } else {
          setStatus("waiting");
          // Retry in 5 seconds
          setTimeout(pollForOtherKey, 5000);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to fetch partner's key: " + err.message);
        }
      }
    }

    pollForOtherKey();
    return () => { cancelled = true; };
  }, [status, user]);

  // ── First-time setup: generate keys ─────────────────────────────────────
  const setupKeys = useCallback(async (password) => {
    setError("");
    try {
      // 1. Generate ECDH keypair
      const { publicKeyB64, privateKeyJwk } = await generateKeyPair();

      // 2. Encrypt private key with password, store in IndexedDB
      const encryptedBundle = await encryptPrivateKey(privateKeyJwk, password);
      await saveEncryptedPrivateKey(user.id, encryptedBundle);

      // 3. Import private key as CryptoKey and store in memory
      const myPrivateCryptoKey = await importPrivateKey(privateKeyJwk);
      setSessionKeys({ myPrivateCryptoKey, theirPublicCryptoKey: null, sharedAesKey: null });

      // 4. Publish public key to Supabase
      await publishPublicKey(user.id, publicKeyB64);

      // 5. Move to "waiting" — poll for the other user's key
      setStatus("waiting");
    } catch (err) {
      setError("Key setup failed: " + err.message);
    }
  }, [user]);

  // ── Unlock: decrypt private key from IndexedDB using password ───────────
  const unlockKeys = useCallback(async (password) => {
    setError("");
    try {
      // 1. Load encrypted bundle from IndexedDB
      const encryptedBundle = await loadEncryptedPrivateKey(user.id);
      if (!encryptedBundle) {
        setStatus("need_setup");
        return;
      }

      // 2. Decrypt it (will throw if password is wrong)
      let privateKeyJwk;
      try {
        privateKeyJwk = await decryptPrivateKey(encryptedBundle, password);
      } catch {
        setError("Incorrect password. Your private key could not be unlocked.");
        return;
      }

      // 3. Import as CryptoKey and store in memory
      const myPrivateCryptoKey = await importPrivateKey(privateKeyJwk);
      setSessionKeys({ myPrivateCryptoKey, theirPublicCryptoKey: null, sharedAesKey: null });

      // 4. Try to fetch other user's key right away
      setStatus("waiting");
    } catch (err) {
      setError("Failed to unlock keys: " + err.message);
    }
  }, [user]);

  // ── Sign out: clear in-memory keys ──────────────────────────────────────
  const lock = useCallback(() => {
    clearSessionKeys();
    setStatus("need_unlock");
    setOtherUserReady(false);
  }, []);

  return { status, error, otherUserReady, setupKeys, unlockKeys, lock };
}