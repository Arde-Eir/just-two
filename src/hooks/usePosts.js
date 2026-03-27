import { useState, useEffect, useCallback, useRef } from "react";
import { fetchPosts, subscribeToPosts, fetchEncryptedBlob } from "../lib/api";
import { decryptText, decryptFileToUrl } from "../lib/crypto";
import { getSessionKeys } from "../lib/sessionKeys";

export function usePosts(encryptionReady) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mediaCache = useRef({});
  const mountedRef = useRef(true);

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

  const refresh = useCallback(async () => {
    if (!encryptionReady) return;
    setError(null);
    try {
      const raw = await fetchPosts();
      const decryptedPosts = await Promise.all(raw.map(decryptPost));
      if (mountedRef.current) setPosts(decryptedPosts);
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
      refresh();
    }

    const unsubscribe = subscribeToPosts(() => {
      if (mountedRef.current && encryptionReady) refresh();
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

  return { posts, loading, error, refresh };
}