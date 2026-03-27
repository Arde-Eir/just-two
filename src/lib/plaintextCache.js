/**
 * plaintextCache.js
 * 
 * Caches decrypted post/comment text in IndexedDB so that after re-login,
 * past posts are readable immediately without re-decrypting from scratch.
 * 
 * Security: This stores plaintext locally. It is scoped to the user's browser
 * only (same-origin IndexedDB). On shared/public devices, users should clear
 * their browser data on logout. The cache is keyed by post/comment ID.
 */

const DB_NAME    = "jut_plaintext_cache";
const DB_VERSION = 1;
const STORE_NAME = "decrypted";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = (e) => reject(e.target.error);
  });
}

/** Save decrypted text for a post or comment by its ID */
export async function cachePlaintext(id, text) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put(text, id);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch {
    // Non-fatal — cache miss just means we re-decrypt
  }
}

/** Load cached plaintext for an ID. Returns null if not found. */
export async function loadCachedPlaintext(id) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Delete cache entry (e.g. when post is deleted) */
export async function deleteCachedPlaintext(id) {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx  = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
    });
  } catch {}
}

/** Clear all cached plaintext (e.g. on sign out for security) */
export async function clearPlaintextCache() {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx  = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
    });
  } catch {}
}