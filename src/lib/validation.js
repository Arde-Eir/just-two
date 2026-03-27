import {
  MAX_POST_CHARS,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_MEDIA_TYPES,
} from "./constants";

// ── Text sanitization ──────────────────────────────────────────────────────

/**
 * Strips dangerous HTML/script characters from user-supplied text.
 * We store plain text in the DB, but sanitize anyway as defense-in-depth.
 */
export function sanitizeText(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
}

/**
 * Validate post content.
 * Returns { ok: true } or { ok: false, error: string }
 */
export function validatePostContent(text, file) {
  if (!text?.trim() && !file) {
    return { ok: false, error: "Post must have text or an attachment." };
  }
  if (text && text.trim().length > MAX_POST_CHARS) {
    return {
      ok: false,
      error: `Post too long — max ${MAX_POST_CHARS} characters (you have ${text.trim().length}).`,
    };
  }
  return { ok: true };
}

// ── File validation ────────────────────────────────────────────────────────

/**
 * Validates an uploaded File object before sending to Supabase Storage.
 * Returns { ok: true, mediaType: 'image'|'video' } or { ok: false, error: string }
 */
export function validateMediaFile(file) {
  if (!file) return { ok: false, error: "No file provided." };

  if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
    return {
      ok: false,
      error: `Unsupported file type "${file.type}". Allowed: JPEG, PNG, GIF, WebP, MP4, WebM, MOV.`,
    };
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

  if (isImage && file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Image too large — max 10 MB (yours is ${(file.size / 1e6).toFixed(1)} MB).` };
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    return { ok: false, error: `Video too large — max 100 MB (yours is ${(file.size / 1e6).toFixed(1)} MB).` };
  }

  // Validate file name extension matches MIME type (basic spoofing guard)
  const ext = file.name.split(".").pop().toLowerCase();
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp"];
  const videoExts = ["mp4", "webm", "mov", "qt"];

  if (isImage && !imageExts.includes(ext)) {
    return { ok: false, error: "File extension does not match image type." };
  }
  if (isVideo && !videoExts.includes(ext)) {
    return { ok: false, error: "File extension does not match video type." };
  }

  return { ok: true, mediaType: isImage ? "image" : "video" };
}

// ── Email validation ───────────────────────────────────────────────────────
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Password validation ────────────────────────────────────────────────────
export function validatePassword(pw) {
  if (!pw || pw.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (!/[A-Z]/.test(pw)) return { ok: false, error: "Password must contain at least one uppercase letter." };
  if (!/[0-9]/.test(pw)) return { ok: false, error: "Password must contain at least one number." };
  return { ok: true };
}

// ── Storage path safety ────────────────────────────────────────────────────
/**
 * Generates a safe, non-guessable storage path for a media file.
 * Uses the user's UUID as the folder so RLS policies can scope delete access.
 */
export function buildStoragePath(userId, file) {
  const ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${userId}/${timestamp}_${rand}.${ext}`;
}