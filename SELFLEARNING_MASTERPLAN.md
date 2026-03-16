# SalesIntelligence — Self-Learning Masterplan

> Ziel: Die KI wird mit jedem Call schlauer — nicht nur aus individuellem Feedback, sondern aus Mustern über hunderte Calls, Branchen, Persönlichkeitstypen und Deal-Outcomes.

**Erstellt:** 2026-03-13
**Status:** Phase 1-3 vollständig LIVE (2026-03-13)

---

## Architektur-Überblick

```
                    ┌──────────────────────────────────────────────┐
                    │           LIVE CALL (alle 40 Sek)            │
                    │                                              │
                    │  KI-Bremse v2.7                              │
                    │  ├─ WPM, Talk-Ratio, Dominanz                │
                    │  ├─ Branchenerkennung (66 Kategorien)        │
                    │  ├─ Needs Detection (8 Kategorien)           │
                    │  ├─ Objection Detection (6 Kategorien)       │
                    │  ├─ Sales Phase Detection (5 Phasen)         │
                    │  ├─ Personality Type (DISC: A/D/E/H)  ✅ NEU │
                    │  └─ Cross-Industry Mode Flag          ✅ NEU │
                    │                                              │
                    │  Ensure Session Facts                        │
                    │  ├─ budget_status, decision_maker_status     │
                    │  ├─ open_objections, timeline_status         │
                    │  └─ personality_type + confidence      ✅ NEU │
                    │                                              │
                    │  AI Agent (gpt-4o-mini)                      │
                    │  ├─ lead_data_search (Pinecone)              │
                    │  ├─ company_knowledge_search (Pinecone)      │
                    │  ├─ Feedback Guidance (best/avoid tip_type)  │
                    │  ├─ Personality-basierter Tipp-Stil    ✅ NEU│
                    │  ├─ TEI-Ranking pro Branche            ✅ LIVE│
                    │  └─ Industry Intelligence Profile      ✅ NEU │
                    └──────────────────────────────────────────────┘
                                        │
                                        ▼
                    ┌──────────────────────────────────────────────┐
                    │          FEEDBACK LOOP (pro Tipp)            │
                    │                                              │
                    │  Overlay → POST /webhook/tip-outcome         │
                    │  ├─ helpful / neutral / harmful / won        │
                    │  ├─ tip_id → DataTable tip_feedback_v1       │
                    │  └─ Build Feedback Guidance v1 (nächster Run)│
                    │                                              │
                    │  TEI Aggregation (wöchentlich)        ✅ DONE │
                    │  ├─ tip_type × branche × personality         │
                    │  └─ → tip_effectiveness_index (Supabase)     │
                    └──────────────────────────────────────────────┘
                                        │
                                        ▼
                    ┌──────────────────────────────────────────────┐
                    │        STRATEGISCHES LERNEN (Batch)          │
                    │                                              │
                    │  Causal Attribution (alle 3 Tage)      ✅ DONE│
                    │  Deal Close Trigger (alle 6h)          ✅ DONE│
                    │  Industry Intelligence Profiles        ✅ DONE│
                    │  Weekly Intelligence (Sonntag 04:00)   ✅ DONE│
                    │  Rep Coaching (Sonntag 05:00)           ✅ DONE│
                    │  Adaptive Prompt Evolution (monatlich)  ✅ DONE│
                    │  Rep Performance Coaching              ✅ DONE│
                    └──────────────────────────────────────────────┘
```

---

## Status-Übersicht

| # | Feature | Status | Phase |
|---|---------|--------|-------|
| 1.1 | Session Facts in AI-Prompt | ✅ LIVE | 1 |
| 1.2 | Personality Type Detection (KI-Bremse) | ✅ LIVE | 1 |
| 1.3 | Personality in AI-Agent Prompt (Tipp-Stil) | ✅ LIVE | 1 |
| 1.4 | Cross-Industry Mode Flag + Referenzanalyst | ✅ LIVE | 1 |
| 1.5 | Parser Field Pass-Through (Personality) | ✅ LIVE | 1 |
| 1.6 | Ensure Session Facts: Personality Persistence | ✅ LIVE | 1 |
| 2.1 | TEI (Tip Effectiveness Index) | ✅ LIVE | 2 |
| 2.2 | TEI in AI-Agent Prompt injizieren | ✅ LIVE | 2 |
| 2.3 | Fastlane Parser: Lead-Profile + Personality Parity | ✅ LIVE | 1 |
| 2.4 | Industry Intelligence Profiles (Supabase) | ✅ LIVE | 2 |
| 2.5 | Won/Lost Deal Causal Attribution | ✅ LIVE | 2 |
| 2.6 | Overlay: Personality-Typ Anzeige | ✅ LIVE | 2 |
| 2.7 | Overlay: Cross-Industry Indikator | ✅ LIVE | 2 |
| 3.1 | Weekly Intelligence Synthesis | ✅ LIVE | 3 |
| 3.2 | Adaptive Prompt Evolution | ✅ LIVE | 3 |
| 3.3 | Rep Performance Coaching | ✅ LIVE | 3 |
| 4.1 | Auto-TEI (automatische Tipp-Bewertung) | ✅ LIVE | 2+ |

