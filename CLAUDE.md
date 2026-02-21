# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Was dieses Projekt ist

**SalesIntelligence** — ein KI-gestützter Live-Sales-Coach für Telefon-Calls.

Das System nimmt beide Seiten eines Gesprächs auf (Mikrofon + System-Audio), transkribiert sie in Echtzeit, und liefert dem Salesperson über ein Browser-Overlay live handlungsbare Tipps mit Skript-Vorschlägen. Ein Learning-Loop verbessert die Tipp-Qualität auf Basis von Feedback (Helpful/Neutral/Harmful/Won).

**Wir sind selbst die Marketing-/Media-Agentur** (Viral House). Kunden kommen aus allen Branchen (Konzerte, Fitness, Gastronomie, Immobilien etc.). Diese Unterscheidung ist wichtig für die Branchenerkennung — unsere eigenen Keywords (instagram, agentur, social media) dürfen die Kundenbranche nicht verfälschen.

**Aktuelle Version: 1.1.0**

---

## Systemarchitektur (Gesamtüberblick)

```
[macOS Audio]
  bridge_mic.mjs (YOU)  ─┐
  bridge_system.mjs (THEM) ─┤──► n8n Webhook (Audio) ──► Transkription + Context Builder
                          └─┘

[n8n Workflow: "Sales Intelligence - Call Assistant"]
  Context Builder + Memory Builder
    → KI-Bremse (Kontext-Analyse, WPM, Talk-Ratio, Branche)
    → Load Lead Profile (Pinecone)
    → Ensure Session Facts
    → Build Feedback Guidance v1
    → [If2] Fastlane? ──► Rule Fastlane v1 → Parse Tip JSON Fastlane
                    └──► AI Agent → Parse Tip JSON AI
    → Store in Cache (staticData.lastTipObj)
    → Respond to Webhook after AI

[Overlay: overlay.html / overlay_dev.html]
  ← pollt GET /get-tips alle 40 Sek (fetchTip)
  ← pollt GET /get-refs  alle 80 Sek (fetchRefs)
  → POST /webhook/tip-outcome (Feedback: helpful/neutral/harmful/won)
```

---

## n8n Workflows

### 1. Sales Intelligence - Call Assistant

Der Hauptworkflow. Zwei Pfade:

**AI Path** (Normalfall):
- `KI-Bremse` → `Load Lead Profile` → `Ensure Session Facts v1` → `Build Feedback Guidance v1` → `AI Agent` → `Parse Tip JSON (AI path)` → `Store in Cache` → `Respond to Webhook after AI`

**Fastlane Path** (bei Budget/Entscheidungssignalen):
- `Rule Fastlane v1` (If2=true) → `Apply Fastlane Tip` → `Parse Tip JSON Fastlane` → `Store in Cache` → `Respond to Webhook after AI-Break`

**Cache Return** (polling, kein neuer Run):
- `Cache Return Node` gibt `staticData.lastTipObj` zurück (new_run=false)

**AI Agent Referenzanalyst** (separater Sub-Agent):
- Läuft parallel, liefert 3 passende Referenzen aus Pinecone `references` Namespace
- Output: `erklärung`, `branche`, `referenzen[]`

### 2. Layer B Distillation for Pinecone

Verarbeitet historische Deal-Daten, destilliert sie in Vektoren und speichert sie in Pinecone (`sales_intelligence_v2`, `deal_summaries`).

---

## Overlay-Dateien

| Datei | Zweck |
|---|---|
| `overlay_dev.html` | Dev-Datei — hier werden alle UI-Änderungen entwickelt |
| `overlay.html` | Produktion — wird vor jedem Release von `overlay_dev.html` überschrieben |
| `ViralHouse_white.svg` | VH-Logo weiß (für Standard + VH-Theme) |
| `ViralHouse_black.svg` | VH-Logo schwarz (Backup) |

**Regel:** Änderungen immer zuerst in `overlay_dev.html` testen, dann per `cp overlay_dev.html overlay.html` nach `overlay.html` übernehmen.

### Polling-Intervalle (aktuell)
- Tips: alle **40 Sekunden** (erster Fetch nach 5 Sek)
- Refs: alle **80 Sekunden** (erster Fetch nach 10 Sek)
- Intervall wird nur gestartet wenn Session ID vorhanden

### Wichtige Funktionen
- `startPolling()` — startet Tips + Refs Polling
- `fetchTip()` — GET /get-tips, ruft `displayNewTip(data)` bei neuer `generated_at`
- `fetchRefs()` — GET /get-refs, rendert Referenzen
- `displayNewTip(data)` — aktualisiert Tipp-Karte, History, Lead Info, Transcript
- `updateLeadInfoPanel()` — befüllt Lead Name/Kontakt/Stadt/Branche aus `current_lead_metadata`
- `archiveCurrentSession(reason)` — speichert Session in `session_history_v1` (localStorage)
- `endSession()` — archiviert zuerst, dann `clearSessionCaches()`
- `renderReferences(referenzen)` — bevorzugt immer localStorage-Cache wenn keine echten Refs übergeben
- `applyTheme(theme)` / `toggleTheme()` — VH CI Theme Switcher (default vs. vh)

