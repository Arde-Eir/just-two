/**
 * sessionKeys.js — In-memory store for the live CryptoKey objects.
 *
 * CryptoKey objects (from Web Crypto) cannot be serialised or stored —
 * they are opaque handles managed by the browser's crypto engine.
 * We hold them in a plain JS object for the lifetime of the page session.
 * They are automatically cleared on page close / refresh.
 *
 * Structure held in memory (never written to disk):
 *   {
 *     myPrivateCryptoKey: CryptoKey,      // ECDH private key
 *     theirPublicCryptoKey: CryptoKey,    // ECDH public key of the other user
 *     sharedAesKey: CryptoKey,            // Derived AES-256-GCM shared key
 *   }
 */

let _session = null;

export function setSessionKeys({ myPrivateCryptoKey, theirPublicCryptoKey, sharedAesKey }) {
  _session = { myPrivateCryptoKey, theirPublicCryptoKey, sharedAesKey };
}

export function getSessionKeys() {
  return _session;
}

export function clearSessionKeys() {
  _session = null;
}

export function hasSessionKeys() {
  return _session !== null;
}