---

## Phase 1 — Quick Wins (1-2 Wochen)

### 1.1 Session Facts in AI-Prompt ✅ LIVE
**Was:** Session Facts (budget_status, decision_maker, open_objections, next_step_committed) werden in den AI-Agent Prompt injiziert.

**Wo:** `Ensure Session Facts v1` → AI Agent `text` Parameter

**Status:** Funktioniert seit v1.2.23

---

### 1.2 Personality Type Detection ✅ LIVE
**Was:** KI-Bremse v2.7 analysiert THEM-Sprache und erkennt Persönlichkeitstyp (DISC-inspiriert).

**Typen:**
- `analytisch` (C): Daten-suchend, Detail-orientiert, fragt "warum genau", "welche Zahlen"
- `dominant` (D): Ergebnis-fokussiert, "was bringt das", kurze Sätze, ROI-Push
- `expressiv` (I): Begeistert, "toll", "fantastisch", Storytelling
- `harmonisch` (S): Vorsichtig, "was wenn das nicht klappt", Social Proof, Risiko-avers

**Technik:** Word-Boundary-Regex, min Score ≥2, normalisierte Session-Akkumulation, WPM nur bei >30 Wörtern

**Wo:** `KI-Bremse` Node → Output: `customer_personality_type`, `customer_personality_confidence`, `personality_signals`

---

### 1.3 Personality in AI-Agent Prompt ✅ LIVE
**Was:** AI-Agent bekommt Tipp-Stil-Anleitung basierend auf erkanntem Typ.

**Regeln:**
- analytisch → Zahlen zuerst, Beweis > Emotion, Präzision
- dominant → Kurz, ROI-fokussiert, max 2 Sätze, Entscheidungs-Push
- expressiv → Emotional, Begeisterung wecken, Storytelling-Hint
- harmonisch → Sanft, Risiko reduzieren, "andere Kunden haben..."
- unbekannt → Standard-Stil, ausgewogen

**Wo:** `AI Agent` Node → `text` Parameter → Block "PERSÖNLICHKEITSTYP DES KUNDEN"

---

### 1.4 Cross-Industry Mode ✅ LIVE
**Was:** Wenn Branchenerkennung unsicher (confidence = "none"/"low"), wird `cross_industry_mode = true` gesetzt.

**Effekt:**
- AI Agent: Branchenübergreifende Parallelen ziehen
- Referenzanalyst: Kein harter Branchenfilter in Pinecone, semantische Suche über alle Branchen

**Wo:** `KI-Bremse` Output → AI Agent Prompt → Referenzanalyst Prompt

---

### 1.5 Parser Field Pass-Through ✅ LIVE
**Was:** `parse_tip_json_ai_v2.js` leitet `customer_personality_type`, `customer_personality_confidence`, `personality_signals`, `cross_industry_mode` durch.

**Wo:** `Parse Tip JSON (AI path)` Node

---

### 1.6 Ensure Session Facts: Personality ✅ LIVE
**Was:** `personality_type` + `personality_confidence` werden in Session Facts persistiert. Nur Upgrade wenn KI-Bremse höhere Confidence hat.

**Wo:** `Ensure Session Facts v1` Node

---

### 2.3 Fastlane Parser Parity ✅ LIVE (2026-03-16)
**Was:** `parse_tip_json_fastlane_v2.js` hat volle Parity mit dem AI-Parser.

**Datei:** `/Users/vincentjutte/sales-live-stt/n8n/step_05_learning_loop/parse_tip_json_fastlane_v2.js`

