// -----------------------------
// Parse Tip JSON (AI path) v2 – soft validator + rescue logic
// -----------------------------

const raw = ($json.output || $json.text || "").toString().trim();

// -----------------------------
// Default-Fallback (IMMER gültig)
// -----------------------------
let obj = {
  tip: raw || "Kein Tipp...",
  tip_type: "general",
  confidence: 0.5,
  reasoning_mode: "full_llm",
  evidence: [],
  risk_if_wrong: "",
  warnings: [],
  sentiment: "neutral",
  talk_ratio_warning: false,
  pacing_warning: false
};

// -----------------------------
// Helper
// -----------------------------
function readNodeJson(nodeName) {
  try {
    return $node[nodeName].json || {};
  } catch (_) {
    return {};
  }
}

function tryParseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1);
    try { return JSON.parse(slice); } catch (_) {}
  }
  return null;
}

function clamp01(n, fallback = 0.5) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
}

function wordCount(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

function classifyTip(t) {
  const s = String(t || "").toLowerCase();
  if (s.includes("termin") || s.includes("datum") || s.includes("blocken") || s.includes("kalender")) return "timing";
  if (s.includes("entscheidung") || s.includes("fix") || s.includes("heute") || s.includes("grünes licht")) return "decision";
  if (s.includes("wenn ich") && s.includes("schicke")) return "commit";
  if (s.includes("was hält") || s.includes("was genau") || s.includes("gibt es außer")) return "objection_isolation";
  if (s.includes("preis") || s.includes("budget")) return "price";
  return "general";
}

// Soft validator: mark warnings, but DO NOT overwrite tip
function validateTipFormat(tip) {
  const t = String(tip || "").trim();
  const re = /^(.+?)\s*→\s*(.+?)\s*→\s*Sag:\s*"([^"]+)"\s*$/i;
  const m = t.match(re);
  if (!m) return { ok: false, reason: "format_mismatch" };

  const moveWords = wordCount(m[1].trim());
  const warumWords = wordCount(m[2].trim());
  const skriptWords = wordCount(m[3].trim());
  const totalWords = wordCount(t);

  if (moveWords > 3) return { ok: false, reason: "move_too_long" };
  if (warumWords > 8) return { ok: false, reason: "warum_too_long" };
  if (skriptWords > 20) return { ok: false, reason: "skript_too_long" };
  if (totalWords < 30 || totalWords > 45) return { ok: false, reason: "total_words_out_of_range" };

  return { ok: true };
}

// -----------------------------
// Parse
// -----------------------------
const parsed = tryParseJson(raw);
if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
  obj = { ...obj, ...parsed };
}

const kb             = readNodeJson("KI-Bremse");
const ensureFacts    = readNodeJson("Ensure Session Facts v1");
const feedbackNode   = readNodeJson("Build Feedback Guidance v1");
const extractedLeadProfileNode = readNodeJson("Extract Lead Profile from Pinecone");
const loadLeadProfileNode      = readNodeJson("Load Lead Profile");

// -----------------------------
// Harden live_tip_v2 fields
// -----------------------------
obj.tip = String(obj.tip || "").trim() || "Kein Tipp...";
obj.tip_type = String(obj.tip_type || "").trim() || classifyTip(obj.tip);
obj.confidence = clamp01(obj.confidence, 0.5);
obj.reasoning_mode = ["fastlane_rule", "pattern_match", "full_llm"].includes(obj.reasoning_mode)
  ? obj.reasoning_mode
  : "full_llm";

if (!Array.isArray(obj.evidence)) obj.evidence = [];
obj.evidence = obj.evidence
  .filter((e) => e && typeof e === "object")
  .map((e) => ({
    source: ["pattern_node", "historical_deal", "session_fact"].includes(e.source) ? e.source : "historical_deal",
    id: String(e.id || "unknown"),
    why_relevant: String(e.why_relevant || "")
  }));

obj.risk_if_wrong = String(obj.risk_if_wrong || "");
if (!Array.isArray(obj.warnings)) obj.warnings = [];
obj.warnings = obj.warnings.map((w) => String(w));

obj.sentiment = ["positive", "neutral", "negative"].includes(obj.sentiment) ? obj.sentiment : "neutral";
obj.talk_ratio_warning = !!obj.talk_ratio_warning;
obj.pacing_warning = !!obj.pacing_warning;

