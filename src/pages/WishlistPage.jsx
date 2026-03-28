import React, { useState, useEffect, useCallback } from "react";
import { fetchWishlists, createWishlist, deleteWishlist, markWishlistComplete, fetchWishlistPostCount, subscribeToWishlists } from "../lib/api";
import { encryptText, decryptText } from "../lib/crypto";
import { getSessionKeys } from "../lib/sessionKeys";
import { Avatar, Button, Input, ErrorBanner, Spinner } from "../components/UI";
import { timeAgo } from "../lib/utils";

// ── Icons ─────────────────────────────────────────────────────────────────
const GiftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
  </svg>
);

const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
);

// ── Progress Ring ─────────────────────────────────────────────────────────
function ProgressRing({ count, required, complete }) {
  const size    = 64;
  const stroke  = 5;
  const r       = (size - stroke) / 2;
  const circ    = 2 * Math.PI * r;
  const pct     = Math.min(count / required, 1);
  const offset  = circ * (1 - pct);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-wish-light)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={complete ? "#22c55e" : "var(--color-wish-accent)"}
          strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {complete ? (
          <span style={{ fontSize: 20 }}>🎁</span>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-wish-accent)" }}>{count}</span>
            <span style={{ fontSize: 10, color: "var(--color-text-3)" }}>/{required}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Create Wishlist Form ──────────────────────────────────────────────────
function CreateWishlistForm({ user, onCreated, onCancel }) {
  const [title, setTitle]           = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward]         = useState("");
  const [requiredCount, setRequiredCount] = useState(5);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (!reward.trim()) { setError("Reward is required — what will they get?"); return; }
    if (requiredCount < 1 || requiredCount > 100) { setError("Required uploads must be between 1 and 100."); return; }

    const keys = getSessionKeys();
    if (!keys?.sharedAesKey) { setError("Encryption not ready."); return; }

    setLoading(true); setError("");
    try {
      const encTitle = await encryptText(title.trim(), keys.sharedAesKey);
      const encDesc  = description.trim() ? await encryptText(description.trim(), keys.sharedAesKey) : null;
      const encReward = await encryptText(reward.trim(), keys.sharedAesKey);

      await createWishlist({
        creatorId:      user.id,
        creatorEmail:   user.email,
        encTitle:       encTitle.cipherB64,
        titleIv:        encTitle.ivB64,
        encDescription: encDesc?.cipherB64 ?? null,
        descriptionIv:  encDesc?.ivB64 ?? null,
        encReward:      encReward.cipherB64,
        rewardIv:       encReward.ivB64,
        requiredCount,
      });
      onCreated();
    } catch (err) {
      setError(err.message ?? "Failed to create wishlist.");
    }
    setLoading(false);
  }

  return (
    <div style={s.formCard} className="slide-in">
      <h3 style={s.formTitle}>✦ new wishlist goal</h3>
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input id="wl-title" label="Goal title" placeholder='e.g. "Send me 5 morning selfies 🌅"'
          value={title} onChange={e => setTitle(e.target.value)} disabled={loading} required />
        <div>
          <label style={s.label}>Description (optional)</label>
          <textarea style={s.textarea} placeholder="Any details or rules..." value={description}
            onChange={e => setDescription(e.target.value)} rows={2} disabled={loading} maxLength={300} />
        </div>
        <Input id="wl-reward" label="🎁 Reward (what they'll get)" placeholder='e.g. "I will cook your favourite dinner"'
          value={reward} onChange={e => setReward(e.target.value)} disabled={loading} required />
        <div>
          <label style={s.label}>Number of uploads required</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <input type="range" min={1} max={50} value={requiredCount}
              onChange={e => setRequiredCount(Number(e.target.value))}
              style={{ flex: 1 }} disabled={loading} />
            <span style={s.countBadge}>{requiredCount}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Button type="submit" variant="primary" size="md" loading={loading}
            style={{ flex: 1, background: "var(--color-wish-accent)", fontFamily: "var(--font-display)", fontStyle: "italic" }}>
            create goal
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={onCancel} disabled={loading}>
            cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Wishlist Card ─────────────────────────────────────────────────────────
function WishlistCard({ wishlist, currentUser, onDelete, onComplete }) {
  const [count, setCount]   = useState(0);
  const [loading, setLoading] = useState(true);
  const isOwn = wishlist.creator_id === currentUser.id;
  const complete = wishlist.is_complete || count >= wishlist.required_count;

  useEffect(() => {
    fetchWishlistPostCount(wishlist.id).then(c => { setCount(c); setLoading(false); });
  }, [wishlist.id]);

  // Auto-mark complete when count reaches required
  useEffect(() => {
    if (!wishlist.is_complete && count >= wishlist.required_count && count > 0) {
      markWishlistComplete(wishlist.id).catch(() => {});
    }
  }, [count, wishlist]);

  return (
    <div style={{ ...s.card, borderColor: complete ? "#22c55e" : "var(--color-wish-border)", background: complete ? "var(--color-wish-bg)" : "var(--color-surface)" }}
      className="fade-up">
      <div style={s.cardTop}>
        <ProgressRing count={count} required={wishlist.required_count} complete={complete} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <h3 style={s.cardTitle}>{wishlist._plainTitle || "..."}</h3>
            {isOwn && (
              <button style={s.deleteBtn} onClick={() => onDelete(wishlist)} title="Delete wishlist">
                <TrashIcon />
              </button>
            )}
          </div>
          {wishlist._plainDescription && (
            <p style={s.cardDesc}>{wishlist._plainDescription}</p>
          )}
          <div style={s.metaRow}>
            <Avatar email={wishlist.creator_email} size={18} />
            <span style={s.metaText}>by {wishlist.creator_email} · {timeAgo(wishlist.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Reward reveal */}
      <div style={{ ...s.rewardBox, background: complete ? "#dcfce7" : "var(--color-wish-light)", borderColor: complete ? "#86efac" : "var(--color-wish-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: complete ? 6 : 0 }}>
          <StarIcon />
          <span style={{ ...s.rewardLabel, color: complete ? "#16a34a" : "var(--color-wish-accent)" }}>
            {complete ? "🎉 reward unlocked!" : `reward unlocks at ${wishlist.required_count} uploads`}
          </span>
        </div>
        {complete ? (
          <p style={{ ...s.rewardText, color: "#15803d" }}>{wishlist._plainReward || "..."}</p>
        ) : (
          <p style={s.rewardLocked}>🔒 hidden until goal is reached</p>
        )}
      </div>

      {/* Progress bar */}
      {!complete && (
        <div style={s.progressTrack}>
          <div style={{ ...s.progressBar, width: `${Math.min((count / wishlist.required_count) * 100, 100)}%` }} />
        </div>
      )}

      {complete && (
        <div style={s.completeBadge}>✓ goal complete!</div>
      )}
    </div>
  );
}

// ── Wishlist Page ─────────────────────────────────────────────────────────
export function WishlistPage({ user }) {
  const [wishlists, setWishlists]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [error, setError]           = useState("");

  const decryptWishlist = useCallback(async (w) => {
    const keys = getSessionKeys();
    if (!keys?.sharedAesKey) return w;
    try {
      const title       = await decryptText(w.title, w.title_iv, keys.sharedAesKey);
      const description = w.description ? await decryptText(w.description, w.description_iv, keys.sharedAesKey) : null;
      const reward      = w.reward ? await decryptText(w.reward, w.reward_iv, keys.sharedAesKey) : null;
      return { ...w, _plainTitle: title, _plainDescription: description, _plainReward: reward };
    } catch {
      return { ...w, _plainTitle: "[could not decrypt]" };
    }
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const raw = await fetchWishlists();
      const decrypted = await Promise.all(raw.map(decryptWishlist));
      setWishlists(decrypted);
    } catch (err) {
      setError("Failed to load wishlists.");
    }
    setLoading(false);
  }, [decryptWishlist]);

  useEffect(() => {
    load();
    const unsub = subscribeToWishlists(load);
    return unsub;
  }, [load]);

  async function handleDelete(w) {
    if (!window.confirm("Delete this wishlist?")) return;
    try { await deleteWishlist(w.id); load(); }
    catch { setError("Failed to delete wishlist."); }
  }

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h2 style={s.pageTitle}><GiftIcon /> wishlist goals</h2>
          <p style={s.pageSub}>create goals for each other — unlock rewards when complete</p>
        </div>
        {!showForm && (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}
            style={{ background: "var(--color-wish-accent)", fontFamily: "var(--font-display)", fontStyle: "italic" }}>
            + new goal
          </Button>
        )}
      </div>

      {showForm && (
        <CreateWishlistForm user={user} onCreated={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
      )}

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner size={24} /></div>
      ) : wishlists.length === 0 ? (
        <div style={s.empty}>
          <span style={{ fontSize: 40 }}>🎁</span>
          <p style={s.emptyText}>no wishlist goals yet</p>
          <p style={s.emptySub}>create a goal for the other person to fulfill</p>
        </div>
      ) : (
        wishlists.map(w => (
          <WishlistCard key={w.id} wishlist={w} currentUser={user} onDelete={handleDelete} onComplete={load} />
        ))
      )}
    </div>
  );
}