**Aufwand:** Klein (Copy-Paste der 4 Zeilen aus AI-Parser)

**Änderungen:**
```javascript
// Nach den bestehenden KI-Bremse Feldern einfügen:
obj.customer_personality_type       = kb.customer_personality_type ?? "unknown";
obj.customer_personality_confidence = typeof kb.customer_personality_confidence === "number" ? kb.customer_personality_confidence : 0;
obj.personality_signals             = Array.isArray(kb.personality_signals) ? kb.personality_signals : [];
obj.cross_industry_mode             = !!kb.cross_industry_mode;
```

---

## Phase 2 — Cross-Call Pattern Learning (2-6 Wochen)

### 2.1 Tip Effectiveness Index (TEI) ❌ TODO
**Was:** Täglicher Batch-Job der Feedback-Daten aggregiert und einen Effektivitäts-Score pro Tipp-Typ berechnet.

**Formel:**
```
TEI = (helpful_count * 1 + won_count * 3) / (total_count + harmful_count * -2)
```

**Dimensionen:** `tip_type × branche × personality_type × deal_stage`

**Implementierung:**

1. **Neuer n8n Workflow:** "Sales Intelligence - Feedback Analytics"
   ```
   Daily Trigger (02:00 UTC)
     → Load all tip_feedback rows (last 30 Tage)
     → Code Node: Aggregation
       - Gruppiere nach: tip_type, branche (aus session), personality_type
       - Berechne TEI pro Gruppe
       - Min. sample_size = 5 (sonst nicht aussagekräftig)
     → Upsert in Supabase: tip_effectiveness_index
   ```

2. **Neue Supabase-Tabelle:** `tip_effectiveness_index`
   ```sql
   CREATE TABLE tip_effectiveness_index (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     tip_type TEXT NOT NULL,
     industry TEXT DEFAULT 'all',
     personality_type TEXT DEFAULT 'all',
     deal_stage TEXT DEFAULT 'all',
     tei_score NUMERIC NOT NULL,
     helpful_count INT DEFAULT 0,
     harmful_count INT DEFAULT 0,
     won_count INT DEFAULT 0,
     neutral_count INT DEFAULT 0,
     total_count INT DEFAULT 0,
     sample_size INT DEFAULT 0,
     last_updated TIMESTAMPTZ DEFAULT now(),
     UNIQUE(tip_type, industry, personality_type, deal_stage)
   );
   ```

3. **Datenquelle:** DataTable `tip_feedback_v1` in n8n (existiert bereits)
   - Felder: `tip_id`, `tip_type`, `outcome`, `session_id`, `lead_id`, `timestamp`
   - Braucht Erweiterung um: `industry`, `personality_type` (müssen beim Upsert mitgeschrieben werden)

**Aufwand:** Mittel (neuer Workflow + Supabase-Tabelle + Build Feedback Guidance Update)

---

### 2.2 TEI in AI-Agent Prompt ❌ TODO
**Was:** `Build Feedback Guidance v1` lädt TEI-Daten und injiziert ein Ranking in den AI-Agent Prompt.

**Beispiel-Output:**
```
BEWÄHRTE TAKTIKEN für Fitness (Bedarfsanalyse):
1. "social_proof" → TEI: 0.89 (n=34) ← BEVORZUGEN
2. "termin_anbieten" → TEI: 0.76 (n=28)
3. VERMEIDEN: "roi_erklären" → TEI: 0.21 (n=15)

PERSONALITY-MATCH (dominant):
- "timing" → TEI: 0.92 bei dominanten Kunden
- "decision" → TEI: 0.85 bei dominanten Kunden
```

**Implementierung:**
1. `Build Feedback Guidance v1` bekommt HTTP-Request an Supabase: `GET tip_effectiveness_index?industry=eq.Fitness&personality_type=eq.dominant`
2. Top 3 + Bottom 1 werden als Text-Block formatiert
3. Injection in AI Agent `text` Parameter als neuer Block "BEWÄHRTE TAKTIKEN"

**Aufwand:** Mittel

---

### 2.4 Industry Intelligence Profiles ✅ DONE (2026-03-13)
**Was:** Pro-Branche Profil mit aggregierten Insights. Gespeichert in Pinecone `pattern_nodes` Namespace ODER Supabase-Tabelle.

