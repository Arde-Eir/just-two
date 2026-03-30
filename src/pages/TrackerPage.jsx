import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { encryptText, decryptText } from "../lib/crypto";
import { getSessionKeys } from "../lib/sessionKeys";
import { Button, Input, ErrorBanner, Spinner, Avatar } from "../components/UI";
import { timeAgo } from "../lib/utils";

// ── Icons ─────────────────────────────────────────────────────────────────
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ── Tracker types ─────────────────────────────────────────────────────────
const TRACKER_TYPES = [
  { id: "date_counter",  label: "📅 date counter",      desc: "days since a special date" },
  { id: "habit",         label: "✅ habit streak",       desc: "daily check-in streak" },
  { id: "countdown",     label: "⏳ countdown",          desc: "days until something" },
  { id: "number",        label: "🔢 number tally",       desc: "count something up" },
  { id: "spicy",         label: "🔥 spicy tracker",      desc: "just for the two of you (18+)", locked: true },
];

// ── Supabase tracker API (uses same encryption pattern) ──────────────────
async function fetchTrackers() {
  const { data, error } = await supabase
    .from("trackers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function createTracker({ creatorId, creatorEmail, encTitle, titleIv, encDesc, descIv, trackerType, targetDate, targetNumber, isSpicy }) {
  const { data, error } = await supabase
    .from("trackers")
    .insert({
      creator_id: creatorId,
      creator_email: creatorEmail,
      title: encTitle, title_iv: titleIv,
      description: encDesc ?? null, description_iv: descIv ?? null,
      tracker_type: trackerType,
      target_date: targetDate ?? null,
      target_number: targetNumber ?? null,
      current_number: 0,
      is_spicy: isSpicy ?? false,
      log: [],
    })
    .select().single();
  if (error) throw error;
  return data;
}

async function incrementTracker(trackerId, currentNumber, currentLog, userEmail) {
  const newNum = currentNumber + 1;
  const newLog = [...(currentLog ?? []), { ts: new Date().toISOString(), by: userEmail }];
  const { error } = await supabase
    .from("trackers")
    .update({ current_number: newNum, log: newLog })
    .eq("id", trackerId);
  if (error) throw error;
  return { newNum, newLog };
}

async function resetTracker(trackerId, userEmail) {
  const newLog = [{ ts: new Date().toISOString(), by: userEmail, reset: true }];
  const { error } = await supabase
    .from("trackers")
    .update({ current_number: 0, log: newLog, last_reset: new Date().toISOString() })
    .eq("id", trackerId);
  if (error) throw error;
}

async function deleteTracker(trackerId) {
  const { error } = await supabase.from("trackers").delete().eq("id", trackerId);
  if (error) throw error;
}

function subscribeToTrackers(onUpdate) {
  const channel = supabase
    .channel("trackers-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "trackers" }, onUpdate)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Date math helpers ─────────────────────────────────────────────────────
function daysSince(isoDate) {
  if (!isoDate) return 0;
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function daysUntil(isoDate) {
  if (!isoDate) return 0;
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function streakDays(lastReset) {
  if (!lastReset) return 0;
  return daysSince(lastReset);
}

// ── Tracker Card ──────────────────────────────────────────────────────────
function TrackerCard({ tracker, currentUser, onReload }) {
  const [loading, setLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const isOwn = tracker.creator_id === currentUser.id;

  const log = Array.isArray(tracker.log) ? tracker.log : [];

  // Compute display value
  let displayValue = "";
  let displayLabel = "";
  let displaySublabel = "";
  let progress = null;

  switch (tracker.tracker_type) {
    case "date_counter": {
      const d = daysSince(tracker.target_date);
      displayValue = d.toString();
      displayLabel = d === 1 ? "day" : "days";
      displaySublabel = `since ${new Date(tracker.target_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
      break;
    }
    case "habit": {
      const d = streakDays(tracker.last_reset ?? tracker.created_at);
      displayValue = d.toString();
      displayLabel = d === 1 ? "day" : "days";
      displaySublabel = "current streak";
      break;
    }
    case "countdown": {
      const d = daysUntil(tracker.target_date);
      displayValue = d.toString();
      displayLabel = d === 1 ? "day left" : "days left";
      displaySublabel = `until ${new Date(tracker.target_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
      break;
    }
    case "number":
    case "spicy": {
      displayValue = tracker.current_number?.toString() ?? "0";
      displayLabel = tracker.tracker_type === "spicy" ? "🔥" : "times";
      if (tracker.target_number) {
        displaySublabel = `goal: ${tracker.target_number}`;
        progress = Math.min((tracker.current_number ?? 0) / tracker.target_number, 1);
      }
      break;
    }
    default:
      displayValue = "—";
  }

  const canIncrement = tracker.tracker_type === "number" || tracker.tracker_type === "spicy";
  const canReset = tracker.tracker_type === "habit" || tracker.tracker_type === "number" || tracker.tracker_type === "spicy";

  async function handleIncrement() {
    setLoading(true);
    try {
      await incrementTracker(tracker.id, tracker.current_number ?? 0, log, currentUser.email);
      onReload();
    } catch {}
    setLoading(false);
  }

  async function handleReset() {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return; }
    setLoading(true);
    try {
      await resetTracker(tracker.id, currentUser.email);
      setConfirmReset(false);
      onReload();
    } catch {}
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 4000); return; }
    try {
      await deleteTracker(tracker.id);
      onReload();
    } catch {}
  }

  const typeInfo = TRACKER_TYPES.find(t => t.id === tracker.tracker_type);
  const isSpicy = tracker.is_spicy || tracker.tracker_type === "spicy";

  return (
    <div style={{
      ...s.card,
      borderColor: isSpicy ? "rgba(220,60,60,0.25)" : "var(--color-border-md)",
      background: isSpicy ? "var(--color-spicy-bg)" : "var(--color-surface)",
    }}>
      {/* Header */}
      <div style={s.cardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 16 }}>{typeInfo?.label.split(" ")[0] ?? "📊"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ ...s.cardTitle, color: isSpicy ? "var(--color-spicy-accent)" : "var(--color-text-1)" }}>
              {tracker._plainTitle || "..."}
            </h3>
            {tracker._plainDesc && <p style={s.cardDesc}>{tracker._plainDesc}</p>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {isOwn && (
            <>
              {canReset && (
                <button
                  style={{ ...s.iconBtn, color: confirmReset ? "var(--color-danger)" : "var(--color-text-3)" }}
                  onClick={handleReset} disabled={loading}
                  title={confirmReset ? "confirm reset?" : "reset"}
                >
                  {confirmReset ? <span style={{ fontSize: 10 }}>reset?</span> : "↺"}
                </button>
              )}
              <button
                style={{ ...s.iconBtn, color: confirmDelete ? "var(--color-danger)" : "var(--color-text-3)" }}
                onClick={handleDelete}
                title={confirmDelete ? "confirm delete?" : "delete"}
              >
                {confirmDelete ? <span style={{ fontSize: 10 }}>del?</span> : <TrashIcon />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Big number display */}
      <div style={s.valueBlock}>
        <span style={{
          ...s.bigNumber,
          color: isSpicy ? "var(--color-spicy-accent)" : "var(--color-text-1)",
        }}>
          {displayValue}
        </span>
        <div style={s.valueMeta}>
          <span style={s.valueLabel}>{displayLabel}</span>
          {displaySublabel && <span style={s.valueSub}>{displaySublabel}</span>}
        </div>
      </div>

      {/* Progress bar for number trackers with a goal */}
      {progress !== null && (
        <div style={s.progressTrack}>
          <div style={{
            ...s.progressBar,
            width: `${progress * 100}%`,
            background: isSpicy ? "var(--color-spicy-accent)" : "var(--color-accent)",
          }} />
        </div>
      )}

      {/* Actions */}
      <div style={s.cardActions}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Avatar email={tracker.creator_email} size={18} />
          <span style={s.metaText}>by {tracker.creator_email} · {timeAgo(tracker.created_at)}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {log.length > 0 && (
            <button style={s.logBtn} onClick={() => setShowLog(v => !v)}>
              {showLog ? "hide log" : `log (${log.length})`}
            </button>
          )}
          {canIncrement && (
            <button
              style={{
                ...s.incrementBtn,
                background: isSpicy ? "var(--color-spicy-accent)" : "var(--color-text-1)",
              }}
              onClick={handleIncrement}
              disabled={loading}
            >
              {loading ? "..." : <><PlusIcon /> add one</>}
            </button>
          )}
        </div>
      </div>

      {/* Log */}
      {showLog && log.length > 0 && (
        <div style={s.logList}>
          {[...log].reverse().slice(0, 10).map((entry, i) => (
            <div key={i} style={s.logEntry}>
              <span style={s.logTime}>{timeAgo(entry.ts)}</span>
              <span style={s.logBy}>
                {entry.reset ? "🔄 reset by" : "✦"} {entry.by}
              </span>
            </div>
          ))}
          {log.length > 10 && <p style={s.logMore}>+{log.length - 10} more entries</p>}
        </div>
      )}
    </div>
  );
}

// ── Create Form ───────────────────────────────────────────────────────────
function CreateTrackerForm({ user, onCreated, onCancel }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState("date_counter");
  const [targetDate, setTargetDate] = useState("");
  const [targetNumber, setTargetNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedType = TRACKER_TYPES.find(t => t.id === type);
  const needsDate = type === "date_counter" || type === "countdown";
  const needsNumber = type === "number" || type === "spicy";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (needsDate && !targetDate) { setError("Please pick a date."); return; }

    const keys = getSessionKeys();
    if (!keys?.sharedAesKey) { setError("Encryption not ready."); return; }

    setLoading(true); setError("");
    try {
      const encTitle = await encryptText(title.trim(), keys.sharedAesKey);
      const encDesc  = desc.trim() ? await encryptText(desc.trim(), keys.sharedAesKey) : null;

      await createTracker({
        creatorId: user.id,
        creatorEmail: user.email,
        encTitle: encTitle.cipherB64,
        titleIv: encTitle.ivB64,
        encDesc: encDesc?.cipherB64 ?? null,
        descIv: encDesc?.ivB64 ?? null,
        trackerType: type,
        targetDate: needsDate ? targetDate : null,
        targetNumber: needsNumber && targetNumber ? parseInt(targetNumber, 10) : null,
        isSpicy: type === "spicy",
      });
      onCreated();
    } catch (err) {
      setError(err.message ?? "Failed to create tracker.");
    }
    setLoading(false);
  }

  return (
    <div style={s.formCard}>
      <h3 style={s.formTitle}>✦ new tracker</h3>
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Type picker */}
        <div>
          <label style={s.label}>type</label>
          <div style={s.typeGrid}>
            {TRACKER_TYPES.map(t => (
              <button
                key={t.id}
                type="button"
                style={{
                  ...s.typeBtn,
                  borderColor: type === t.id
                    ? (t.id === "spicy" ? "var(--color-spicy-accent)" : "var(--color-accent)")
                    : "var(--color-border-md)",
                  background: type === t.id
                    ? (t.id === "spicy" ? "var(--color-spicy-bg)" : "var(--color-accent-bg)")
                    : "var(--color-surface)",
                  color: type === t.id
                    ? (t.id === "spicy" ? "var(--color-spicy-accent)" : "var(--color-accent-text)")
                    : "var(--color-text-2)",
                }}
                onClick={() => setType(t.id)}
              >
                <span style={{ fontSize: 16 }}>{t.label.split(" ")[0]}</span>
                <span style={{ fontSize: 12, lineHeight: 1.3 }}>{t.label.slice(t.label.indexOf(" ") + 1)}</span>
                <span style={{ fontSize: 10, color: "var(--color-text-3)", marginTop: 2 }}>{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <Input id="tr-title" label="title"
          placeholder={type === "spicy" ? 'e.g. "spontaneous moments 🔥"' : 'e.g. "our anniversary streak"'}
          value={title} onChange={e => setTitle(e.target.value)} disabled={loading} required />

        <div>
          <label style={s.label}>description (optional)</label>
          <textarea style={s.textarea} placeholder="any notes..."
            value={desc} onChange={e => setDesc(e.target.value)} rows={2} disabled={loading} maxLength={200} />
        </div>

        {needsDate && (
          <div>
            <label style={s.label}>
              {type === "countdown" ? "target date" : "start date"}
            </label>
            <input type="date" style={s.dateInput} value={targetDate}
              onChange={e => setTargetDate(e.target.value)} disabled={loading} required />
          </div>
        )}

        {needsNumber && (
          <Input id="tr-goal" label="goal number (optional)"
            type="number" min="1" max="9999"
            placeholder="e.g. 50"
            value={targetNumber} onChange={e => setTargetNumber(e.target.value)} disabled={loading} />
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Button type="submit" variant="primary" size="md" loading={loading}
            style={{
              flex: 1,
              background: type === "spicy" ? "var(--color-spicy-accent)" : "var(--color-text-1)",
              fontFamily: "var(--font-display)", fontStyle: "italic",
            }}>
            create tracker
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={onCancel} disabled={loading}>cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ── Tracker Page ──────────────────────────────────────────────────────────
export function TrackerPage({ user }) {
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const decryptTracker = useCallback(async (t) => {
    const keys = getSessionKeys();
    if (!keys?.sharedAesKey) return t;
    try {
      const title = await decryptText(t.title, t.title_iv, keys.sharedAesKey);
      const desc  = t.description ? await decryptText(t.description, t.description_iv, keys.sharedAesKey) : null;
      return { ...t, _plainTitle: title, _plainDesc: desc };
    } catch {
      return { ...t, _plainTitle: "[could not decrypt]", _plainDesc: null };
    }
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const raw = await fetchTrackers();
      const decrypted = await Promise.all(raw.map(decryptTracker));
      setTrackers(decrypted);
    } catch {
      setError("Failed to load trackers.");
    }
    setLoading(false);
  }, [decryptTracker]);

  useEffect(() => {
    load();
    const unsub = subscribeToTrackers(load);
    return unsub;
  }, [load]);

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h2 style={s.pageTitle}>📊 trackers</h2>
          <p style={s.pageSub}>date counters, habit streaks, countdowns — and the spicy stuff 🔥</p>
        </div>
        {!showForm && (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
            + new tracker
          </Button>
        )}
      </div>

      {showForm && (
        <CreateTrackerForm
          user={user}
          onCreated={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner size={24} /></div>
      ) : trackers.length === 0 ? (
        <div style={s.empty}>
          <span style={{ fontSize: 40 }}>📊</span>
          <p style={s.emptyText}>no trackers yet</p>
          <p style={s.emptySub}>track your streak, countdown to a date, or keep score of the spicy stuff</p>
        </div>
      ) : (
        trackers.map(t => (
          <TrackerCard
            key={t.id}
            tracker={t}
            currentUser={user}
            onReload={load}
          />
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

  formCard: { background: "var(--color-surface)", border: "0.5px solid var(--color-border-md)", borderRadius: "var(--radius-lg)", padding: 20, marginBottom: 20, boxShadow: "var(--shadow-card)" },
  formTitle: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16, color: "var(--color-text-1)", marginBottom: 14 },
  label: { display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-2)", marginBottom: 6, letterSpacing: "0.03em" },
  textarea: { display: "block", width: "100%", padding: "10px 14px", border: "1px solid var(--color-border-md)", borderRadius: "var(--radius-md)", background: "var(--color-surface)", color: "var(--color-text-1)", fontSize: 14, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" },
  dateInput: { display: "block", width: "100%", padding: "10px 14px", border: "1px solid var(--color-border-md)", borderRadius: "var(--radius-md)", background: "var(--color-surface)", color: "var(--color-text-1)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },

  typeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 },
  typeBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 8px", borderRadius: "var(--radius-md)", border: "0.5px solid", cursor: "pointer", textAlign: "center", transition: "all var(--duration-fast)", lineHeight: 1.2 },

  // Tracker card
  card: { border: "0.5px solid", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 12, boxShadow: "var(--shadow-card)", transition: "all 0.25s ease" },
  cardHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 8 },
  cardTitle: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16, margin: 0, lineHeight: 1.3 },
  cardDesc: { fontSize: 12, color: "var(--color-text-3)", margin: "3px 0 0", lineHeight: 1.4 },

  valueBlock: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 },
  bigNumber: { fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 52, lineHeight: 1, letterSpacing: "-2px" },
  valueMeta: { display: "flex", flexDirection: "column", gap: 2 },
  valueLabel: { fontSize: 16, color: "var(--color-text-2)", fontFamily: "var(--font-display)", fontStyle: "italic" },
  valueSub: { fontSize: 12, color: "var(--color-text-3)" },

  progressTrack: { height: 4, background: "var(--color-border-md)", borderRadius: 99, overflow: "hidden", marginBottom: 12 },
  progressBar: { height: "100%", borderRadius: 99, transition: "width 0.6s ease" },

  cardActions: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--color-border)" },
  metaText: { fontSize: 11, color: "var(--color-text-3)" },
  logBtn: { background: "none", border: "0.5px solid var(--color-border-md)", borderRadius: "var(--radius-full)", padding: "4px 10px", fontSize: 11, color: "var(--color-text-3)", cursor: "pointer", fontFamily: "var(--font-body)" },
  incrementBtn: { display: "inline-flex", alignItems: "center", gap: 4, color: "#fff", border: "none", borderRadius: "var(--radius-full)", padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 500, fontFamily: "var(--font-body)" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: "4px 6px", fontSize: 14, borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center" },

  logList: { marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 4 },
  logEntry: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  logTime: { fontSize: 11, color: "var(--color-text-3)" },
  logBy: { fontSize: 11, color: "var(--color-text-2)" },
  logMore: { fontSize: 11, color: "var(--color-text-3)", textAlign: "center", margin: 0 },

  empty: { textAlign: "center", padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  emptyText: { fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 18, color: "var(--color-text-2)", margin: 0 },
  emptySub: { fontSize: 13, color: "var(--color-text-3)", margin: 0, maxWidth: 280 },
};