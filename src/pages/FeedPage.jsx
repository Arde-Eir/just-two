import React, { useState } from "react";
import { usePosts } from "../hooks/usePosts";
import { ComposeBox } from "../components/ComposeBox";
import { PostCard } from "../components/PostCard";
import { Header } from "../components/Header";
import { WishlistPage } from "./WishlistPage";
import { ArchivePage } from "./ArchivePage";
import { TrackerPage } from "./TrackerPage";
import { Spinner, ErrorBanner } from "../components/UI";

const FeedIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const GiftIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
  </svg>
);
const ArchiveIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/>
    <line x1="10" y1="12" x2="14" y2="12"/>
  </svg>
);
const TrackerIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);

const TABS = [
  { id: "feed",     label: "feed",      Icon: FeedIcon },
  { id: "tracker",  label: "trackers",  Icon: TrackerIcon },
  { id: "wishlist", label: "wishlists", Icon: GiftIcon },
  { id: "archive",  label: "archive",   Icon: ArchiveIcon },
];

export function FeedPage({ user, theme, onToggleTheme }) {
  const [tab, setTab] = useState("feed");
  const [archiveMonth, setArchiveMonth] = useState(null);

  const {
    posts, loading, error, refresh,
    months, loadingMonths, monthKey, goToMonth,
    newPostAlert, clearAlert, isCurrentMonth,
  } = usePosts(true);

  return (
    <div style={s.page}>
      <Header user={user} theme={theme} onToggleTheme={onToggleTheme} />

      {/* Tab bar */}
      <div style={s.tabBar}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id}
            style={{ ...s.tab, ...(tab === id ? s.tabActive : {}) }}
            onClick={() => setTab(id)}>
            <Icon /> {label}
          </button>
        ))}
      </div>

      {/* New post banner */}
      {newPostAlert && (
        <div style={s.alertBanner} onClick={() => { clearAlert(); if (tab !== "feed") setTab("feed"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          ✦ new post — tap to view
          <button style={s.alertClose} onClick={e => { e.stopPropagation(); clearAlert(); }}>✕</button>
        </div>
      )}

      {/* ── FEED TAB ── */}
      {tab === "feed" && (
        <main style={s.main}>
          {months.length > 1 && (
            <div style={s.monthStrip}>
              {months.map(m => (
                <button key={m.month_key}
                  style={{ ...s.monthChip, ...(monthKey === m.month_key ? s.monthChipActive : {}) }}
                  onClick={() => goToMonth(m.month_key)}>
                  {m.month_label.trim().replace(" ", " '")}
                </button>
              ))}
            </div>
          )}

          {isCurrentMonth && <ComposeBox user={user} onPost={refresh} />}
          {!isCurrentMonth && (
            <div style={s.archiveNotice}>
              📅 viewing {months.find(m => m.month_key === monthKey)?.month_label?.trim() ?? monthKey} — <button style={s.linkBtn} onClick={() => goToMonth(months[0]?.month_key)}>back to current</button>
            </div>
          )}

          {error && <ErrorBanner message={error} onDismiss={refresh} />}

          {loading ? (
            <div style={s.center}><Spinner size={24} /></div>
          ) : posts.length === 0 ? (
            <div style={s.empty}>
              <span style={s.emptyIcon}>✦</span>
              <p style={s.emptyText}>{isCurrentMonth ? "nothing here yet" : "no posts this month"}</p>
              <p style={s.emptySub}>{isCurrentMonth ? "be the first to say something" : "try another month"}</p>
            </div>
          ) : (
            <section>
              {posts.map(post => (
                <PostCard key={post.id} post={post} currentUser={user} onRefresh={refresh} />
              ))}
            </section>
          )}
        </main>
      )}

      {tab === "tracker" && <TrackerPage user={user} />}
      {tab === "wishlist" && <WishlistPage user={user} />}
      {tab === "archive" && (
        <ArchivePage
          months={months}
          selectedMonth={archiveMonth}
          onSelectMonth={setArchiveMonth}
          loadingMonths={loadingMonths}
        />
      )}
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "var(--color-bg)", transition: "background 0.25s ease" },
  main: { maxWidth: 620, margin: "0 auto", padding: "20px 16px 60px" },
  tabBar: { display: "flex", alignItems: "center", padding: "0 8px", borderBottom: "0.5px solid var(--color-border-md)", background: "var(--color-surface)", transition: "background 0.25s ease", overflowX: "auto" },
  tab: { display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 12px", background: "none", border: "none", fontSize: 13, fontFamily: "var(--font-display)", fontStyle: "italic", color: "var(--color-text-3)", cursor: "pointer", borderBottom: "2px solid transparent", marginBottom: -1, transition: "color var(--duration-fast), border-color var(--duration-fast)", whiteSpace: "nowrap", flexShrink: 0 },
  tabActive: { color: "var(--color-text-1)", borderBottomColor: "var(--color-text-1)" },

  monthStrip: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, marginBottom: 4, scrollbarWidth: "none" },
  monthChip: { flexShrink: 0, padding: "5px 12px", borderRadius: "var(--radius-full)", border: "0.5px solid var(--color-border-md)", background: "var(--color-surface)", fontSize: 12, color: "var(--color-text-2)", cursor: "pointer", fontFamily: "var(--font-display)", fontStyle: "italic", transition: "all var(--duration-fast)", whiteSpace: "nowrap" },
  monthChipActive: { background: "var(--color-text-1)", color: "var(--color-bg)", borderColor: "var(--color-text-1)" },

  archiveNotice: { fontSize: 13, color: "var(--color-text-3)", marginBottom: 16, textAlign: "center", fontStyle: "italic" },
  linkBtn: { background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", textDecoration: "underline" },

  center: { display: "flex", justifyContent: "center", padding: "60px 0" },
  empty: { textAlign: "center", padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  emptyIcon: { fontSize: 32, color: "var(--color-text-3)" },
  emptyText: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 18, color: "var(--color-text-2)", margin: 0 },
  emptySub: { fontSize: 13, color: "var(--color-text-3)", margin: 0 },

  alertBanner: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--color-text-1)", color: "var(--color-bg)", padding: "10px 20px", borderRadius: "var(--radius-full)", fontSize: 13, fontFamily: "var(--font-display)", fontStyle: "italic", cursor: "pointer", zIndex: 200, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.25)", animation: "fadeUp 0.3s ease both" },
  alertClose: { background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 },
};