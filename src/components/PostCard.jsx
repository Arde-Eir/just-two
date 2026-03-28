import React, { useState, useEffect, useCallback, useRef } from "react";
import { deletePost, deleteMedia, toggleLike, fetchComments, createComment, deleteComment, subscribeToComments } from "../lib/api";
import { encryptText, decryptText } from "../lib/crypto";
import { getSessionKeys } from "../lib/sessionKeys";
import { timeAgo } from "../lib/utils";
import { Avatar, Button, ErrorBanner } from "./UI";

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

const CommentIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
);

// ── Video Player Component ───────────────────────────────────────────────
function VideoPlayer({ url, mimeType }) {
  if (!url) return (
    <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 12 }}>
      decrypting video...
    </div>
  );

  return (
    <video
      key={url}
      controls
      playsInline
      src={url}
      style={s.media}
      preload="auto"
    />
  );
}
// ── Comment Item ──────────────────────────────────────────────────────────
function CommentItem({ comment, currentUser, onDelete }) {
  const isOwn = comment.user_id === currentUser.id;
  return (
    <div style={s.comment}>
      <div style={s.commentHeader}>
        <Avatar email={comment.user_email} size={24} />
        <span style={s.commentEmail}>{comment.user_email}</span>
        <span style={s.commentTime}>{timeAgo(comment.created_at)}</span>
        {isOwn && (
          <button style={s.commentDelete} onClick={() => onDelete(comment.id)} title="Delete comment">
            <TrashIcon />
          </button>
        )}
      </div>
      <p style={s.commentText}>{comment._plainContent || "[could not decrypt]"}</p>
    </div>
  );
}

