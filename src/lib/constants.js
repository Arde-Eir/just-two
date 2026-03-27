// ── Media limits ───────────────────────────────────────────────────────────
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;   // 10 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;  // 100 MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/mov"];
export const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

// ── Post limits ────────────────────────────────────────────────────────────
export const MAX_POST_CHARS = 500;

// ── Storage bucket ─────────────────────────────────────────────────────────
export const MEDIA_BUCKET = "posts-media";

// ── App metadata ───────────────────────────────────────────────────────────
export const APP_NAME = "just us two";
export const APP_TAGLINE = "your private little corner of the internet";

// ── Rate limiting (client-side soft guard) ─────────────────────────────────
export const MIN_POST_INTERVAL_MS = 3000; // 3 seconds between posts