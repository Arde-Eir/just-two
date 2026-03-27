/**
 * crypto.js — End-to-end encryption using the Web Crypto API (built into every modern browser).
 *
 * SCHEME:
 *   - Each user generates an ECDH keypair (P-256 curve) on first login.
 *   - The public key is stored in Supabase (public — it's meant to be shared).
 *   - The private key is stored ONLY in the browser's IndexedDB (via a wrapper),
 *     encrypted under a key derived from the user's password + a random salt.
 *   - When Alice posts, she derives a shared AES-256-GCM key from:
 *       ECDH(Alice_private, Bob_public)
 *     and encrypts the content with it.
 *   - When Bob reads, he derives the same shared key from:
 *       ECDH(Bob_private, Alice_public)
 *     (ECDH is commutative — both sides get the same key.)
 *   - Neither key ever leaves the browser unencrypted.
 *   - Supabase stores: public keys, ciphertext, IVs, encrypted media blobs.
 *     Supabase NEVER sees: private keys, plaintext content, raw media.
 */

// ── Constants ──────────────────────────────────────────────────────────────
const ECDH_PARAMS   = { name: "ECDH", namedCurve: "P-256" };
const AES_PARAMS    = { name: "AES-GCM", length: 256 };
const PBKDF2_ITERS  = 310_000; // OWASP recommended minimum for PBKDF2-SHA256
const SALT_BYTES    = 16;
const IV_BYTES      = 12; // 96-bit IV for AES-GCM

const subtle = window.crypto.subtle;

// ── Encoding helpers ───────────────────────────────────────────────────────

export function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

export function bufToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Random helpers ─────────────────────────────────────────────────────────

export function randomBytes(n) {
  return window.crypto.getRandomValues(new Uint8Array(n));
}

// ── ECDH keypair generation ────────────────────────────────────────────────

/**
 * Generate a new ECDH P-256 keypair.
 * Returns { publicKeyB64, privateKeyJwk }
 * - publicKeyB64: safe to store in Supabase
 * - privateKeyJwk: must be stored encrypted (see storePrivateKey)
 */
export async function generateKeyPair() {
  const keyPair = await subtle.generateKey(ECDH_PARAMS, true, ["deriveKey"]);

  const publicKeySpki = await subtle.exportKey("spki", keyPair.publicKey);
  const privateKeyJwk = await subtle.exportKey("jwk", keyPair.privateKey);

  return {
    publicKeyB64: bufToB64(publicKeySpki),
    privateKeyJwk,
  };
}

/**
 * Import a public key from base64 SPKI format.
 */
export async function importPublicKey(b64) {
  const buf = b64ToBuf(b64);
  return subtle.importKey("spki", buf, ECDH_PARAMS, false, []);
}

/**
 * Import a private key from JWK.
 */
export async function importPrivateKey(jwk) {
  return subtle.importKey("jwk", jwk, ECDH_PARAMS, false, ["deriveKey"]);
}

// ── Shared secret derivation ───────────────────────────────────────────────

/**
 * Derive the shared AES-256-GCM key from our private key + their public key.
 * This is the core of ECDH: both parties arrive at the same key independently.
 */
export async function deriveSharedKey(myPrivateCryptoKey, theirPublicCryptoKey) {
  return subtle.deriveKey(
    { name: "ECDH", public: theirPublicCryptoKey },
    myPrivateCryptoKey,
    AES_PARAMS,
    false,       // not extractable — the shared key can never be exported
    ["encrypt", "decrypt"]
  );
}

// ── Encryption / Decryption ────────────────────────────────────────────────

/**
 * Encrypt a UTF-8 string.
 * Returns { cipherB64, ivB64 } — both safe to store in Supabase.
 */
export async function encryptText(plaintext, sharedKey) {
  const iv = randomBytes(IV_BYTES);
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, encoded);
  return {
    cipherB64: bufToB64(cipherBuf),
    ivB64: bufToB64(iv.buffer),
  };
}

/**
 * Decrypt a ciphertext string back to plaintext.
 */
export async function decryptText(cipherB64, ivB64, sharedKey) {
  const cipher = b64ToBuf(cipherB64);
  const iv = b64ToBuf(ivB64);
  const plainBuf = await subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, cipher);
  return new TextDecoder().decode(plainBuf);
}

/**
 * Encrypt a binary File/Blob.
 * Returns { encryptedBlob, ivB64 }
 */
export async function encryptFile(file, sharedKey) {
  const iv = randomBytes(IV_BYTES);
  const fileBuffer = await file.arrayBuffer();
  const cipherBuf = await subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, fileBuffer);
  const encryptedBlob = new Blob([cipherBuf], { type: "application/octet-stream" });
  return {
    encryptedBlob,
    ivB64: bufToB64(iv.buffer),
  };
}

/**
 * Decrypt an encrypted Blob back to its original bytes, returning an object URL.
 */
export async function decryptFileToUrl(encryptedBlob, ivB64, sharedKey, originalMimeType) {
  const iv = b64ToBuf(ivB64);
  const encBuf = await encryptedBlob.arrayBuffer();
  const plainBuf = await subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, encBuf);
  const plainBlob = new Blob([plainBuf], { type: originalMimeType });
  return URL.createObjectURL(plainBlob);
}

// ── Private key protection (password-based) ────────────────────────────────

/**
 * Derive a wrapping key from the user's password + a random salt.
 * Used to encrypt the private key JWK before storing it in IndexedDB.
 */
async function deriveWrappingKey(password, salt) {
  const passwordKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERS,
      hash: "SHA-256",
    },
    passwordKey,
    AES_PARAMS,
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt the private key JWK with the user's password.
 * Returns an opaque object safe to store in IndexedDB.
 */
export async function encryptPrivateKey(privateKeyJwk, password) {
  const salt = randomBytes(SALT_BYTES);
  const wrappingKey = await deriveWrappingKey(password, salt);
  const iv = randomBytes(IV_BYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(privateKeyJwk));
  const cipherBuf = await subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, plaintext);
  return {
    cipherB64: bufToB64(cipherBuf),
    ivB64: bufToB64(iv.buffer),
    saltB64: bufToB64(salt.buffer),
  };
}

/**
 * Decrypt the private key JWK using the user's password.
 * Throws if the password is wrong (AES-GCM authentication will fail).
 */
export async function decryptPrivateKey(encryptedBundle, password) {
  const salt = b64ToBuf(encryptedBundle.saltB64);
  const wrappingKey = await deriveWrappingKey(password, new Uint8Array(salt));
  const iv = b64ToBuf(encryptedBundle.ivB64);
  const cipher = b64ToBuf(encryptedBundle.cipherB64);
  const plainBuf = await subtle.decrypt({ name: "AES-GCM", iv }, wrappingKey, cipher);
  return JSON.parse(new TextDecoder().decode(plainBuf));
}