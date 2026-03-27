import { useState, useEffect, useCallback, useRef } from "react";
import { fetchPosts, subscribeToPosts, fetchEncryptedBlob } from "../lib/api";
import { decryptText, decryptFileToUrl } from "../lib/crypto";
import { getSessionKeys } from "../lib/sessionKeys";
import { cachePlaintext, loadCachedPlaintext, deleteCachedPlaintext } from "../lib/plaintextCache";

export function usePosts(encryptionReady) {
  const [posts, setPosts]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [newPostAlert, setNewPostAlert] = useState(false);
  const mediaCache   = useRef({});
  const mountedRef   = useRef(true);
  const isFirstLoad  = useRef(true);
  const prevCount    = useRef(0);

  const decryptPost = useCallback(async (post) => {
    const keys = getSessionKeys();
    const decrypted = { ...post, _plainContent: null, _mediaObjectUrl: null };

    // ── Text content ──────────────────────────────────────────────────────
    if (post.content && post.content_iv) {
      // 1. Try live decryption first (keys in memory)
      if (keys?.sharedAesKey) {
        try {
          const plain = await decryptText(post.content, post.content_iv, keys.sharedAesKey);
          decrypted._plainContent = plain;
          // Cache it for future logins
          await cachePlaintext(post.id, plain);
        } catch {
          // 2. Fall back to cached plaintext
          const cached = await loadCachedPlaintext(post.id);
          decrypted._plainContent = cached ?? "[could not decrypt]";
        }
      } else {
        // No keys in memory — use cache only
        const cached = await loadCachedPlaintext(post.id);
        decrypted._plainContent = cached ?? "[could not decrypt]";
      }
    }

    // ── Media ─────────────────────────────────────────────────────────────
    if (post.media_url && post.media_iv && post.media_mime) {
      const inMemory = mediaCache.current[post.id];
      if (inMemory) {
        decrypted._mediaObjectUrl = inMemory;
      } else if (keys?.sharedAesKey) {
        try {
          const encBlob  = await fetchEncryptedBlob(post.media_url);
          const objectUrl = await decryptFileToUrl(encBlob, post.media_iv, keys.sharedAesKey, post.media_mime);
          mediaCache.current[post.id] = objectUrl;
          decrypted._mediaObjectUrl = objectUrl;
        } catch {
          decrypted._mediaObjectUrl = null;
        }
      }
    }

    return decrypted;
  }, []);

  const refresh = useCallback(async (isBackground = false) => {
    if (!encryptionReady) return;
    setError(null);
    try {
      const raw = await fetchPosts();
      const decryptedPosts = await Promise.all(raw.map(decryptPost));

      if (mountedRef.current) {
        // Show new-post alert when a background refresh brings new posts
        if (isBackground && !isFirstLoad.current && raw.length > prevCount.current) {
          setNewPostAlert(true);
        }
        prevCount.current = raw.length;
        isFirstLoad.current = false;
        setPosts(decryptedPosts);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message ?? "Failed to load posts.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [encryptionReady, decryptPost]);

  useEffect(() => {
    mountedRef.current = true;
    if (encryptionReady) { setLoading(true); refresh(false); }

    const unsubscribe = subscribeToPosts(() => {
      if (mountedRef.current && encryptionReady) refresh(true);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
      Object.values(mediaCache.current).forEach(url => { try { URL.revokeObjectURL(url); } catch {} });
      mediaCache.current = {};
    };
  }, [refresh, encryptionReady]);

  return {
    posts,
    loading,
    error,
    refresh: () => refresh(false),
    newPostAlert,
    clearAlert: () => setNewPostAlert(false),
  };
}