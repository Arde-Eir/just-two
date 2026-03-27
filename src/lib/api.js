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

// ── Posts ──────────────────────────────────────────────────────────────────

export async function fetchPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("id, user_id, user_email, content, content_iv, media_url, media_iv, media_mime, media_type, likes, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function createPost({ userId, userEmail, encryptedContent, contentIv, mediaUrl, mediaIv, mediaMime, mediaType }) {
  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: userId,
      user_email: userEmail,
      content: encryptedContent ?? null,
      content_iv: contentIv ?? null,
      media_url: mediaUrl ?? null,
      media_iv: mediaIv ?? null,
      media_mime: mediaMime ?? null,
      media_type: mediaType ?? null,
      likes: [],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePost(postId) {
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function toggleLike(postId, currentLikes, userId) {
  const safeLikes = Array.isArray(currentLikes) ? currentLikes : [];
  const already = safeLikes.includes(userId);
  const updated = already ? safeLikes.filter((id) => id !== userId) : [...safeLikes, userId];
  const { data, error } = await supabase
    .from("posts")
    .update({ likes: updated })
    .eq("id", postId)
    .select("likes")
    .single();
  if (error) throw error;
  return data.likes;
}

// ── Comments ──────────────────────────────────────────────────────────────

export async function fetchComments(postId) {
  const { data, error } = await supabase
    .from("comments")
    .select("id, post_id, user_id, user_email, content, content_iv, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createComment({ postId, userId, userEmail, encryptedContent, contentIv }) {
  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: postId,
      user_id: userId,
      user_email: userEmail,
      content: encryptedContent,
      content_iv: contentIv,
    })
    .select()
    .single();
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
    .on("postgres_changes", {
      event: "*", schema: "public", table: "comments",
      filter: `post_id=eq.${postId}`,
    }, onUpdate)
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
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const path = publicUrl.slice(idx + marker.length);
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
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