**Schema:**
```json
{
  "industry": "Fitness",
  "win_rate": 0.68,
  "avg_cycles_to_close": 2.3,
  "top_objections": ["budget_preis", "kein_bedarf"],
  "best_tactics": ["social_proof", "termin_anbieten", "dringlichkeit"],
  "avoid_tactics": ["roi_berechnung", "lange_demos"],
  "winning_pattern": "Direkt Termin sichern im ersten Call. Social Proof mit 2-3 ähnlichen Studios. Preis erst nach Value-Demo.",
  "common_decision_makers": ["owner", "geschäftsführer"],
  "typical_timeline_days": 8,
  "personality_distribution": { "dominant": 0.35, "expressiv": 0.30, "analytisch": 0.20, "harmonisch": 0.15 },
  "sample_size": 47,
  "last_updated": "2026-03-01"
}
```

**Implementierung:**

1. **Neue Supabase-Tabelle:** `industry_intelligence`
   ```sql
   CREATE TABLE industry_intelligence (
     industry TEXT PRIMARY KEY,
     win_rate NUMERIC,
     avg_cycles_to_close NUMERIC,
     top_objections JSONB DEFAULT '[]',
     best_tactics JSONB DEFAULT '[]',
     avoid_tactics JSONB DEFAULT '[]',
     winning_pattern TEXT,
     common_decision_makers JSONB DEFAULT '[]',
     typical_timeline_days NUMERIC,
     personality_distribution JSONB DEFAULT '{}',
     sample_size INT DEFAULT 0,
     last_updated TIMESTAMPTZ DEFAULT now()
   );
   ```

2. **Generierung:** Teil des Feedback Analytics Workflows (Phase 2.1)
   - Nach TEI-Berechnung: Aggregiere auch pro Branche
   - GPT-4o generiert `winning_pattern` Text aus den Daten

3. **Nutzung im Live-Call:**
   - `Build Feedback Guidance v1` lädt Industry Profile
   - AI-Agent bekommt: "BRANCHEN-PROFIL Fitness: Win-Rate 68%, Top-Taktik: Social Proof..."

**Cross-Industry Nutzung:**
- Wenn `cross_industry_mode = true`: Lade die 3 Branchen mit ähnlichstem Profil
- Similarity basierend auf: `top_objections`, `best_tactics`, `win_rate`
- Beispiel: "Branche unbekannt → ähnlich wie Fitness + Yoga (gleiche Objections, ähnliche Timeline)"

**Aufwand:** Mittel-Groß

---

### 2.5 Won/Lost Deal Causal Attribution ✅ DONE (2026-03-13)
**Was:** Wenn ein Deal in Close CRM gewonnen/verloren wird, analysiert die KI warum.

**Trigger:** Close CRM Webhook bei Status-Änderung → `won` oder `lost`

**Pipeline:**
```
Close CRM Webhook (deal_status_changed)
  → Load Deal + alle Activities (Calls, Emails, Notes)
  → Load ähnliche Deals aus Pinecone (gleiche Branche + Deal-Stage + gegensätzliches Outcome)
  → GPT-4o Causal Analysis:
     Prompt:
     "Du bekommst einen [gewonnenen/verlorenen] Deal.
      Analysiere:
      1. Was war der entscheidende Moment?
      2. Welche Taktik hat den Unterschied gemacht?
      3. Was hätte den Verlust verhindert / den Gewinn gesichert?
      4. 3-5 konkrete Learnings für den Salesperson

      Vergleiche mit diesen ähnlichen Deals:
      [Pinecone results]"
  → Store in Pinecone: deal_summaries (mit causal_learnings Metadata)
  → Upsert in Supabase: deal_causal_attribution
  → Optional: Write back to Close CRM Note
```

**Neue Supabase-Tabelle:** `deal_causal_attribution`
```sql
CREATE TABLE deal_causal_attribution (
  deal_id TEXT PRIMARY KEY,
  outcome TEXT NOT NULL, -- 'won' or 'lost'
  industry TEXT,
  pivotal_moment TEXT,
  winning_tactic TEXT,
  loss_prevention TEXT,
  learnings JSONB DEFAULT '[]',
  similar_deals JSONB DEFAULT '[]',
  analyzed_at TIMESTAMPTZ DEFAULT now()
);
```