const s = {
  page: { maxWidth: 620, margin: "0 auto", padding: "24px 16px 60px" },
  pageHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12 },
  pageTitle: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 20, color: "var(--color-text-1)", display: "flex", alignItems: "center", gap: 8, margin: 0 },
  pageSub: { fontSize: 13, color: "var(--color-text-3)", marginTop: 4 },
  formCard: { background: "var(--color-surface)", border: "0.5px solid var(--color-wish-border)", borderRadius: "var(--radius-lg)", padding: 20, marginBottom: 20, boxShadow: "var(--shadow-card)" },
  formTitle: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16, color: "var(--color-wish-accent)", marginBottom: 14 },
  label: { display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-2)", marginBottom: 5, letterSpacing: "0.03em" },
  textarea: { display: "block", width: "100%", padding: "10px 14px", border: "1px solid var(--color-border-md)", borderRadius: "var(--radius-md)", background: "var(--color-surface)", color: "var(--color-text-1)", fontSize: 14, outline: "none", resize: "none", fontFamily: "inherit" },
  countBadge: { background: "var(--color-wish-light)", color: "var(--color-wish-accent)", borderRadius: "var(--radius-md)", padding: "4px 12px", fontSize: 14, fontWeight: 500, minWidth: 40, textAlign: "center" },
  card: { border: "0.5px solid", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14, boxShadow: "var(--shadow-card)", transition: "border-color 0.3s ease" },
  cardTop: { display: "flex", gap: 14, marginBottom: 12 },
  cardTitle: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16, color: "var(--color-text-1)", margin: 0, lineHeight: 1.4 },
  cardDesc: { fontSize: 13, color: "var(--color-text-2)", marginTop: 4, lineHeight: 1.5 },
  metaRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 8 },
  metaText: { fontSize: 11, color: "var(--color-text-3)" },
  deleteBtn: { background: "none", border: "none", cursor: "pointer", color: "var(--color-text-3)", padding: 2, display: "flex", alignItems: "center", flexShrink: 0 },
  rewardBox: { border: "0.5px solid", borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 10, transition: "all 0.4s ease" },
  rewardLabel: { fontSize: 12, fontWeight: 500 },
  rewardText: { fontSize: 14, fontFamily: "var(--font-display)", fontStyle: "italic", marginTop: 2, lineHeight: 1.5 },
  rewardLocked: { fontSize: 12, color: "var(--color-text-3)", marginTop: 2 },
  progressTrack: { height: 4, background: "var(--color-wish-light)", borderRadius: 99, overflow: "hidden" },
  progressBar: { height: "100%", background: "var(--color-wish-accent)", borderRadius: 99, transition: "width 0.6s ease" },
  completeBadge: { textAlign: "center", fontSize: 13, color: "#16a34a", fontWeight: 500, padding: "6px 0 0" },
  empty: { textAlign: "center", padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  emptyText: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 18, color: "var(--color-text-2)", margin: 0 },
  emptySub: { fontSize: 13, color: "var(--color-text-3)", margin: 0 },
};