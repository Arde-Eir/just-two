/**
 * keystore.js — Persists the user's encrypted private key in IndexedDB.
 *
 * WHY IndexedDB instead of localStorage?
 * - IndexedDB is not accessible to other origins (same-origin policy)
 * - It survives browser restarts (unlike sessionStorage)
 * - It is not sent in HTTP requests (unlike cookies)
 * - It can store binary/structured data natively
 *
 * The private key stored here is ALWAYS encrypted (via PBKDF2 + AES-GCM).
 * Even if someone gains physical access to the device and dumps IndexedDB,
 * they cannot use the private key without the user's password.
 */

const DB_NAME    = "jut_keystore";
const DB_VERSION = 1;
const STORE_NAME = "keys";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Save an encrypted private key bundle for a given userId.
 * @param {string} userId
 * @param {{ cipherB64, ivB64, saltB64 }} encryptedBundle
 */
export async function saveEncryptedPrivateKey(userId, encryptedBundle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.put(encryptedBundle, `pk_${userId}`);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Load the encrypted private key bundle for a given userId.
 * Returns null if not found (key not yet generated on this device).
 */
export async function loadEncryptedPrivateKey(userId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.get(`pk_${userId}`);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Delete the private key for a userId (e.g. on sign out / key rotation).
 */
export async function deletePrivateKey(userId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.delete(`pk_${userId}`);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Check whether a private key exists locally for this user.
 */
export async function hasPrivateKey(userId) {
  const bundle = await loadEncryptedPrivateKey(userId);
  return bundle !== null;
}