### Lead Info Panel
Liest aus `localStorage['current_lead_metadata']` (wird in `displayNewTip` gesetzt).
Zeigt: Lead Name, Kontakt, Stadt, Branche, Ø Antwortzeit.
**Guard**: Panel erscheint wenn irgendeines der Felder (lead_name, contact_name, city_tag, industry) vorhanden ist.

### isFirstLoad-Logik
Beim ersten Poll (lastTipTime===null) wird nicht `displayNewTip` aufgerufen (verhindert doppelten History-Eintrag), aber Lead Info + Transcript + tipHistory werden dennoch aus dem Cache befüllt. `lastTipTime` wird beim ersten Load auf `data.generated_at || new Date().toISOString()` gesetzt.

### Feedback-System
- Buttons: **Helpful** (grün), **Neutral** (gelb), **Harmful** (rot), **Won** (grün + Gold-Pulse)
- POST an `/webhook/tip-outcome` (immer Produktiv-Webhook, nie Test-Webhook)
- `tip_id` ist der Schlüssel der Feedback-Schleife (gesetzt im Parser, durchgereicht via Store → Respond)
- `tip-feedback-status` Text bleibt **immer grün** bei Erfolg, nur rot bei Fehler (auch im VH-Theme)
- `active-helpful/neutral/harmful/won` CSS-Klassen setzen outcome-spezifische Farben

### VH CI Theme
- Toggle-Button "VH" / "🔵" im Header neben ⚙️
- Persistiert in `localStorage('overlay_theme')` → 'default' oder 'vh'
- `body.vh-theme` CSS-Klasse überschreibt alle Grün-Akzente mit `#ff5757` (VH-Rot)
- Gabarito-Font (Google Fonts) wird im VH-Theme aktiv
- Logo wechselt zu lokalem `ViralHouse_white.svg`
- **Immer grün bleiben** (auch im VH-Theme): lead-badge, chat-lead-name, input-hint.ok, tip-feedback-status.ok, active-helpful, active-won

### Update-Funktion
- `checkForUpdate()` → GET `/check-update` → vergleicht mit GitHub Latest Release
- `installUpdate(downloadUrl)` → POST `/do-update`
- `pollUpdateStatus()` → GET `/update-status` (polling 1s)
- Update-Button ist standardmäßig `display:none`, wird per `cfg.hasUpdater` sichtbar gemacht
- `hasUpdater` ist true wenn `GITHUB_REPO` in overlay-control.mjs gesetzt ist

---

## n8n Code-Dateien (lokale Referenzkopien)

Änderungen in n8n werden **manuell** eingepflegt. Die lokalen Dateien sind Referenzkopien, können aber vom Live-Stand abweichen.

### `n8n/step_03_call_assistant/ki_bremse_v2_4.js`
- Analysiert Live-Kontext: WPM, Talk-Ratio, Dominanz, Pacing, Burst
- Branchenerkennung über 66-Kategorien-Keyword-Matching
- **WICHTIG**: Branchenerkennung nutzt NUR `liveThemText + memory` (nicht `liveYouText`), weil wir selbst Marketing-Keywords verwenden
- Baut `reference_query` mit Stop-Word-Filter (saubere Content-Keywords für Pinecone)
- Fallback-Branche: `"Diverses"` (nicht `"Sonstiges"` — Pinecone hat keine "Sonstiges"-Kategorie)

### `n8n/step_05_learning_loop/parse_tip_json_ai_v2.js`
- Parst AI-Agent Output (JSON)
- Soft-Validator für Tipp-Format: `[MOVE] → [WARUM] → Sag: "[SKRIPT]"`
- **Rescue-Logik**: Wenn nur ein kurzer MOVE ohne Pfeil geliefert wird → Gerüst wird automatisch ergänzt
- Behält Tipp auch bei Format-Fehler (warning: `tip_format_invalid:format_mismatch`)
- Hard-Fallback nur wenn tip leer/< 8 Zeichen
- Liest: `KI-Bremse`, `Ensure Session Facts v1`, `Build Feedback Guidance v1`, `Extract Lead Profile from Pinecone`, `Load Lead Profile`
- Integriert Lead-Profile-Felder + Session-Facts-Fallback + Feedback-Guidance-Felder

### `n8n/step_05_learning_loop/parse_tip_json_fastlane_v2.js`
- Analog zu AI-Parser, aber für Fastlane-Pfad

---

## Tipp-Format (ZWINGEND)

```
[MOVE] → [WARUM] → Sag: "[SKRIPT]"
```