**Nutzung im nächsten ähnlichen Call:**
- `lead_data_search` findet Causal Attributions aus ähnlichen Deals
- AI-Agent: "Ähnliche Fitness-Deals in München: 78% der gewonnenen Deals hatten Termin innerhalb von 2 Calls"

**Aufwand:** Groß (Close CRM Integration + neuer Workflow + Pinecone-Schema)

**Voraussetzung:** Close CRM API-Zugang + Webhook-Setup

---

### 2.6 Overlay: Personality-Typ Anzeige ✅ LIVE (2026-03-16)
**Was:** Personality-Typ im Lead-Info-Panel anzeigen.

**Design:**
```
┌──────────────────────────────┐
│ Lead: Müller Fitness GmbH    │
│ Kontakt: Hans Müller         │
│ Stadt: München               │
│ Branche: Fitness             │
│ Typ: 🎯 Dominant (78%)      │  ← NEU
│ Ø Antwortzeit: 3.2 Tage     │
└──────────────────────────────┘
```

**Icons:**
- 📊 Analytisch
- 🎯 Dominant
- 🎭 Expressiv
- 🤝 Harmonisch

**Implementierung:**
- `displayNewTip(data)` liest `data.customer_personality_type` + `data.customer_personality_confidence`
- Neues Element im Lead-Info-Panel
- Threshold: Nur anzeigen wenn `confidence >= 0.4`

**Datei:** `overlay_dev.html`

**Aufwand:** Klein

---

### 2.7 Overlay: Cross-Industry Indikator ✅ LIVE (2026-03-16)
**Was:** Wenn `cross_industry_mode = true`, kleiner Hinweis in der Tipp-Karte.

**Design:** Badge "Branchenübergreifend" neben dem Tipp, wenn die Branche unsicher war.

**Aufwand:** Klein

---

## Phase 3 — Strategisches Self-Learning (6+ Wochen)

### 3.1 Weekly Intelligence Synthesis ✅ DONE (2026-03-13)
**Was:** Wöchentlicher Batch-Job der Muster aus der Woche zusammenfasst.

**Trigger:** Sonntag 03:00 UTC

**Pipeline:**
```
Weekly Trigger
  → Load alle Sessions + Feedback der letzten 7 Tage
  → Load Won/Lost Deals der Woche
  → Load TEI-Veränderungen (Delta zur Vorwoche)
  → GPT-4o Synthese:
     - "Diese Woche funktionierte X besonders gut (n=Y Sessions)"
     - "Diese Einwand-Typen waren schwer zu lösen (Failure-Rate: Z%)"
     - "Top-Performer: [Vince, Bjarne] und warum"
     - "Top 3 Learnings für nächste Woche"
     - "Branchen-Trends: Fitness stabil, Gastronomie verbessert"
  → Store in Supabase: weekly_intelligence_reports
  → Update Industry Intelligence Profiles
  → Optional: Slack/Monday Notification an Team
```

**Neue Supabase-Tabelle:** `weekly_intelligence_reports`
```sql
CREATE TABLE weekly_intelligence_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_sessions INT,
  total_feedback INT,
  top_learnings JSONB DEFAULT '[]',
  industry_trends JSONB DEFAULT '{}',
  rep_highlights JSONB DEFAULT '{}',
  tei_changes JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT now()
);
```

**Aufwand:** Groß

---

### 3.2 Adaptive Prompt Evolution ✅ DONE (2026-03-13)
**Was:** Monatliche Analyse welche Prompt-Instruktionen die besten TEI-Werte erzeugen.

**Pipeline:**
```
Monthly Trigger
  → Load letzte 4 Weekly Reports
  → Load TEI-Entwicklung über 30 Tage
  → GPT-4o analysiert:
     - Welche Prompt-Sections korrelieren mit hohem TEI?
     - Welche Formulierungen sollten geändert werden?
     - Vorschlag für neue/geänderte Prompt-Abschnitte
  → Store als Vorschlag in Supabase: prompt_evolution_suggestions
  → Human-in-the-Loop: Admin sieht Vorschlag im Overlay
  → Bei Bestätigung: n8n API-Call updatet AI-Agent Prompt automatisch
```

**Wichtig:** Kein Auto-Update ohne Human Review! Prompt-Änderungen sind kritisch.

**Aufwand:** Groß

---

### 3.3 Rep Performance Coaching ✅ DONE (2026-03-13)
**Was:** Individuelles Performance-Profil pro Salesperson.

