import { useState, useEffect, useCallback, useRef } from "react";
import { fetchPosts, subscribeToPosts, fetchEncryptedBlob } from "../lib/api";
import { decryptText, decryptFileToUrl } from "../lib/crypto";
import { getSessionKeys } from "../lib/sessionKeys";

export function usePosts(encryptionReady) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newPostAlert, setNewPostAlert] = useState(false);
  const mediaCache = useRef({});
  const mountedRef = useRef(true);
  const isFirstLoad = useRef(true);

  const decryptPost = useCallback(async (post) => {
    const keys = getSessionKeys();
    if (!keys?.sharedAesKey) return post;

    const decrypted = { ...post, _plainContent: null, _mediaObjectUrl: null };

    if (post.content && post.content_iv) {
      try {
        decrypted._plainContent = await decryptText(post.content, post.content_iv, keys.sharedAesKey);
      } catch {
        decrypted._plainContent = "[could not decrypt]";
      }
    }

    if (post.media_url && post.media_iv && post.media_mime) {
      const cached = mediaCache.current[post.id];
      if (cached) {
        decrypted._mediaObjectUrl = cached;
      } else {
        try {
          const encBlob = await fetchEncryptedBlob(post.media_url);
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
        setPosts(prev => {
          // If background refresh and there are new posts, show alert
          if (isBackground && !isFirstLoad.current && raw.length > prev.length) {
            setNewPostAlert(true);
          }
          return decryptedPosts;
        });
        isFirstLoad.current = false;
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message ?? "Failed to load posts.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [encryptionReady, decryptPost]);

  useEffect(() => {
    mountedRef.current = true;
    if (encryptionReady) {
      setLoading(true);
      refresh(false);
    }

    // Real-time subscription — auto-refresh instantly when any change happens
    const unsubscribe = subscribeToPosts(() => {
      if (mountedRef.current && encryptionReady) refresh(true);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
      Object.values(mediaCache.current).forEach((url) => {
        try { URL.revokeObjectURL(url); } catch {}
      });
      mediaCache.current = {};
    };
  }, [refresh, encryptionReady]);

  return { posts, loading, error, refresh: () => refresh(false), newPostAlert, clearAlert: () => setNewPostAlert(false) };
}