- MOVE: max 3 Wörter
- WARUM: max 8 Wörter
- SKRIPT: max 20 Wörter, natürlicher Satz in Anführungszeichen
- Gesamt: 30–45 Wörter
- Das `→` muss exakt zweimal vorkommen, `Sag:` vor dem Skript

Beispiel (GÜLTIG): `"Termin anbieten → Verbindlichkeit erhöht den Abschluss. → Sag: \"Können wir direkt nächste Woche Dienstag blockieren?\""`

---

## Pinecone Namespaces

| Namespace | Inhalt |
|---|---|
| `sales_intelligence_v2` | Deal-Insights, Lead-Historie (Layer B) |
| `deal_summaries` | Zusammenfassungen ganzer Deals |
| `references` | Referenzfälle nach Branche (für Overlay-Panel) |

**IDs**: `lead_id__deal_id__insight_n` Format in `sales_intelligence_v2`.

**Branchenfilter** in Pinecone: Metadata-Filter auf `branche` Feld. Alle 66 Branchen aus dem KI-Bremse-Array müssen exakt mit Pinecone-Metadaten übereinstimmen. "Sonstiges" existiert **nicht** in Pinecone — Fallback ist "Diverses".

---

## Learning Loop

```
Tipp generiert
  → Prepare Tip Feedback Row → Upsert Tip Feedback (DataTable)
  ↓
Salesperson klickt Feedback (helpful/neutral/harmful/won) im Overlay
  → POST /webhook/tip-outcome → Update Tip Feedback
  ↓
Nächster Tipp: Build Feedback Guidance v1 liest History
  → feedback_guidance, feedback_best_tip_type, feedback_avoid_tip_type
  → wird in AI-Prompt injiziert
```

- `tip_id` ist der Schlüssel der gesamten Feedback-Schleife
- Feedback-Buttons: Helpful / Neutral / Harmful / Won (im Overlay + Verlauf)
- Overlay sendet immer an `/webhook/tip-outcome` (nicht den Test-Webhook)

---

## Release-Prozess

```bash
# 1. overlay_dev.html → overlay.html kopieren
cp overlay_dev.html overlay.html

# 2. Version bumpen
npm version 1.x.x --no-git-tag-version

# 3. Build + ZIP erstellen
./scripts/make-release.sh

# 4. Git commit + push
git add overlay.html overlay_dev.html package.json package-lock.json [weitere geänderte Dateien]
git commit -m "release: v1.x.x - ..."
git push origin main

# 5. GitHub Release + Asset
gh release create v1.x.x dist/release/SalesOverlay.app.zip \
  --repo Viralhouse/sales-intelligence \
  --title "v1.x.x" --notes "Release v1.x.x"
```

Asset-Name im GitHub Release muss exakt `SalesOverlay.app.zip` sein (für Auto-Update).

---

## n8n Betriebsregeln (kritisch)

1. **JSON Bodies** in n8n-Expressions: immer `={{ JSON.stringify({...}) }}` — roh eingetragene Objekte crashen oft
2. **Keine Hard-Dependency** auf nicht-ausgeführte Nodes (`$node["AI Agent"]` crasht auf Fastlane-Pfad)
3. **Fastlane-Routing**: AI Agent wird NUR von `If2` false-Branch getriggert (nicht von Merge-Nodes)
4. **Structured Output Parser** braucht in n8n 2.4.x entweder Auto-Fix deaktiviert oder eigenes Modell
5. **Store in Cache** liest aus `$json` — kein Pfad über spezifische Node-Referenzen

---

## Offene / Geplante Features

### Kurzfristig
- Branchen-Dropdown im Overlay für direkte Pinecone-Referenzabfrage (ohne 80s-Interval)
- Fastlane Parser Parity: Lead-Profile-Integration wie AI-Parser
- QA-Runde: 2-3 Lead-IDs testen (Owner, Industry, City korrekt?)

### Mittelfristig
- Mini-Analytics: Conversion nach tip_type, Top harmful/helpful Patterns
- Outcome Note (Freitext-Feld unter Feedback-Buttons)
- Feedback-Buttons auch in Session-History-View

---

## Audio-Bridge (macOS)

```bash
export OPENAI_API_KEY="sk-..."
export N8N_WEBHOOK_URL="https://..."
./test_run.sh   # startet beide Bridges
./stop_run.sh   # stoppt alle Prozesse
```

Overlay HTTP-Control auf Port 8787:
```bash
curl -X POST http://127.0.0.1:8787/run        -H "X-Token: change-me"
curl         http://127.0.0.1:8787/status     -H "X-Token: change-me"
curl -X POST http://127.0.0.1:8787/stop       -H "X-Token: change-me"
curl -X POST http://127.0.0.1:8787/new-session -H "X-Token: change-me"
```

Audio-Pipeline: `AVFoundation → ffmpeg (16kHz PCM mono) → bridge buffers chunk → HTTP POST (WAV) → n8n`

Jeder POST enthält: `session_id`, `speaker` (you/them), `source` (mic/system), `audio` (WAV).
