import React, { useState, useRef, useCallback } from "react";
import { createPost, uploadEncryptedBlob } from "../lib/api";
import { encryptText, encryptFile } from "../lib/crypto";
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

export function ComposeBox({ user, onPost }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const lastPostTime = useRef(0);
  const fileRef = useRef();
  const previewUrlRef = useRef(null);

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
      // Inside handleSubmit, where you handle the file upload:
if (file) {
  const { encryptedBlob, ivB64 } = await encryptFile(file, keys.sharedAesKey);
  setProgress(60);
  const { publicUrl } = await uploadEncryptedBlob(user.id, encryptedBlob, file.name);
  
  mediaUrl = publicUrl;
  mediaIv = ivB64;
  // Ensure we have a valid MIME type, fallback to video/mp4 if it's a video but type is missing
  mediaMime = file.type || (fileType === "video" ? "video/mp4" : "image/jpeg"); 
  mediaType = fileType;
}
      setProgress(85);

      await createPost({ userId: user.id, userEmail: user.email, encryptedContent, contentIv, mediaUrl, mediaIv, mediaMime, mediaType });
      lastPostTime.current = Date.now();
      setText(""); removeFile();
      setProgress(100);
      setTimeout(() => setProgress(0), 600);
      onPost?.();
    } catch (err) {
      setError(err.message ?? "Failed to post.");
    }
    setLoading(false);
  }

  const canPost = (text.trim().length > 0 || file !== null) && !loading;

  return (
    <div style={s.card}>
      <div style={s.row}>
        <Avatar email={user.email} size={38} />
        <textarea style={s.textarea} placeholder="what's on your mind?" value={text}
          onChange={e => setText(e.target.value)} maxLength={MAX_POST_CHARS + 10}
          rows={3} disabled={loading} aria-label="Post content" />
      </div>
      {preview && (
        <div style={s.previewWrap}>
          {fileType === "video"
            ? <video src={preview} controls style={s.previewMedia} />
            : <img src={preview} alt="preview" style={s.previewMedia} />}
          <button style={s.removeBtn} onClick={removeFile} disabled={loading} aria-label="Remove">✕</button>
        </div>
      )}
      {progress > 0 && progress < 100 && (
        <div style={s.progressTrack}><div style={{ ...s.progressBar, width: `${progress}%` }} /></div>
      )}
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <Divider style={{ margin: "8px 0" }} />
      <div style={s.actions}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Button variant="icon" title="Attach file" onClick={() => fileRef.current?.click()} disabled={loading}>
            <AttachIcon />
          </Button>
          <input ref={fileRef} type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
            style={{ display: "none" }} onChange={handleFileChange} />
          <CharCounter current={text.length} max={MAX_POST_CHARS} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={s.lockBadge} title="End-to-end encrypted">
            <LockIcon /> encrypted
          </span>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!canPost} loading={loading}
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
            post
          </Button>
        </div>
      </div>
    </div>
  );
}

const s = {
  card: { background: "var(--color-surface)", border: "0.5px solid var(--color-border-md)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 20, boxShadow: "var(--shadow-card)" },
  row: { display: "flex", gap: 12, alignItems: "flex-start" },
  textarea: { flex: 1, border: "none", outline: "none", resize: "none", fontSize: 15, fontFamily: "var(--font-display)", fontStyle: "italic", color: "var(--color-text-1)", background: "transparent", lineHeight: 1.65, minHeight: 72 },
  previewWrap: { position: "relative", marginTop: 10, borderRadius: "var(--radius-md)", overflow: "hidden", border: "0.5px solid var(--color-border)" },
  previewMedia: { width: "100%", maxHeight: 280, objectFit: "cover", display: "block" },
  removeBtn: { position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" },
  progressTrack: { height: 3, background: "var(--color-border)", borderRadius: 99, overflow: "hidden", marginTop: 8 },
  progressBar: { height: "100%", background: "var(--color-accent)", borderRadius: 99, transition: "width 0.3s ease" },
  actions: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  lockBadge: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-accent-text)", background: "var(--color-accent-bg)", padding: "3px 8px", borderRadius: "var(--radius-full)", fontWeight: 500 },
};