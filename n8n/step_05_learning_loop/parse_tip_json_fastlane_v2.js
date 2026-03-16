// -----------------------------
// Parse Tip JSON (Fastlane path) v2 – parity with AI parser
// Erwartet Input aus "Apply Fastlane Tip" bzw. "Rule Fastlane v1"
// -----------------------------

const j = $json || {};

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

function clamp01(v, d = 0.5) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d;
}

function classifyTip(t) {
  const s = String(t || "").toLowerCase();
  if (s.includes("preis") || s.includes("budget") || s.includes("kosten")) return "price";
  if (s.includes("termin") || s.includes("kalender") || s.includes("zeit")) return "timing";
  if (s.includes("entscheidung") || s.includes("fix")) return "decision";
  if (s.includes("wenn ich") && s.includes("schicke")) return "commit";
  if (s.includes("was genau") || s.includes("was hält")) return "objection_isolation";
  return "general";
}

function wordCount(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
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
// Read upstream nodes
// -----------------------------
const kb             = readNodeJson("KI-Bremse");
const ensureFacts    = readNodeJson("Ensure Session Facts v1");
const feedbackNode   = readNodeJson("Build Feedback Guidance v1");
const extractedLeadProfileNode = readNodeJson("Extract Lead Profile from Pinecone");
const loadLeadProfileNode      = readNodeJson("Load Lead Profile");

// -----------------------------
// Default output
// -----------------------------
let out = {
  tip: String(j.tip || "").trim() || "Kein Tipp...",
  tip_type: String(j.tip_type || "").trim() || classifyTip(j.tip),
  confidence: clamp01(j.confidence, 0.7),
  reasoning_mode: "fastlane_rule",
  evidence: Array.isArray(j.evidence) ? j.evidence : [],
  risk_if_wrong: String(j.risk_if_wrong || ""),
  warnings: Array.isArray(j.warnings) ? j.warnings.map(String) : [],
  sentiment: ["positive", "neutral", "negative"].includes(j.sentiment) ? j.sentiment : "neutral",
  talk_ratio_warning: !!j.talk_ratio_warning,
  pacing_warning: !!j.pacing_warning
};

// -----------------------------
// Soft format checks + Rescue-Logic
// -----------------------------
const tipCheck = validateTipFormat(out.tip);
if (!tipCheck.ok) {
  out.warnings.push(`tip_format_invalid:${tipCheck.reason}`);

  const tipTxt = String(out.tip || "").trim();
  const hasArrow = tipTxt.includes("\u2192") || tipTxt.includes("->");
  const hasSag   = /sag\s*:/i.test(tipTxt);

  if (!hasArrow && !hasSag && tipTxt.length >= 4 && tipTxt.length < 60) {
    const move = tipTxt.split(/\s+/).slice(0, 3).join(" ");
    out.tip = `${move} \u2192 Verbindlichkeit schafft Momentum. \u2192 Sag: "K\u00f6nnen wir das direkt als n\u00e4chsten Schritt festhalten, damit wir keine Zeit verlieren?"`;
    out.warnings.push("tip_format_rescued:move_only");
  }
}

// Hard fallback ONLY if tip is still empty/useless after rescue
if (!out.tip || out.tip === "Kein Tipp..." || out.tip.length < 8) {
  out.tip = "Naechsten Schritt fixieren \u2192 Kunde braucht Verbindlichkeit. \u2192 Sag: \"Lass uns direkt einen klaren Termin festmachen: passt dir Mittwoch 15 Uhr oder Freitag 10 Uhr besser, damit wir verbindlich starten und keine Zeit verlieren?\"";
  out.tip_type = "timing";
  out.confidence = Math.min(out.confidence, 0.5);
  out.warnings.push("tip_empty_forced_fallback");
}

// Evidence fallback
if (out.evidence.length === 0) {
  out.evidence.push({
    source: "session_fact",
    id: String(kb.session_id || j.session_id || "session_unknown"),
    why_relevant: "Fastlane rule triggered by keyword signal."
  });
}

// -----------------------------
// KI-Bremse context
// -----------------------------
out.live_context_text = kb.live_context_text ?? j.live_context_text ?? "";
out.memory_context_text = kb.memory_context_text ?? j.memory_context_text ?? "";
out.memory_topics = Array.isArray(kb.memory_topics) ? kb.memory_topics : (Array.isArray(j.memory_topics) ? j.memory_topics : []);

out.script_phase            = kb.script_phase            ?? j.script_phase            ?? null;
out.script_phase_confidence = kb.script_phase_confidence ?? j.script_phase_confidence ?? null;

// -----------------------------
// Needs + Objection (keyword layer from KI-Bremse)
// -----------------------------
out.detected_needs         = Array.isArray(kb.detected_needs_session) ? kb.detected_needs_session : (Array.isArray(j.detected_needs) ? j.detected_needs : []);
out.active_objection       = kb.active_objection       ?? j.active_objection       ?? null;
out.objection_fastlane_trigger = kb.objection_fastlane_trigger ?? j.objection_fastlane_trigger ?? false;

// -----------------------------
// Session Facts
// -----------------------------
out.session_facts =
  kb.session_facts ??
  j.session_facts ??
  ensureFacts.session_facts ??
  null;

out.reference_query = kb.reference_query ?? j.reference_query ?? "";
out.ref_context = kb.ref_context ?? j.ref_context ?? "";
out.reference_branche_primary = kb.reference_branche_primary ?? j.reference_branche_primary ?? null;

// -----------------------------
// WPM / Pacing / Talk-Ratio
// -----------------------------
out.wpm_you = kb.wpm_you ?? j.wpm_you ?? null;
out.wpm_them = kb.wpm_them ?? j.wpm_them ?? null;
out.wpm_burst_you = kb.wpm_burst_you ?? j.wpm_burst_you ?? null;
out.pacing_you = kb.pacing_you ?? j.pacing_you ?? "n/a";
out.pacing_them = kb.pacing_them ?? j.pacing_them ?? "n/a";

out.talk_ratio_pct_you = kb.talk_ratio_pct_you ?? j.talk_ratio_pct_you ?? null;
out.talk_ratio_pct_them = kb.talk_ratio_pct_them ?? j.talk_ratio_pct_them ?? null;
out.words_you = kb.words_you ?? j.words_you ?? null;
out.words_them = kb.words_them ?? j.words_them ?? null;
out.dominates = kb.dominates ?? j.dominates ?? "balanced";
out.avg_talk_ratio_you = kb.avg_talk_ratio_you ?? j.avg_talk_ratio_you ?? null;

out.current_wpm = kb.current_wpm ?? out.wpm_you ?? null;
out.pacing_status = kb.pacing_status ?? out.pacing_you ?? "n/a";

// -----------------------------
// Personality Type + Cross-Industry (from KI-Bremse v2.7)
// -----------------------------
out.customer_personality_type       = kb.customer_personality_type ?? "unknown";
out.customer_personality_confidence = typeof kb.customer_personality_confidence === "number" ? kb.customer_personality_confidence : 0;
out.personality_signals             = Array.isArray(kb.personality_signals) ? kb.personality_signals : [];
out.cross_industry_mode             = !!kb.cross_industry_mode;

// -----------------------------
// Deterministic warnings
// -----------------------------
const burstWarning = kb.wpm_burst_you != null ? Number(kb.wpm_burst_you) > 170 : false;
out.pacing_warning = !!kb.pacing_warning || out.pacing_warning || burstWarning;

const trYou = kb.talk_ratio_pct_you != null ? Number(kb.talk_ratio_pct_you) : null;
out.talk_ratio_warning = out.talk_ratio_warning || (kb.dominates === "you") || (trYou !== null && trYou > 55);

// Allowed tip types
const allowedTipTypes = ["timing", "decision", "commit", "objection_isolation", "price", "general"];
if (!allowedTipTypes.includes(out.tip_type)) {
  out.tip_type = classifyTip(out.tip);
}

// -----------------------------
// Feedback fields (from guidance node)
// -----------------------------
out.feedback_best_tip_type  = feedbackNode.feedback_best_tip_type  ?? j.feedback_best_tip_type  ?? null;
out.feedback_avoid_tip_type = feedbackNode.feedback_avoid_tip_type ?? j.feedback_avoid_tip_type ?? null;
out.feedback_guidance       = feedbackNode.feedback_guidance       ?? j.feedback_guidance       ?? "";
out.feedback_scored_types   = Array.isArray(feedbackNode.feedback_scored_types)
  ? feedbackNode.feedback_scored_types
  : (Array.isArray(j.feedback_scored_types) ? j.feedback_scored_types : []);
out.feedback_rows_used = Number.isFinite(Number(feedbackNode.feedback_rows_used))
  ? Number(feedbackNode.feedback_rows_used)
  : (Number.isFinite(Number(j.feedback_rows_used)) ? Number(j.feedback_rows_used) : 0);

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

out.lead_profile       = leadProfile;
out.lead_profile_debug = leadProfileDebug;

// Flat convenience fields for overlay/UI
out.lead_name          = leadProfile.lead_name          ?? null;
out.contact_name       = leadProfile.contact_name       ?? null;
out.company_name       = leadProfile.company_name       ?? null;
out.city_tag           = leadProfile.city_tag           ?? null;
out.industry           = leadProfile.industry           ?? null;
out.lead_source        = leadProfile.lead_source        ?? null;
out.lead_owner_name    = leadProfile.lead_owner_name    ?? null;
out.deal_stage_at_call = leadProfile.deal_stage_at_call ?? null;
out.avg_response_days  = leadProfile.avg_response_days  ?? null;
out.email_count        = leadProfile.email_count        ?? null;
out.notes_count        = leadProfile.notes_count        ?? null;

// -----------------------------
// Meta + tip_id
// -----------------------------
out.generated_at = kb.generated_at || j.generated_at || new Date().toISOString();
out.session_id   = kb.session_id   || j.session_id   || ensureFacts.session_id || null;
out.lead_id      = kb.lead_id      || j.lead_id      || ensureFacts.lead_id    || null;
out.new_run      = true;

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
  out.session_id  || "no_session",
  out.generated_at || "",
  out.tip          || ""
].join("|");

// Preserve existing tip_id if already set
out.tip_id = j.tip_id || `tip_${simpleHash(tipIdBase)}`;

// Warning dedup
out.warnings = [...new Set(out.warnings)];

return [{ json: out }];
