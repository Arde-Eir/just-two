import React, { useState, useCallback } from "react";
import { fetchPostsByMonth, fetchEncryptedBlob } from "../lib/api";
import { decryptText, decryptFileToUrl } from "../lib/crypto";
import { getSessionKeys } from "../lib/sessionKeys";
import { loadCachedPlaintext, cachePlaintext } from "../lib/plaintextCache";
import { timeAgo } from "../lib/utils";
import { Spinner, Avatar, ErrorBanner } from "../components/UI";

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const CalendarIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

// ── Media item with download ───────────────────────────────────────────────
function MediaItem({ post, keys }) {
  const [url, setUrl]         = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded]   = useState(false);

  async function loadMedia() {
    if (url || loading || !keys?.sharedAesKey) return;
    setLoading(true);
    try {
      const encBlob = await fetchEncryptedBlob(post.media_url);
      const objUrl  = await decryptFileToUrl(encBlob, post.media_iv, keys.sharedAesKey, post.media_mime);
      setUrl(objUrl);
    } catch { setUrl(null); }
    setLoading(false);
  }

  async function handleDownload() {
    await loadMedia();
    if (!url) return;
    const a = document.createElement("a");
    const ext = post.media_mime?.split("/")[1] || "bin";
    a.href = url;
    a.download = `memory_${new Date(post.created_at).toISOString().slice(0,10)}.${ext}`;
    a.click();
  }

  return (
    <div style={s.mediaItem}>
      {/* Lazy-load thumbnail on click */}
      <div style={s.mediaThumbnail} onClick={loadMedia}>
        {loading ? (
          <div style={s.mediaPlaceholder}><Spinner size={20} /></div>
        ) : url ? (
          post.media_type === "video" ? (
<video src={url} controls playsInline preload="auto" style={s.mediaEl} onLoadedData={() => setLoaded(true)} />          ) : (
            <img src={url} alt="memory" style={s.mediaEl} onLoad={() => setLoaded(true)} />
          )
        ) : (
          <div style={s.mediaPlaceholder} onClick={loadMedia}>
            <span style={{ fontSize: 28 }}>{post.media_type === "video" ? "🎬" : "🖼️"}</span>
            <span style={s.tapLoad}>tap to load</span>
          </div>
        )}
      </div>

      <div style={s.mediaFooter}>
        <div>
          <p style={s.mediaCaption}>{post._plainContent || ""}</p>
          <p style={s.mediaMeta}>{new Date(post.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <button style={s.downloadBtn} onClick={handleDownload} title="Download">
          <DownloadIcon />
        </button>
      </div>
    </div>
  );
}

// ── Text-only post row ─────────────────────────────────────────────────────
function TextRow({ post }) {
  return (
    <div style={s.textRow}>
      <Avatar email={post.user_email} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={s.textContent}>{post._plainContent || "[encrypted]"}</p>
        <p style={s.textMeta}>{post.user_email} · {timeAgo(post.created_at)}</p>
      </div>
    </div>
  );
}

// ── Archive Page ──────────────────────────────────────────────────────────
export function ArchivePage({ months, selectedMonth, onSelectMonth, loadingMonths }) {
  const [posts, setPosts]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [loaded, setLoaded] = useState(false);

  const keys = getSessionKeys();

  const loadMonth = useCallback(async (key) => {
    onSelectMonth(key);
    setLoading(true); setError(""); setPosts([]); setLoaded(false);
    try {
      const raw = await fetchPostsByMonth(key);
      // Decrypt text content
      const decrypted = await Promise.all(raw.map(async (p) => {
        const dec = { ...p, _plainContent: null };
        if (p.content && p.content_iv && keys?.sharedAesKey) {
          try {
            const plain = await decryptText(p.content, p.content_iv, keys.sharedAesKey);
            dec._plainContent = plain;
            await cachePlaintext(p.id, plain);
          } catch {
            dec._plainContent = (await loadCachedPlaintext(p.id)) ?? "";
          }
        } else if (p.content) {
          dec._plainContent = (await loadCachedPlaintext(p.id)) ?? "";
        }
        return dec;
      }));
      setPosts(decrypted);
      setLoaded(true);
    } catch (err) {
      setError("Failed to load this month.");
    }
    setLoading(false);
  }, [keys, onSelectMonth]);

  const mediaPosts = posts.filter(p => p.media_url && p.media_iv && p.media_mime);
  const textPosts  = posts.filter(p => !p.media_url && p._plainContent);

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <h2 style={s.pageTitle}><CalendarIcon /> monthly archive</h2>
        <p style={s.pageSub}>browse past months · tap media to preview · download to save</p>
      </div>

      {/* Month picker */}
      {loadingMonths ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner size={20} /></div>
      ) : months.length === 0 ? (
        <p style={s.empty}>no posts yet — your archive will appear here month by month</p>
      ) : (
        <div style={s.monthGrid}>
          {months.map(m => (
            <button
              key={m.month_key}
              style={{ ...s.monthBtn, ...(selectedMonth === m.month_key ? s.monthBtnActive : {}) }}
              onClick={() => loadMonth(m.month_key)}
            >
              <span style={s.monthLabel}>{m.month_label.trim()}</span>
              <span style={s.monthCount}>{m.post_count} post{m.post_count !== 1 ? "s" : ""}</span>
            </button>
          ))}
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><Spinner size={24} /></div>
      )}

      {loaded && !loading && (
        <>
          {/* Media grid */}
          {mediaPosts.length > 0 && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>📸 photos & videos ({mediaPosts.length})</h3>
              <div style={s.mediaGrid}>
                {mediaPosts.map(p => <MediaItem key={p.id} post={p} keys={keys} />)}
              </div>
            </div>
          )}

          {/* Text posts */}
          {textPosts.length > 0 && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>💬 captions & posts ({textPosts.length})</h3>
              <div style={s.textList}>
                {textPosts.map(p => <TextRow key={p.id} post={p} />)}
              </div>
            </div>
          )}

          {posts.length === 0 && (
            <p style={s.empty}>no posts found for this month</p>
          )}
        </>
      )}
    </div>
  );
}

