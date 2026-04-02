import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPost, uploadEncryptedBlob, fetchWishlists } from "../lib/api";
import { encryptText, encryptFile, decryptText } from "../lib/crypto";
import { getSessionKeys } from "../lib/sessionKeys";
import { validatePostContent, validateMediaFile } from "../lib/validation";
import { MAX_POST_CHARS, MIN_POST_INTERVAL_MS } from "../lib/constants";
import { Avatar, Button, ErrorBanner, CharCounter, Divider } from "./UI";

const AttachIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
  </svg>
);

const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0110 0v4"/>
  </svg>
);

const GiftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
  </svg>
);

export function ComposeBox({ user, onPost }) {
  const [text, setText]           = useState("");
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [fileType, setFileType]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [progress, setProgress]   = useState(0);

  // Wishlist tagging
  const [wishlists, setWishlists]           = useState([]);
  const [selectedWishlist, setSelectedWishlist] = useState("");
  const [showWishlistPicker, setShowWishlistPicker] = useState(false);

  const lastPostTime  = useRef(0);
  const fileRef       = useRef();
  const previewUrlRef = useRef(null);

  // Load active (incomplete) wishlists for tagging
  useEffect(() => {
    async function loadWishlists() {
      try {
        const keys = getSessionKeys();
        const raw  = await fetchWishlists();
        const active = raw.filter(w => !w.is_complete);
        if (!keys?.sharedAesKey || active.length === 0) { setWishlists([]); return; }
        const decrypted = await Promise.all(active.map(async (w) => {
          try {
            const title = await decryptText(w.title, w.title_iv, keys.sharedAesKey);
            return { ...w, _plainTitle: title };
          } catch {
            return { ...w, _plainTitle: "..." };
          }
        }));
        setWishlists(decrypted);
      } catch {}
    }
    loadWishlists();
  }, []);

  function revokePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  const handleFileChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    const v = validateMediaFile(f);
    if (!v.ok) { setError(v.error); e.target.value = ""; return; }
    revokePreview();
    const url = URL.createObjectURL(f);
    previewUrlRef.current = url;
    setFile(f); setPreview(url); setFileType(v.mediaType);
  }, []);

  function removeFile() {
    revokePreview();
    setFile(null); setPreview(null); setFileType(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit() {
    setError("");
    const now = Date.now();
    if (now - lastPostTime.current < MIN_POST_INTERVAL_MS) {
      setError("Wait a moment before posting again."); return;
    }
    const cv = validatePostContent(text, file);
    if (!cv.ok) { setError(cv.error); return; }
    const keys = getSessionKeys();
    if (!keys?.sharedAesKey) { setError("Encryption not ready."); return; }

    setLoading(true); setProgress(5);
    try {
      let encryptedContent = null, contentIv = null;
      if (text.trim()) {
        const enc = await encryptText(text.trim(), keys.sharedAesKey);
        encryptedContent = enc.cipherB64; contentIv = enc.ivB64;
      }
      setProgress(30);

      let mediaUrl = null, mediaIv = null, mediaMime = null, mediaType = null;
      if (file) {
        const { encryptedBlob, ivB64 } = await encryptFile(file, keys.sharedAesKey);
        setProgress(60);
        const { publicUrl } = await uploadEncryptedBlob(user.id, encryptedBlob, file.name);
        mediaUrl  = publicUrl;
        mediaIv   = ivB64;
        mediaMime = file.type || (fileType === "video" ? "video/mp4" : "image/jpeg");
        mediaType = fileType;
      }
      setProgress(85);

      await createPost({
        userId: user.id,
        userEmail: user.email,
        encryptedContent,
        contentIv,
        mediaUrl,
        mediaIv,
        mediaMime,
        mediaType,
        wishlistId: selectedWishlist || null,
      });

      lastPostTime.current = Date.now();
      setText(""); removeFile(); setSelectedWishlist(""); setShowWishlistPicker(false);
      setProgress(100);
      setTimeout(() => setProgress(0), 600);
      onPost?.();
    } catch (err) {
      setError(err.message ?? "Failed to post.");
    }
    setLoading(false);
  }

  const canPost = (text.trim().length > 0 || file !== null) && !loading;
  const selectedWishlistObj = wishlists.find(w => w.id === selectedWishlist);

  return (
    <div style={s.card}>
      <div style={s.row}>
        <Avatar email={user.email} size={38} />
        <textarea
          style={s.textarea}
          placeholder="what's on your mind?"
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={MAX_POST_CHARS + 10}
          rows={3}
          disabled={loading}
          aria-label="Post content"
        />
      </div>

      {/* Wishlist tag badge */}
      {selectedWishlistObj && (
        <div style={s.wishlistTag}>
          <GiftIcon />
          <span style={{ flex: 1, fontSize: 12 }}>
            tagging: <strong>{selectedWishlistObj._plainTitle}</strong>
          </span>
          <button style={s.removeTag} onClick={() => setSelectedWishlist("")}>✕</button>
        </div>
      )}

      {/* Wishlist picker dropdown */}
      {showWishlistPicker && wishlists.length > 0 && (
        <div style={s.wishlistPicker}>
          <p style={s.pickerLabel}>tag this post to a wishlist goal:</p>
          {wishlists.map(w => (
            <button
              key={w.id}
              style={{
                ...s.pickerItem,
                background: selectedWishlist === w.id ? "var(--color-wish-light)" : "transparent",
              }}
              onClick={() => { setSelectedWishlist(w.id); setShowWishlistPicker(false); }}
            >
              <GiftIcon />
              <span style={{ fontSize: 13 }}>{w._plainTitle}</span>
              <span style={s.pickerCount}>{w.required_count} needed</span>
            </button>
          ))}
          <button style={s.pickerCancel} onClick={() => setShowWishlistPicker(false)}>cancel</button>
        </div>
      )}

      {preview && (
        <div style={s.previewWrap}>
          {fileType === "video"
            ? <video src={preview} controls style={s.previewMedia} />
            : <img src={preview} alt="preview" style={s.previewMedia} />}
          <button style={s.removeBtn} onClick={removeFile} disabled={loading} aria-label="Remove">✕</button>
        </div>
      )}

      {progress > 0 && progress < 100 && (
        <div style={s.progressTrack}>
          <div style={{ ...s.progressBar, width: `${progress}%` }} />
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <Divider style={{ margin: "8px 0" }} />

      <div style={s.actions}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="icon" title="Attach file" onClick={() => fileRef.current?.click()} disabled={loading}>
            <AttachIcon />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {wishlists.length > 0 && (
            <Button
              variant="icon"
              title="Tag a wishlist goal"
              onClick={() => setShowWishlistPicker(v => !v)}
              disabled={loading}
              style={{ color: selectedWishlist ? "var(--color-wish-accent)" : "var(--color-text-3)" }}
            >
              <GiftIcon />
            </Button>
          )}

          <CharCounter current={text.length} max={MAX_POST_CHARS} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={s.lockBadge} title="End-to-end encrypted">
            <LockIcon /> encrypted
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canPost}
            loading={loading}
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            post
          </Button>
        </div>
      </div>
    </div>
  );
}

const s = {
  card: {
    background: "var(--color-surface)",
    border: "0.5px solid var(--color-border-md)",
    borderRadius: "var(--radius-lg)",
    padding: 16, marginBottom: 20,
    boxShadow: "var(--shadow-card)",
  },
  row: { display: "flex", gap: 12, alignItems: "flex-start" },
  textarea: {
    flex: 1, border: "none", outline: "none", resize: "none",
    fontSize: 15, fontFamily: "var(--font-display)", fontStyle: "italic",
    color: "var(--color-text-1)", background: "transparent",
    lineHeight: 1.65, minHeight: 72,
  },

  wishlistTag: {
    display: "flex", alignItems: "center", gap: 8,
    background: "var(--color-wish-light)",
    border: "0.5px solid var(--color-wish-border)",
    borderRadius: "var(--radius-md)",
    padding: "6px 10px", marginTop: 8,
    color: "var(--color-wish-accent)",
  },
  removeTag: {
    background: "none", border: "none", cursor: "pointer",
    color: "var(--color-text-3)", fontSize: 12, padding: 2, lineHeight: 1,
  },

  wishlistPicker: {
    background: "var(--color-surface)",
    border: "0.5px solid var(--color-wish-border)",
    borderRadius: "var(--radius-md)",
    padding: 10, marginTop: 8,
    display: "flex", flexDirection: "column", gap: 4,
  },
  pickerLabel: {
    fontSize: 11, color: "var(--color-text-3)", margin: "0 0 4px",
    textTransform: "uppercase", letterSpacing: "0.05em",
  },
  pickerItem: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", borderRadius: "var(--radius-sm)",
    border: "none", cursor: "pointer",
    color: "var(--color-text-1)", textAlign: "left", width: "100%",
  },
  pickerCount: { marginLeft: "auto", fontSize: 11, color: "var(--color-text-3)" },
  pickerCancel: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 12, color: "var(--color-text-3)",
    padding: "4px 0", alignSelf: "flex-end",
  },

  previewWrap: {
    position: "relative", marginTop: 10,
    borderRadius: "var(--radius-md)", overflow: "hidden",
    border: "0.5px solid var(--color-border)",
  },
  previewMedia: { width: "100%", maxHeight: 280, objectFit: "cover", display: "block" },
  removeBtn: {
    position: "absolute", top: 8, right: 8,
    background: "rgba(0,0,0,0.55)", color: "#fff",
    border: "none", borderRadius: "50%",
    width: 28, height: 28, cursor: "pointer", fontSize: 12,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  progressTrack: {
    height: 3, background: "var(--color-border)",
    borderRadius: 99, overflow: "hidden", marginTop: 8,
  },
  progressBar: {
    height: "100%", background: "var(--color-accent)",
    borderRadius: 99, transition: "width 0.3s ease",
  },
  actions: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginTop: 8,
  },
  lockBadge: {
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 11,
    color: "var(--color-accent-text)",
    background: "var(--color-accent-bg)",
    padding: "3px 8px",
    borderRadius: "var(--radius-full)",
    fontWeight: 500,
  },
};