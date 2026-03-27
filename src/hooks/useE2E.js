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
  uploadKeyBackup,
  downloadKeyBackup,
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
    if (localKeyExists) {
      setStatus("need_unlock");
    } else {
      // CHECK SUPABASE FOR BACKUP
      const backup = await downloadKeyBackup(user.id); // From api.js
      if (backup) {
        setStatus("need_unlock"); // We have a cloud backup, just need password
      } else {
        setStatus("need_setup");
      }
    }
  } catch (err) {
    setError("Failed to check key status");
    setStatus("error");
  }
}

    checkKeyStatus();
  }, [user]);

  // ── Poll for the other user's public key once we're unlocked ────────────
  // ── Poll for the other user's public key ────────────────────────────
  useEffect(() => {
    // CHANGE: Only run if we are actually waiting. 
    // If it's "ready", this effect will stop and won't loop.
    if (status !== "waiting") return; 

    let cancelled = false;
    let timerId;

    async function pollForOtherKey() {
      try {
        const other = await fetchOtherUserPublicKey(user.id);
        if (cancelled) return;

        if (other?.public_key) {
          const myKeys = getSessionKeys();
          if (!myKeys?.myPrivateCryptoKey) return;

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
          // Retry in 5 seconds
          timerId = setTimeout(pollForOtherKey, 5000);
        }
      } catch (err) {
        if (!cancelled) setError("Partner key error: " + err.message);
      }
    }

    pollForOtherKey();
    return () => { 
      cancelled = true; 
      if (timerId) clearTimeout(timerId); // Cleanup timer!
    };
  }, [status, user?.id]); // Use user.id to avoid unnecessary re-runs

  // ── First-time setup: generate keys ─────────────────────────────────────
  const setupKeys = useCallback(async (password) => {
  try {
    const { publicKeyB64, privateKeyJwk } = await generateKeyPair();
    const encryptedBundle = await encryptPrivateKey(privateKeyJwk, password);
    
    // Save locally
    await saveEncryptedPrivateKey(user.id, encryptedBundle);
    
    // NEW: Save to Supabase so Vercel can find it later!
    await uploadKeyBackup(user.id, encryptedBundle); 

    await publishPublicKey(user.id, publicKeyB64);
    setStatus("waiting");
  } catch (err) {
    setError("Setup failed: " + err.message);
  }
}, [user]);

  // ── Unlock: decrypt private key from IndexedDB using password ───────────
  const unlockKeys = useCallback(async (password) => {
  setError("");
  try {
    // 1. Try loading from local IndexedDB first
    let encryptedBundle = await loadEncryptedPrivateKey(user.id);

    // 2. If not found locally (e.g., new device/Vercel), try cloud backup
    if (!encryptedBundle) {
      console.log("Key not found in IndexedDB, checking cloud backup...");
      const cloudBackup = await downloadKeyBackup(user.id); // From your api.js

      if (cloudBackup) {
        encryptedBundle = cloudBackup;
        // Save it locally so we don't have to download from Supabase next time
        await saveEncryptedPrivateKey(user.id, encryptedBundle);
      } else {
        // If no backup exists anywhere, we must re-setup
        setStatus("need_setup");
        setError("No private key found on this device or in the cloud. Please set up new keys.");
        return;
      }
    }

    // 3. Decrypt the bundle using the user's password
    let privateKeyJwk;
    try {
      privateKeyJwk = await decryptPrivateKey(encryptedBundle, password);
    } catch (err) {
      setError("Incorrect password. Your private key could not be unlocked.");
      return;
    }

    // 4. Import the decrypted JWK as a CryptoKey and store in memory (sessionKeys.js)
    const myPrivateCryptoKey = await importPrivateKey(privateKeyJwk);
    setSessionKeys({ 
      myPrivateCryptoKey, 
      theirPublicCryptoKey: null, 
      sharedAesKey: null 
    });

    // 5. Success! Move to waiting to derive the shared key with the partner
    setStatus("waiting");

  } catch (err) {
    console.error("Unlock error:", err);
    setError("Failed to unlock keys: " + err.message);
  }
}, [user, setStatus, setError]);

  // ── Sign out: clear in-memory keys ──────────────────────────────────────
  const lock = useCallback(() => {
    clearSessionKeys();
    setStatus("need_unlock");
    setOtherUserReady(false);
  }, []);

  return { status, error, otherUserReady, setupKeys, unlockKeys, lock };
}