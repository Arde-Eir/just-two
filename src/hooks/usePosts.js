import { useState, useEffect, useCallback, useRef } from "react";
import { fetchPosts, subscribeToPosts, fetchEncryptedBlob } from "../lib/api";
import { decryptText, decryptFileToUrl } from "../lib/crypto";
import { getSessionKeys } from "../lib/sessionKeys";
import { cachePlaintext, loadCachedPlaintext } from "../lib/plaintextCache";

export function usePosts(encryptionReady) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newPostAlert, setNewPostAlert] = useState(false);
  
  const mediaCache = useRef({});
  const mountedRef = useRef(true);
  // Track if we actually have the shared key to prevent "false-negative" caching
  const keys = getSessionKeys();
  const hasSharedKey = !!keys?.sharedAesKey;

  const decryptPost = useCallback(async (post) => {
    const currentKeys = getSessionKeys();
    const decrypted = { ...post, _plainContent: null, _mediaObjectUrl: null };

    // ── Text content ──────────────────────────────────────────────────────
    if (post.content && post.content_iv) {
      if (currentKeys?.sharedAesKey) {
        try {
          const plain = await decryptText(post.content, post.content_iv, currentKeys.sharedAesKey);
          decrypted._plainContent = plain;
          await cachePlaintext(post.id, plain);
        } catch (e) {
          const cached = await loadCachedPlaintext(post.id);
          decrypted._plainContent = cached ?? "[decryption failed]";
        }
      } else {
        const cached = await loadCachedPlaintext(post.id);
        decrypted._plainContent = cached ?? "[waiting for shared key...]";
      }
    }

    // ── Media ─────────────────────────────────────────────────────────────
    if (post.media_url && post.media_iv && post.media_mime) {
      const inMemory = mediaCache.current[post.id];
      if (inMemory) {
        decrypted._mediaObjectUrl = inMemory;
      } else if (currentKeys?.sharedAesKey) {
        try {
          const encBlob = await fetchEncryptedBlob(post.media_url);
          // Fixed: ensure we pass the mimeType so photos/videos render correctly
          const objectUrl = await decryptFileToUrl(encBlob, post.media_iv, currentKeys.sharedAesKey, post.media_mime);
          mediaCache.current[post.id] = objectUrl;
          decrypted._mediaObjectUrl = objectUrl;
        } catch (e) {
          console.error("Media decryption error:", e);
          decrypted._mediaObjectUrl = null;
        }
      }
    }

    return decrypted;
  }, []);

  const refresh = useCallback(async () => {
    // Don't block the fetch just because encryption isn't ready; 
    // fetch the raw posts so we can decrypt them the moment keys arrive.
    setError(null);
    try {
      const raw = await fetchPosts();
      const decrypted = await Promise.all(raw.map(decryptPost));
      if (mountedRef.current) {
        setPosts(decrypted);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message ?? "Failed to load posts.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [decryptPost]);

  // Re-run decryption whenever encryptionReady OR the shared key status changes
  useEffect(() => {
    mountedRef.current = true;
    refresh();

    const unsubscribe = subscribeToPosts(() => {
      if (mountedRef.current) refresh();
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
      // Only revoke if the component is actually unmounting
    };
  }, [refresh, encryptionReady, hasSharedKey]); // added hasSharedKey here

  return {
    posts,
    loading,
    error,
    refresh,
    newPostAlert,
    clearAlert: () => setNewPostAlert(false),
  };
}