**Schema:**
```json
{
  "rep_id": "vince@viral-house.de",
  "strengths": ["termin_anbieten (TEI 0.92)", "social_proof (TEI 0.87)"],
  "weaknesses": ["price_discussion (40% harmful)", "long_monologues (talk_ratio > 70%)"],
  "recommendations": ["Mehr Social Proof nutzen", "Preis-Gespräche kürzer halten"],
  "comparison_to_top": {
    "gap_areas": ["objection_handling", "discovery_questions"],
    "ahead_areas": ["closing_speed", "appointment_setting"]
  },
  "personality_match_scores": {
    "dominant": 0.91,
    "analytisch": 0.72,
    "expressiv": 0.88,
    "harmonisch": 0.65
  }
}
```

**Effekt:** AI-Agent weiß wer anruft und passt Tipps an Stärken/Schwächen an.
- Vince stark im Termin-Setzen → AI gibt weniger Termin-Tipps, mehr Objection-Handling
- Bjarne schwach bei Preis-Diskussionen → AI warnt früher bei Preis-Einwänden

**Voraussetzung:** User-ID wird pro Session gespeichert (Supabase Auth → `active_user_id`)

**Aufwand:** Groß

---

## Daten-Architektur (Gesamt)

### Supabase-Tabellen

| Tabelle | Status | Beschreibung |
|---------|--------|-------------|
| `call_sessions` | ✅ Existiert | Session-History pro User |
| `chat_messages` | ✅ Existiert | Chat-History pro User |
| `user_settings` | ✅ Existiert | Webhook-URLs pro User |
| `tip_effectiveness_index` | ✅ Phase 2.1 | TEI pro tip_type × branche × personality |
| `industry_intelligence` | ✅ Phase 2.4 | Pro-Branche Insights + Winning Patterns |
| `deal_outcomes` | ✅ Phase 2.5 | Won/Lost Tracking aus Close CRM |
| `deal_attributions` | ✅ Phase 2.5 | Won/Lost Analyse pro Deal |
| `weekly_intelligence_reports` | ✅ Phase 3.1 | Wöchentliche Synthese |
| `prompt_evolution_suggestions` | ✅ Phase 3.2 | Prompt-Verbesserungsvorschläge |
| `rep_performance_profiles` | ✅ Phase 3.3 | Pro-Salesperson Stärken/Schwächen |

### Pinecone Namespaces

| Namespace | Status | Beschreibung |
|-----------|--------|-------------|
| `sales_intelligence_v2` | ✅ Existiert | Deal-Insights, Lead-Historie (Layer B) |
| `deal_summaries` | ✅ Existiert | Zusammenfassungen ganzer Deals |
| `references` | ✅ Existiert | Referenzfälle nach Branche |
| `company_knowledge` | ✅ Existiert | VH Handbuch 2026 |
| `pattern_nodes` | ❌ Phase 2.4 | Industry Intelligence Profiles (optional, Alternative: Supabase) |

### n8n Workflows

| Workflow | Status | Trigger | Beschreibung |
|----------|--------|---------|-------------|
| Sales Intelligence - Call Assistant | ✅ Existiert | Webhook (live) | Haupt-Workflow |
| Layer B Distillation for Pinecone | ✅ Existiert | Manuell | Historische Deals → Pinecone |
| Feedback Analytics (TEI) | ❌ Phase 2.1 | Daily 02:00 | TEI-Berechnung + Industry Profiles |
| Causal Attribution | ❌ Phase 2.5 | Close CRM Webhook | Won/Lost Analyse |
| Weekly Intelligence | ❌ Phase 3.1 | Weekly So 03:00 | Wöchentliche Synthese |

---

## Implementierungs-Reihenfolge (Empfohlen)