// -----------------------------
// Soft format checks + Rescue-Logic
// -----------------------------
const tipCheck = validateTipFormat(obj.tip);
if (!tipCheck.ok) {
  obj.warnings.push(`tip_format_invalid:${tipCheck.reason}`);

  // Rescue: wenn das Modell nur einen kurzen MOVE ohne Pfeil geliefert hat,
  // Gerüst aus dem MOVE-Fragment bauen damit der Tipp nutzbar bleibt
  const tipTxt = String(obj.tip || "").trim();
  const hasArrow = tipTxt.includes("→") || tipTxt.includes("->");
  const hasSag   = /sag\s*:/i.test(tipTxt);

  if (!hasArrow && !hasSag && tipTxt.length >= 4 && tipTxt.length < 60) {
    const move = tipTxt.split(/\s+/).slice(0, 3).join(" ");
    obj.tip = `${move} → Verbindlichkeit schafft Momentum. → Sag: "Können wir das direkt als nächsten Schritt festhalten, damit wir keine Zeit verlieren?"`;
    obj.warnings.push("tip_format_rescued:move_only");
  }
}

// Hard fallback ONLY if tip is still empty/useless after rescue
if (!obj.tip || obj.tip === "Kein Tipp..." || obj.tip.length < 8) {
  obj.tip = "Naechsten Schritt fixieren → Kunde braucht Verbindlichkeit. → Sag: \"Lass uns direkt einen klaren Termin festmachen: passt dir Mittwoch 15 Uhr oder Freitag 10 Uhr besser, damit wir verbindlich starten und keine Zeit verlieren?\"";
  obj.tip_type = "timing";
  obj.confidence = Math.min(obj.confidence, 0.5);
  obj.reasoning_mode = "full_llm";
  obj.warnings.push("tip_empty_forced_fallback");
}

// -----------------------------
// Carry KI-Bremse context
// -----------------------------
obj.live_context_text = kb.live_context_text ?? "";
obj.memory_context_text = kb.memory_context_text ?? "";
obj.memory_topics = Array.isArray(kb.memory_topics) ? kb.memory_topics : [];

obj.session_facts =
  kb.session_facts ??
  obj.session_facts ??
  ensureFacts.session_facts ??
  null;

obj.reference_query = kb.reference_query ?? "";
obj.ref_context     = kb.ref_context ?? "";

obj.wpm_you       = kb.wpm_you ?? null;
obj.wpm_them      = kb.wpm_them ?? null;
obj.wpm_burst_you = kb.wpm_burst_you ?? null;

obj.pacing_you  = kb.pacing_you ?? "n/a";
obj.pacing_them = kb.pacing_them ?? "n/a";

obj.talk_ratio_pct_you  = kb.talk_ratio_pct_you ?? null;
obj.talk_ratio_pct_them = kb.talk_ratio_pct_them ?? null;

obj.words_you = kb.words_you ?? null;
obj.words_them = kb.words_them ?? null;

obj.dominates        = kb.dominates ?? "balanced";
obj.avg_talk_ratio_you = kb.avg_talk_ratio_you ?? null;

obj.current_wpm   = kb.current_wpm ?? obj.wpm_you ?? null;
obj.pacing_status = kb.pacing_status ?? obj.pacing_you ?? "n/a";

// -----------------------------
// Deterministic warnings
// -----------------------------
const burstWarning = (kb.wpm_burst_you != null)
  ? Number(kb.wpm_burst_you) > 170
  : false;
obj.pacing_warning = !!kb.pacing_warning || burstWarning;

const trYou = (kb.talk_ratio_pct_you != null) ? Number(kb.talk_ratio_pct_you) : null;
obj.talk_ratio_warning = (kb.dominates === "you") || (trYou !== null && trYou > 55);

// Allowed tip types
const allowedTipTypes = ["timing", "decision", "commit", "objection_isolation", "price", "general"];
if (!allowedTipTypes.includes(obj.tip_type)) {
  obj.tip_type = classifyTip(obj.tip);
}

// Evidence fallback
if (obj.evidence.length === 0) {
  obj.evidence.push({
    source: "session_fact",
    id: String(kb.session_id || "session_unknown"),
    why_relevant: "Fallback evidence from current session context."
  });
}

// -----------------------------
// Feedback fields (from guidance node)
// -----------------------------
obj.feedback_best_tip_type  = feedbackNode.feedback_best_tip_type  ?? obj.feedback_best_tip_type  ?? null;
obj.feedback_avoid_tip_type = feedbackNode.feedback_avoid_tip_type ?? obj.feedback_avoid_tip_type ?? null;
obj.feedback_guidance       = feedbackNode.feedback_guidance       ?? obj.feedback_guidance       ?? "";
obj.feedback_scored_types   = Array.isArray(feedbackNode.feedback_scored_types)
  ? feedbackNode.feedback_scored_types
  : (Array.isArray(obj.feedback_scored_types) ? obj.feedback_scored_types : []);
