import { useState, useEffect, useCallback, useRef } from "react";
import { fetchPostsByMonth, fetchPostMonths, subscribeToPosts, fetchEncryptedBlob } from "../lib/api";
import { decryptText, decryptFileToUrl } from "../lib/crypto";
import { getSessionKeys } from "../lib/sessionKeys";
import { cachePlaintext, loadCachedPlaintext } from "../lib/plaintextCache";

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function usePosts(encryptionReady) {
  const [monthKey, setMonthKey]         = useState(currentMonthKey());
  const [months, setMonths]             = useState([]); // available month list
  const [posts, setPosts]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMonths, setLoadingMonths] = useState(true);
  const [error, setError]               = useState(null);
  const [newPostAlert, setNewPostAlert] = useState(false);
  const mediaCache   = useRef({});
  const mountedRef   = useRef(true);
  const prevCount    = useRef(0);
  const isFirstLoad  = useRef(true);

  // Decrypt a single post with cache fallback
  const decryptPost = useCallback(async (post) => {
    const keys = getSessionKeys();
    const dec  = { ...post, _plainContent: null, _mediaObjectUrl: null };

    if (post.content && post.content_iv) {
      if (keys?.sharedAesKey) {
        try {
          const plain = await decryptText(post.content, post.content_iv, keys.sharedAesKey);
          dec._plainContent = plain;
          await cachePlaintext(post.id, plain);
        } catch {
          dec._plainContent = (await loadCachedPlaintext(post.id)) ?? "[could not decrypt]";
        }
      } else {
        dec._plainContent = (await loadCachedPlaintext(post.id)) ?? "[could not decrypt]";
      }
    }

    if (post.media_url && post.media_iv && post.media_mime) {
      const cached = mediaCache.current[post.id];
      if (cached) {
        dec._mediaObjectUrl = cached;
      } else if (keys?.sharedAesKey) {
        try {
          const encBlob  = await fetchEncryptedBlob(post.media_url);
          const url      = await decryptFileToUrl(encBlob, post.media_iv, keys.sharedAesKey, post.media_mime);
          mediaCache.current[post.id] = url;
          dec._mediaObjectUrl = url;
        } catch { dec._mediaObjectUrl = null; }
      }
    }
    return dec;
  }, []);

  // Load month index
  const loadMonths = useCallback(async () => {
    try {
      const data = await fetchPostMonths();
      if (mountedRef.current) setMonths(data);
    } catch {}
    if (mountedRef.current) setLoadingMonths(false);
  }, []);

  // Load posts for the selected month
  const refresh = useCallback(async (isBackground = false) => {
    if (!encryptionReady) return;
    setError(null);
    try {
      const raw = await fetchPostsByMonth(monthKey);
      const decrypted = await Promise.all(raw.map(decryptPost));
      if (mountedRef.current) {
        if (isBackground && !isFirstLoad.current && raw.length > prevCount.current) {
          setNewPostAlert(true);
        }
        prevCount.current  = raw.length;
        isFirstLoad.current = false;
        setPosts(decrypted);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message ?? "Failed to load posts.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [encryptionReady, monthKey, decryptPost]);

  // Switch month — clear media cache for old month
  const goToMonth = useCallback((key) => {
    Object.values(mediaCache.current).forEach(url => { try { URL.revokeObjectURL(url); } catch {} });
    mediaCache.current = {};
    setLoading(true);
    setPosts([]);
    prevCount.current  = 0;
    isFirstLoad.current = true;
    setMonthKey(key);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadMonths();

    if (encryptionReady) { setLoading(true); refresh(false); }

    // Real-time — only auto-refresh if viewing current month
    const unsubscribe = subscribeToPosts(() => {
      if (mountedRef.current && encryptionReady) {
        loadMonths(); // refresh month index too
        if (monthKey === currentMonthKey()) refresh(true);
        else setNewPostAlert(true); // new post in a different month
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
      Object.values(mediaCache.current).forEach(url => { try { URL.revokeObjectURL(url); } catch {} });
      mediaCache.current = {};
    };
  }, [refresh, encryptionReady, loadMonths, monthKey]);

  return {
    posts, loading, error,
    months, loadingMonths,
    monthKey, goToMonth,
    refresh: () => refresh(false),
    newPostAlert,
    clearAlert: () => setNewPostAlert(false),
    isCurrentMonth: monthKey === currentMonthKey(),
  };
}