| Prio | # | Feature | Impact | Aufwand | Abhängigkeit |
|------|---|---------|--------|---------|-------------|
| 🔴 1 | 2.3 | Fastlane Parser Parity | Mittel | Klein | Keine |
| 🔴 2 | 2.1 | TEI Berechnung (Workflow) | 🔥 Hoch | Mittel | Supabase-Tabelle |
| 🔴 3 | 2.2 | TEI in AI-Prompt | 🔥 Hoch | Mittel | 2.1 |
| 🟡 4 | 2.6 | Overlay: Personality Anzeige | Mittel | Klein | Keine |
| 🟡 5 | 2.4 | Industry Intelligence Profiles | 🔥 Hoch | Mittel-Groß | 2.1 |
| 🟡 6 | 2.7 | Overlay: Cross-Industry Badge | Klein | Klein | Keine |
| 🟢 7 | 2.5 | Causal Attribution | 🔥 Hoch | Groß | Close CRM API |
| 🟢 8 | 3.1 | Weekly Intelligence | Mittel | Groß | 2.1, 2.4 |
| 🟢 9 | 3.2 | Adaptive Prompt Evolution | Mittel | Groß | 3.1 |
| 🟢 10 | 3.3 | Rep Performance Coaching | Mittel | Groß | 2.1, User-ID |

---

## Technische Details: Tip Feedback DataTable Erweiterung

Aktuell speichert `Prepare Tip Feedback Row` diese Felder:
- `tip_id`, `tip_type`, `tip`, `session_id`, `lead_id`, `timestamp`

**Muss erweitert werden um:**
- `industry` (aus `reference_branche_primary`)
- `personality_type` (aus `customer_personality_type`)
- `deal_stage` (aus `script_phase`)
- `cross_industry_mode` (boolean)

Diese Felder werden für TEI-Aggregation (Phase 2.1) gebraucht.

**Wo ändern:** `Prepare Tip Feedback Row` Code-Node im Call Assistant Workflow

---

## Auto-TEI: KI erkennt selbst ob Tipps gut waren ✅ LIVE (2026-03-16)

Da nicht jeder Caller bei jedem Call Feedback-Buttons klickt, erkennt die KI **automatisch** welche Tipps gut funktionieren:

### Signale für automatische Bewertung:
1. **Sentiment-Shift**: THEM-Sentiment wird positiver → vorheriger Tipp hat gewirkt (+0.5 bis +1.0)
2. **Objection aufgelöst**: `active_objection` war gesetzt → verschwindet im nächsten Run (+1.0)
3. **Sales Phase Progression**: Phase springt vorwärts (z.B. bedarfsanalyse→pitch) (+0.5 pro Stufe)
4. **Talk-Ratio Verbesserung**: THEM redet mehr → Engagement gestiegen (+0.3)
5. **THEM Word Count Increase**: Mehr Wörter von THEM → aktive Beteiligung (+0.2)

### Score → auto_outcome Klassifizierung:
- ≥1.5 → `auto_helpful`
- ≥0.5 → `auto_positive_signal`
- <0 → `auto_harmful`
- sonst → `auto_neutral`

### Implementierung (LIVE):
- **Store in Cache**: Vergleicht aktuellen KI-Bremse-Output mit `staticData.lastTipObj` (vorheriger Tipp)
- **Auto-TEI Signal Node**: Filtert und formatiert das Auto-Outcome
- **Update Prev Tip Auto-TEI Node**: Schreibt `auto_outcome` + `auto_signals` (JSON) in DataTable zurück
- **TEI Aggregation v1.1**: Gewichtung — manuelles Feedback 3x, `auto_helpful` 1x, `auto_positive_signal` 0.5x
- Nur innerhalb derselben Session (prev.session_id === current.session_id)

### DataTable-Spalten (manuell hinzufügen):
- `auto_outcome` (String): auto_helpful / auto_positive_signal / auto_neutral / auto_harmful
- `auto_signals` (String): JSON-Array mit Signal-Details

---

## Cross-Industry Learning — Detailliertes Konzept

### Problem
Wenn eine Branche neu/unbekannt ist, hat die KI keine Referenzdaten.

### Lösung: 3-stufiges Fallback

1. **Exakter Branchenfilter** (confidence: high)
   - Pinecone Query mit `metadata.branche = "Fitness"`
   - Standard-Verhalten

2. **Fallback-Branchen** (confidence: medium)
   - Pinecone Query mit `metadata.branche IN ["Fitness", "Yoga & Pilates", "Personal Training"]`
   - KI-Bremse liefert `reference_branche_fallbacks`

3. **Cross-Industry Semantic** (confidence: none/low)
   - Pinecone Query OHNE Branchenfilter
   - Rein semantische Ähnlichkeit
   - AI erklärt Parallele: "Ähnliche Situation wie bei Fitness-Studio: gleicher Einwand, ähnliche Entscheidungsstruktur"

