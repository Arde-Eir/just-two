import React, { useState } from "react";
import { deletePost, deleteMedia, toggleLike } from "../lib/api";
import { timeAgo } from "../lib/utils";
import { Avatar, Button, ErrorBanner } from "./UI";

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
);

const HeartIcon = ({ filled }) => filled ? (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--color-like-active)" stroke="var(--color-like-active)" strokeWidth="2">
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  </svg>
) : (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  </svg>
);

export function PostCard({ post, currentUser, onRefresh }) {
  const [likeLoading, setLikeLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOwn = post.user_id === currentUser.id;
  const safeLikes = Array.isArray(post.likes) ? post.likes : [];
  const liked = safeLikes.includes(currentUser.id);
  // Use decrypted content if available, fall back gracefully
  const displayContent = post._plainContent;
  const mediaUrl = post._mediaObjectUrl;

  async function handleLike() {
    if (likeLoading) return;
    setLikeLoading(true);
    try { await toggleLike(post.id, safeLikes, currentUser.id); onRefresh?.(); }
    catch { setError("Failed to update like."); }
    setLikeLoading(false);
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setDeleteLoading(true);
    try {
      if (post.media_url) await deleteMedia(post.media_url);
      await deletePost(post.id);
      onRefresh?.();
    } catch { setError("Failed to delete post."); setDeleteLoading(false); }
  }

  return (
    <article style={s.card} className="fade-up">
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar email={post.user_email} size={36} />
          <div>
            <p style={s.email}>{post.user_email}</p>
            <time style={s.time} dateTime={post.created_at} title={new Date(post.created_at).toLocaleString()}>
              {timeAgo(post.created_at)}
            </time>
          </div>
        </div>
        {isOwn && (
          <Button variant={confirmDelete ? "danger" : "icon"} size="sm" onClick={handleDelete}
            loading={deleteLoading} title={confirmDelete ? "Click again to confirm" : "Delete"}>
            {confirmDelete ? <span style={{ fontSize: 12 }}>confirm?</span> : <TrashIcon />}
          </Button>
        )}
      </div>

      {displayContent && <p style={s.content}>{displayContent}</p>}

      {mediaUrl && post.media_type === "image" && (
        <div style={s.mediaWrap}>
          <img src={mediaUrl} alt="Post attachment" style={s.media} loading="lazy"
            onError={e => { e.target.style.display = "none"; }} />
        </div>
      )}
      {mediaUrl && post.media_type === "video" && (
        <div style={s.mediaWrap}>
          <video src={mediaUrl} controls style={s.media} preload="metadata" />
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div style={s.footer}>
        <button onClick={handleLike} disabled={likeLoading} aria-pressed={liked}
          style={{ ...s.likeBtn, color: liked ? "var(--color-like-active)" : "var(--color-text-3)" }}>
          <HeartIcon filled={liked} />
          <span style={{ fontSize: 13 }}>{safeLikes.length > 0 ? safeLikes.length : ""}</span>
        </button>
        <span style={s.encBadge}>🔒 e2e encrypted</span>
      </div>
    </article>
  );
}

const s = {
  card: { background: "var(--color-surface)", border: "0.5px solid var(--color-border-md)", borderRadius: "var(--radius-lg)", padding: "14px 16px", marginBottom: 12, boxShadow: "var(--shadow-card)" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 },
  email: { fontSize: 13, fontWeight: 500, color: "var(--color-text-1)", margin: 0 },
  time: { fontSize: 12, color: "var(--color-text-3)", display: "block", marginTop: 2 },
  content: { fontSize: 15, fontFamily: "var(--font-display)", lineHeight: 1.7, color: "var(--color-text-1)", margin: "0 0 12px", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  mediaWrap: { borderRadius: "var(--radius-md)", overflow: "hidden", border: "0.5px solid var(--color-border)", marginBottom: 10, background: "var(--color-surface-2)" },
  media: { width: "100%", maxHeight: 400, objectFit: "cover", display: "block" },
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "0.5px solid var(--color-border)" },
  likeBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-body)" },
  encBadge: { fontSize: 11, color: "var(--color-text-3)" },
};