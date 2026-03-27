import React from "react";
import { usePosts } from "../hooks/usePosts";
import { ComposeBox } from "../components/ComposeBox";
import { PostCard } from "../components/PostCard";
import { Header } from "../components/Header";
import { Spinner, ErrorBanner } from "../components/UI";

export function FeedPage({ user }) {
  const { posts, loading, error, refresh } = usePosts(true);

  return (
    <div style={s.page}>
      <Header user={user} />
      <main style={s.main}>
        <ComposeBox user={user} onPost={refresh} />
        {error && <ErrorBanner message={`Failed to load posts: ${error}`} onDismiss={refresh} />}
        {loading ? (
          <div style={s.center}><Spinner size={24} /></div>
        ) : posts.length === 0 ? (
          <div style={s.empty}>
            <span style={s.emptyIcon}>✦</span>
            <p style={s.emptyText}>nothing here yet</p>
            <p style={s.emptySub}>be the first to say something</p>
          </div>
        ) : (
          <section aria-label="Posts feed">
            {posts.map(post => (
              <PostCard key={post.id} post={post} currentUser={user} onRefresh={refresh} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "var(--color-bg)" },
  main: { maxWidth: 620, margin: "0 auto", padding: "24px 16px 60px" },
  center: { display: "flex", justifyContent: "center", padding: "60px 0", color: "var(--color-text-3)" },
  empty: { textAlign: "center", padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  emptyIcon: { fontSize: 32, color: "var(--color-text-3)" },
  emptyText: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 18, color: "var(--color-text-2)", margin: 0 },
  emptySub: { fontSize: 13, color: "var(--color-text-3)", margin: 0 },
};