// ── Comment Section ───────────────────────────────────────────────────────
function CommentSection({ postId, currentUser }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const decryptComments = useCallback(async (raw) => {
    const keys = getSessionKeys();
    if (!keys?.sharedAesKey) return raw;
    return Promise.all(raw.map(async (c) => {
      try {
        const plain = await decryptText(c.content, c.content_iv, keys.sharedAesKey);
        return { ...c, _plainContent: plain };
      } catch {
        return { ...c, _plainContent: "[could not decrypt]" };
      }
    }));
  }, []);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetchComments(postId);
      const decrypted = await decryptComments(raw);
      setComments(decrypted);
    } catch {
      setError("Failed to load comments.");
    }
    setLoading(false);
  }, [postId, decryptComments]);

  useEffect(() => {
    loadComments();
    const unsubscribe = subscribeToComments(postId, loadComments);
    return unsubscribe;
  }, [postId, loadComments]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const keys = getSessionKeys();
    if (!keys?.sharedAesKey) { setError("Encryption not ready."); return; }
    setSubmitting(true);
    setError("");
    try {
      const { cipherB64, ivB64 } = await encryptText(text.trim(), keys.sharedAesKey);
      await createComment({
        postId,
        userId: currentUser.id,
        userEmail: currentUser.email,
        encryptedContent: cipherB64,
        contentIv: ivB64,
      });
      setText("");
      await loadComments();
    } catch {
      setError("Failed to post comment.");
    }
    setSubmitting(false);
  }

  async function handleDeleteComment(commentId) {
    try {
      await deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {
      setError("Failed to delete comment.");
    }
  }

  return (
    <div style={s.commentSection}>
      {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

      {loading ? (
        <p style={s.commentLoading}>loading comments...</p>
      ) : comments.length > 0 ? (
        <div style={s.commentList}>
          {comments.map(c => (
            <CommentItem key={c.id} comment={c} currentUser={currentUser} onDelete={handleDeleteComment} />
          ))}
        </div>
      ) : (
        <p style={s.noComments}>no comments yet</p>
      )}

      <form onSubmit={handleSubmit} style={s.commentForm}>
        <Avatar email={currentUser.email} size={26} />
        <input
          style={s.commentInput}
          placeholder="write a comment..."
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={300}
          disabled={submitting}
        />
        <button
          type="submit"
          style={{ ...s.commentSubmit, opacity: (!text.trim() || submitting) ? 0.45 : 1 }}
          disabled={!text.trim() || submitting}
        >
          {submitting ? "..." : "send"}
        </button>
      </form>
    </div>
  );
}

// ── Post Card ─────────────────────────────────────────────────────────────
export function PostCard({ post, currentUser, onRefresh }) {
  // Always derive a safe likes array from the post prop
  const initialLikes = Array.isArray(post.likes) ? post.likes : [];

  const [localLikes, setLocalLikes] = useState(initialLikes);
  const [likeLoading, setLikeLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Keep localLikes in sync when post prop changes (e.g. after refresh)
  useEffect(() => {
    setLocalLikes(Array.isArray(post.likes) ? post.likes : []);
  }, [post.likes]);

  const liked = localLikes.includes(currentUser.id);
  const displayContent = post._plainContent;
  const mediaUrl = post._mediaObjectUrl;

  // Esc key listener for fullscreen
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setIsMaximized(false);
    };
    if (isMaximized) {
      window.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isMaximized]);

  async function handleLike() {
    // Prevent double-clicks
    if (likeLoading) return;

    // Optimistic update — flip the like immediately
    const optimisticLikes = liked
      ? localLikes.filter((id) => id !== currentUser.id)
      : [...localLikes, currentUser.id];

    setLocalLikes(optimisticLikes);
    setLikeLoading(true);
    setError("");

    try {
      const serverLikes = await toggleLike(post.id, localLikes, currentUser.id);
      // Reconcile with server truth
      setLocalLikes(Array.isArray(serverLikes) ? serverLikes : optimisticLikes);
      // Soft refresh in background (don't block UI)
      onRefresh?.();
    } catch (err) {
      // Roll back optimistic update
      setLocalLikes(initialLikes);
      setError(err.message || "Failed to update like. Please try again.");
    } finally {
      setLikeLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setDeleteLoading(true);
    setError("");
    try {
      if (post.media_url) await deleteMedia(post.media_url);
      await deletePost(post.id);
      onRefresh?.();
    } catch (err) {
      setError(err.message || "Failed to delete post.");
      setDeleteLoading(false);
    }
  }

  return (
    <>
      {/* Fullscreen overlay */}
      {isMaximized && (
        <div style={s.overlay} onClick={() => setIsMaximized(false)}>
          <img src={mediaUrl} style={s.maximizedImage} alt="Fullscreen view" />
          <button style={s.closeBtn} aria-label="Close fullscreen">✕</button>
        </div>
      )}

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
          {post.user_id === currentUser.id && (
            <Button
              variant={confirmDelete ? "danger" : "icon"}
              size="sm"
              onClick={handleDelete}
              loading={deleteLoading}
              title={confirmDelete ? "Click again to confirm" : "Delete"}
            >
              {confirmDelete ? <span style={{ fontSize: 12 }}>confirm?</span> : <TrashIcon />}
            </Button>
          )}
        </div>

        {displayContent ? (
          <p style={s.content}>{displayContent}</p>
        ) : !post.media_url ? (
          <p style={{ ...s.content, color: 'var(--color-text-3)', fontStyle: 'italic' }}>[locked or empty]</p>
        ) : null}

        {mediaUrl && post.media_type === "image" && (
          <div style={s.mediaWrap} onClick={() => setIsMaximized(true)}>
            <img src={mediaUrl} alt="Post attachment" style={{ ...s.media, cursor: 'zoom-in' }} loading="lazy" />
          </div>
        )}

        {mediaUrl && post.media_type === "video" && (
          <div style={s.mediaWrap}>
            <VideoPlayer url={mediaUrl} mimeType={post.media_mime} />
          </div>
        )}

        {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

        <div style={s.footer}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* Like button — optimistic, never crashes */}
            <button
              onClick={handleLike}
              disabled={likeLoading}
              aria-pressed={liked}
              aria-label={liked ? "Unlike" : "Like"}
              style={{
                ...s.actionBtn,
                color: liked ? "var(--color-like-active)" : "var(--color-text-3)",
                opacity: likeLoading ? 0.6 : 1,
                transform: likeLoading ? "scale(0.92)" : "scale(1)",
                transition: "opacity 140ms, transform 140ms, color 140ms",
              }}
            >
              <HeartIcon filled={liked} />
              <span style={{ fontSize: 13 }}>
                {localLikes.length > 0 ? localLikes.length : ""}
              </span>
            </button>

            <button
              onClick={() => setShowComments(v => !v)}
              style={{
                ...s.actionBtn,
                color: showComments ? "var(--color-accent)" : "var(--color-text-3)",
                marginLeft: 4,
              }}
            >
              <CommentIcon />
              <span style={{ fontSize: 13 }}>{showComments ? "hide" : "comment"}</span>
            </button>
          </div>
          <span style={s.encBadge}>🔒 e2e encrypted</span>
        </div>

        {showComments && (
          <CommentSection postId={post.id} currentUser={currentUser} />
        )}
      </article>
    </>
  );
}

const s = {
  card: { background: "var(--color-surface)", border: "0.5px solid var(--color-border-md)", borderRadius: "var(--radius-lg)", padding: "14px 16px", marginBottom: 12, boxShadow: "var(--shadow-card)", position: 'relative' },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 },
  email: { fontSize: 13, fontWeight: 500, color: "var(--color-text-1)", margin: 0 },
  time: { fontSize: 12, color: "var(--color-text-3)", display: "block", marginTop: 2 },
  content: { fontSize: 15, fontFamily: "var(--font-display)", lineHeight: 1.7, color: "var(--color-text-1)", margin: "0 0 12px", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  mediaWrap: { borderRadius: "var(--radius-md)", overflow: "hidden", border: "0.5px solid var(--color-border)", marginBottom: 10, background: "var(--color-surface-2)" },
  media: { width: "100%", maxHeight: 500, display: "block", objectFit: 'cover' },
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "0.5px solid var(--color-border)" },
  actionBtn: { display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-body)", fontSize: 13 },
  encBadge: { fontSize: 11, color: "var(--color-text-3)" },

  // Fullscreen overlay
  overlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.96)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', margin: 0, padding: 0 },
  maximizedImage: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none', boxShadow: '0 0 50px rgba(0,0,0,0.5)' },
  closeBtn: { position: 'absolute', top: 24, right: 24, background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 18, cursor: 'pointer', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  // Comments
  commentSection: { marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--color-border)" },
  commentList: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 },
  comment: { display: "flex", flexDirection: "column", gap: 4 },
  commentHeader: { display: "flex", alignItems: "center", gap: 6 },
  commentEmail: { fontSize: 12, fontWeight: 500, color: "var(--color-text-1)" },
  commentTime: { fontSize: 11, color: "var(--color-text-3)", marginLeft: "auto" },
  commentDelete: { background: "none", border: "none", cursor: "pointer", color: "var(--color-text-3)", padding: 2, display: "flex", alignItems: "center" },
  commentText: { fontSize: 13, color: "var(--color-text-1)", margin: "0 0 0 30px", lineHeight: 1.5, fontFamily: "var(--font-display)", fontStyle: "italic" },
  commentLoading: { fontSize: 12, color: "var(--color-text-3)", margin: "0 0 10px" },
  noComments: { fontSize: 12, color: "var(--color-text-3)", fontStyle: "italic", margin: "0 0 10px", textAlign: "center" },
  commentForm: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 },
  commentInput: { flex: 1, border: "0.5px solid var(--color-border-md)", borderRadius: "var(--radius-full)", padding: "7px 14px", fontSize: 13, outline: "none", background: "var(--color-surface-2)", fontFamily: "var(--font-display)", fontStyle: "italic", color: "var(--color-text-1)" },
  commentSubmit: { background: "var(--color-text-1)", color: "#fff", border: "none", borderRadius: "var(--radius-full)", padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 500, whiteSpace: "nowrap" },
};