obj.feedback_rows_used = Number.isFinite(Number(feedbackNode.feedback_rows_used))
  ? Number(feedbackNode.feedback_rows_used)
  : (Number.isFinite(Number(obj.feedback_rows_used)) ? Number(obj.feedback_rows_used) : 0);

// -----------------------------
// Lead profile fields (from Pinecone)
// -----------------------------
let leadProfile      = null;
let leadProfileDebug = null;

// Preferred source: Extract Lead Profile from Pinecone
if (extractedLeadProfileNode && typeof extractedLeadProfileNode === "object") {
  if (extractedLeadProfileNode.lead_profile && typeof extractedLeadProfileNode.lead_profile === "object") {
    leadProfile = extractedLeadProfileNode.lead_profile;
  }
  if (extractedLeadProfileNode.lead_profile_debug && typeof extractedLeadProfileNode.lead_profile_debug === "object") {
    leadProfileDebug = extractedLeadProfileNode.lead_profile_debug;
  }
}

// Fallback source: directly from Load Lead Profile matches
if (!leadProfile) {
  const matches = Array.isArray(loadLeadProfileNode.matches) ? loadLeadProfileNode.matches : [];
  if (matches.length) {
    const sorted = [...matches].sort((a, b) => {
      const ta = Date.parse(a?.metadata?.processed_at || a?.metadata?.timestamp || 0) || 0;
      const tb = Date.parse(b?.metadata?.processed_at || b?.metadata?.timestamp || 0) || 0;
      return tb - ta;
    });
    const picked = sorted[0];
    const m = picked?.metadata || {};
    leadProfile = {
      lead_name:          m.lead_name          ?? null,
      contact_name:       m.contact_name       ?? null,
      company_name:       m.company_name       ?? null,
      city_tag:           m.city_tag           ?? null,
      industry:           m.industry           ?? null,
      lead_source:        m.lead_source        ?? null,
      lead_owner_name:    m.lead_owner_name    ?? null,
      deal_stage_at_call: m.deal_stage_at_call ?? null,
      avg_response_days:  m.avg_response_days  ?? null,
      email_count:        m.email_count        ?? null,
      notes_count:        m.notes_count        ?? null
    };
    leadProfileDebug = {
      matches_count: matches.length,
      picked_from_id: picked?.id || null
    };
  }
}

if (!leadProfile) {
  leadProfile = {
    lead_name: null, contact_name: null, company_name: null,
    city_tag: null, industry: null, lead_source: null,
    lead_owner_name: null, deal_stage_at_call: null,
    avg_response_days: null, email_count: null, notes_count: null
  };
}
if (!leadProfileDebug) {
  leadProfileDebug = { matches_count: 0, picked_from_id: null };
}

obj.lead_profile       = leadProfile;
obj.lead_profile_debug = leadProfileDebug;

// Flat convenience fields for overlay/UI
obj.lead_name          = leadProfile.lead_name          ?? null;
obj.contact_name       = leadProfile.contact_name       ?? null;
obj.company_name       = leadProfile.company_name       ?? null;
obj.city_tag           = leadProfile.city_tag           ?? null;
obj.industry           = leadProfile.industry           ?? null;
obj.lead_source        = leadProfile.lead_source        ?? null;
obj.lead_owner_name    = leadProfile.lead_owner_name    ?? null;
obj.deal_stage_at_call = leadProfile.deal_stage_at_call ?? null;
obj.avg_response_days  = leadProfile.avg_response_days  ?? null;
obj.email_count        = leadProfile.email_count        ?? null;
obj.notes_count        = leadProfile.notes_count        ?? null;

// -----------------------------
// Meta + tip_id
// -----------------------------
obj.generated_at = kb.generated_at || obj.generated_at || new Date().toISOString();
obj.session_id   = kb.session_id   || obj.session_id   || ensureFacts.session_id || null;
obj.lead_id      = kb.lead_id      || obj.lead_id      || ensureFacts.lead_id    || null;
obj.new_run      = true;

function simpleHash(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

const tipIdBase = [
  obj.session_id  || "no_session",
  obj.generated_at || "",
  obj.tip          || ""
].join("|");

// Preserve existing tip_id if already set (important for feedback loop)
obj.tip_id = obj.tip_id || `tip_${simpleHash(tipIdBase)}`;

// Warning dedup
obj.warnings = [...new Set(obj.warnings)];

return [{ json: obj }];
