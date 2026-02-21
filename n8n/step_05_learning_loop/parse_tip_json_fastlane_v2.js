// Fastlane-only parser
// Erwartet Input aus "Apply Fastlane Tip" bzw. "Rule Fastlane v1"

const j = $json || {};
const kb = $node["KI-Bremse"].json || {};

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

// Evidence fallback
if (out.evidence.length === 0) {
  out.evidence.push({
    source: "session_fact",
    id: String(kb.session_id || j.session_id || "session_unknown"),
    why_relevant: "Fastlane rule triggered by keyword signal."
  });
}

// KI-Bremse Kontext übernehmen
out.live_context_text = kb.live_context_text ?? j.live_context_text ?? "";
out.memory_context_text = kb.memory_context_text ?? j.memory_context_text ?? "";
out.memory_topics = Array.isArray(kb.memory_topics) ? kb.memory_topics : (Array.isArray(j.memory_topics) ? j.memory_topics : []);

out.reference_query = kb.reference_query ?? j.reference_query ?? "";
out.ref_context = kb.ref_context ?? j.ref_context ?? "";

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

const burstWarning = kb.wpm_burst_you != null ? Number(kb.wpm_burst_you) > 170 : false;
out.pacing_warning = !!kb.pacing_warning || out.pacing_warning || burstWarning;

const trYou = kb.talk_ratio_pct_you != null ? Number(kb.talk_ratio_pct_you) : null;
out.talk_ratio_warning = out.talk_ratio_warning || (kb.dominates === "you") || (trYou !== null && trYou > 55);

// Meta + tip_id
out.generated_at = kb.generated_at || out.generated_at || new Date().toISOString();
out.session_id = kb.session_id || out.session_id || null;
out.lead_id = kb.lead_id || out.lead_id || null;
out.new_run = true;

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
  out.session_id || "no_session",
  out.generated_at || "",
  out.tip || ""
].join("|");

out.tip_id = `tip_${simpleHash(tipIdBase)}`;

return [{ json: out }];
