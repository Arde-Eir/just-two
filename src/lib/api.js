import { supabase } from "./supabase";
import { MEDIA_BUCKET } from "./constants";
import { buildStoragePath } from "./validation";

// ── Auth ───────────────────────────────────────────────────────────────────

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return data.subscription;
}

// ── Public Key Registry ────────────────────────────────────────────────────

export async function publishPublicKey(userId, publicKeyB64) {
  const { error } = await supabase
    .from("user_keys")
    .upsert({ user_id: userId, public_key: publicKeyB64 }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function fetchPublicKey(userId) {
  const { data, error } = await supabase
    .from("user_keys")
    .select("public_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.public_key ?? null;
}

export async function fetchOtherUserPublicKey(myUserId) {
  const { data, error } = await supabase
    .from("user_keys")
    .select("user_id, public_key")
    .neq("user_id", myUserId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ── Encrypted Private Key Backup ───────────────────────────────────────────

export async function backupEncryptedPrivateKey(userId, bundle) {
  const { error } = await supabase
    .from("user_key_backups")
    .upsert({
      user_id: userId, cipher_b64: bundle.cipherB64,
      iv_b64: bundle.ivB64, salt_b64: bundle.saltB64,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function fetchEncryptedPrivateKeyBackup(userId) {
  const { data, error } = await supabase
    .from("user_key_backups")
    .select("cipher_b64, iv_b64, salt_b64")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { cipherB64: data.cipher_b64, ivB64: data.iv_b64, saltB64: data.salt_b64 };
}

// ── Posts (paginated by month) ─────────────────────────────────────────────

/**
 * Fetch posts for a specific month key (e.g. "2025-03").
 * Defaults to current month. Returns newest-first within the month.
 */
export async function fetchPostsByMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(year, month - 1, 1).toISOString();
  const end   = new Date(year, month, 1).toISOString(); // start of NEXT month

  const { data, error } = await supabase
    .from("posts")
    .select("id, user_id, user_email, content, content_iv, media_url, media_iv, media_mime, media_type, likes, created_at, wishlist_id")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch all available month keys that have posts.
 * Returns array like [{ month_key, month_label, post_count }]
 */
export async function fetchPostMonths() {
  const { data, error } = await supabase
    .from("post_months")
    .select("month_key, month_label, post_count");
  if (error) throw error;
  return data ?? [];
}

export async function createPost({ userId, userEmail, encryptedContent, contentIv, mediaUrl, mediaIv, mediaMime, mediaType, wishlistId }) {
  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: userId, user_email: userEmail,
      content: encryptedContent ?? null, content_iv: contentIv ?? null,
      media_url: mediaUrl ?? null, media_iv: mediaIv ?? null,
      media_mime: mediaMime ?? null, media_type: mediaType ?? null,
      likes: [], wishlist_id: wishlistId ?? null,
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deletePost(postId) {
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function toggleLike(postId, currentLikes, userId) {
  const safeLikes = Array.isArray(currentLikes) ? currentLikes : [];
  const already   = safeLikes.includes(userId);
  const updated   = already ? safeLikes.filter(id => id !== userId) : [...safeLikes, userId];
  const { data, error } = await supabase
    .from("posts").update({ likes: updated }).eq("id", postId).select("likes").single();
  if (error) throw error;
  return data.likes;
}

// ── Comments ──────────────────────────────────────────────────────────────

export async function fetchComments(postId) {
  const { data, error } = await supabase
    .from("comments")
    .select("id, post_id, user_id, user_email, content, content_iv, created_at")
    .eq("post_id", postId).order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createComment({ postId, userId, userEmail, encryptedContent, contentIv }) {
  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, user_id: userId, user_email: userEmail, content: encryptedContent, content_iv: contentIv })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw error;
}

export function subscribeToComments(postId, onUpdate) {
  const channel = supabase
    .channel(`comments-${postId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, onUpdate)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Wishlists ──────────────────────────────────────────────────────────────

export async function fetchWishlists() {
  const { data, error } = await supabase
    .from("wishlists")
    .select("id, creator_id, creator_email, title, title_iv, description, description_iv, reward, reward_iv, required_count, is_complete, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createWishlist({ creatorId, creatorEmail, encTitle, titleIv, encDescription, descriptionIv, encReward, rewardIv, requiredCount }) {
  const { data, error } = await supabase
    .from("wishlists")
    .insert({ creator_id: creatorId, creator_email: creatorEmail, title: encTitle, title_iv: titleIv, description: encDescription ?? null, description_iv: descriptionIv ?? null, reward: encReward ?? null, reward_iv: rewardIv ?? null, required_count: requiredCount, is_complete: false })
    .select().single();
  if (error) throw error;
  return data;
}

export async function markWishlistComplete(wishlistId) {
  const { error } = await supabase.from("wishlists").update({ is_complete: true }).eq("id", wishlistId);
  if (error) throw error;
}

export async function deleteWishlist(wishlistId) {
  const { error } = await supabase.from("wishlists").delete().eq("id", wishlistId);
  if (error) throw error;
}

export async function fetchWishlistPostCount(wishlistId) {
  const { count, error } = await supabase
    .from("posts").select("id", { count: "exact", head: true }).eq("wishlist_id", wishlistId);
  if (error) throw error;
  return count ?? 0;
}

export function subscribeToWishlists(onUpdate) {
  const channel = supabase
    .channel("wishlists-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "wishlists" }, onUpdate)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Storage ────────────────────────────────────────────────────────────────

export async function uploadEncryptedBlob(userId, encryptedBlob, originalFileName) {
  const safeName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = buildStoragePath(userId, { name: `${safeName}.enc`, type: "application/octet-stream" });
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, encryptedBlob, { cacheControl: "3600", upsert: false, contentType: "application/octet-stream" });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Failed to get public URL after upload.");
  return { publicUrl: data.publicUrl, storagePath: path };
}

export async function deleteMedia(publicUrl) {
  if (!publicUrl) return;
  try {
    const marker = `/${MEDIA_BUCKET}/`;
    const idx    = publicUrl.indexOf(marker);
    if (idx === -1) return;
    await supabase.storage.from(MEDIA_BUCKET).remove([publicUrl.slice(idx + marker.length)]);
  } catch (err) {
    console.warn("[deleteMedia] Storage cleanup failed:", err.message);
  }
}

export async function fetchEncryptedBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch media: ${res.status}`);
  return res.blob();
}

// ── Real-time ──────────────────────────────────────────────────────────────

export function subscribeToPosts(onUpdate) {
  const channel = supabase
    .channel("posts-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, onUpdate)
    .subscribe();
  return () => supabase.removeChannel(channel);
}