const s = {
  page: { maxWidth: 620, margin: "0 auto", padding: "24px 16px 60px" },
  pageHeader: { marginBottom: 20 },
  pageTitle: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 20, color: "var(--color-text-1)", display: "flex", alignItems: "center", gap: 8, margin: 0 },
  pageSub: { fontSize: 13, color: "var(--color-text-3)", marginTop: 4 },

  monthGrid: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  monthBtn: {
    display: "flex", flexDirection: "column", alignItems: "flex-start",
    padding: "10px 14px", borderRadius: "var(--radius-md)",
    background: "var(--color-surface)", border: "0.5px solid var(--color-border-md)",
    cursor: "pointer", transition: "all var(--duration-fast)", gap: 2,
  },
  monthBtnActive: {
    background: "var(--color-text-1)", borderColor: "var(--color-text-1)",
  },
  monthLabel: { fontSize: 13, fontWeight: 500, color: "inherit", fontFamily: "var(--font-display)", fontStyle: "italic" },
  monthCount: { fontSize: 11, color: "var(--color-text-3)" },

  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 14, fontWeight: 500, color: "var(--color-text-2)", marginBottom: 12, letterSpacing: "0.02em" },

  mediaGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 },
  mediaItem: { background: "var(--color-surface)", border: "0.5px solid var(--color-border-md)", borderRadius: "var(--radius-md)", overflow: "hidden" },
  mediaThumbnail: { position: "relative", cursor: "pointer" },
  mediaPlaceholder: { height: 130, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--color-surface-2)", gap: 6 },
  tapLoad: { fontSize: 11, color: "var(--color-text-3)" },
  mediaEl: { width: "100%", height: 130, objectFit: "cover", display: "block" },
  mediaFooter: { padding: "8px 10px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 },
  mediaCaption: { fontSize: 12, color: "var(--color-text-1)", margin: 0, fontFamily: "var(--font-display)", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 },
  mediaMeta: { fontSize: 10, color: "var(--color-text-3)", margin: "2px 0 0" },
  downloadBtn: { background: "var(--color-surface-2)", border: "0.5px solid var(--color-border-md)", borderRadius: "var(--radius-sm)", padding: 6, cursor: "pointer", color: "var(--color-text-2)", display: "flex", alignItems: "center", flexShrink: 0 },

  textList: { display: "flex", flexDirection: "column", gap: 10 },
  textRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "var(--color-surface)", border: "0.5px solid var(--color-border-md)", borderRadius: "var(--radius-md)" },
  textContent: { fontSize: 14, fontFamily: "var(--font-display)", fontStyle: "italic", color: "var(--color-text-1)", margin: 0, lineHeight: 1.6 },
  textMeta: { fontSize: 11, color: "var(--color-text-3)", margin: "4px 0 0" },

  empty: { textAlign: "center", fontSize: 14, color: "var(--color-text-3)", fontStyle: "italic", padding: "40px 0" },
};