### Zusätzlich: Industry Profile Matching
Wenn Industry Intelligence Profiles (Phase 2.4) existieren:
- Lade Profil der unbekannten Branche (falls es mindestens 1 Deal gab)
- Finde die 3 Branchen mit ähnlichstem Profil (basierend auf `top_objections`, `best_tactics`, `win_rate`)
- Nutze deren Taktiken als Orientierung

---

## Personality Type — Detailliertes Konzept

### DISC-Modell (vereinfacht)

| Typ | Verhalten | Tipp-Stil | Trigger-Keywords |
|-----|-----------|-----------|------------------|
| **Analytisch (C)** | Fragt nach Daten, Details, Beweisen | Zahlen zuerst, ROI-Berechnung, Studien zitieren | "warum genau", "welche daten", "können sie das belegen" |
| **Dominant (D)** | Direkt, ungeduldig, ergebnisorientiert | Kurz, Bottom-Line, Entscheidung pushen | "was bringt das", "auf den punkt", "was kostet das" |
| **Expressiv (I)** | Begeistert, emotional, beziehungsorientiert | Storytelling, Begeisterung wecken, Vision malen | "begeistert", "fantastisch", "tolle idee" |
| **Harmonisch (S)** | Vorsichtig, risiko-avers, konsensorientiert | Sanft, Social Proof, Risiko reduzieren | "was wenn das nicht klappt", "andere kunden", "intern besprechen" |

### Session-Akkumulation
- Jeder KI-Bremse-Call (alle 40 Sek) detektiert Personality
- Scores werden über die Session normalisiert akkumuliert
- Confidence steigt mit jedem Call (mehr Datenpunkte)
- Typ kann sich ändern wenn Kunde Verhalten ändert

### Cross-Personality Learning (Phase 2+)
- TEI-Daten getrennt nach Personality-Typ
- "Bei dominanten Kunden funktioniert 'termin_anbieten' (TEI 0.92) viel besser als 'social_proof' (TEI 0.54)"
- AI-Agent bekommt personality-spezifisches Taktik-Ranking

---

## Datei-Referenzen

| Datei | Beschreibung |
|-------|-------------|
| `n8n/step_03_call_assistant/ki_bremse_v2_7.js` | KI-Bremse mit Personality Detection + Cross-Industry |
| `n8n/step_05_learning_loop/parse_tip_json_ai_v2.js` | Parser mit Personality Field Pass-Through |
| `n8n/step_05_learning_loop/parse_tip_json_fastlane_v2.js` | Fastlane Parser (volle Parity mit AI Parser) |
| `overlay_dev.html` | Overlay UI (Personality + Cross-Industry Anzeige LIVE) |
| `overlay-control.mjs` | Server-Backend |
| `CLAUDE.md` | Architektur-Dokumentation |
| `SELFLEARNING_MASTERPLAN.md` | Diese Datei |

---

## Changelog

| Datum | Änderung |
|-------|---------|
| 2026-03-13 | Phase 1 (1.1-1.6) implementiert und live deployed |
| 2026-03-13 | KI-Bremse v2.7 gehärtet (Word-Boundary, Min-Score, Accumulation-Fix) |
| 2026-03-13 | TEI Workflow (Xx8bt97npvbkcKnV) erstellt + aktiviert (wöchentlich So 03:00) |
| 2026-03-13 | TEI in AI-Agent Prompt + Build Feedback Guidance v1.1 + Load TEI Data Node |
| 2026-03-13 | Prepare Tip Feedback Row: industry, personality_type, deal_stage Felder |
| 2026-03-13 | Supabase: tip_effectiveness_index Tabelle erstellt |
| 2026-03-13 | Fastlane Parser Parity: Personality + Cross-Industry Felder live |
| 2026-03-13 | Masterplan erstellt |
| 2026-03-16 | Fastlane Parser: volle Parity (Lead Profile, Feedback, Session Facts, Validator, reference_branche_primary) |
| 2026-03-16 | AI + Fastlane Parser: `reference_branche_primary` Pass-Through (Fix für industry=unknown in Tip Feedback) |
| 2026-03-16 | Auto-TEI implementiert: Store in Cache Signal-Detection, Auto-TEI Signal Node, Update Prev Tip Auto-TEI Node |
| 2026-03-16 | TEI Aggregation v1.1: Unterstützt auto_outcome mit gewichteter Berechnung (manuell 3x, auto 1x/0.5x) |
