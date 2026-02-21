# Handoff – End of Day (2026-02-21)

## Executive Summary

Heute wurde das Overlay vollständig auf Viral House CI umgestellt (themenwechselbares UI) und alle stabilen Features aus der Dev-Phase in v1.1.0 released.

---

## Was heute umgesetzt wurde

### 1. Viral House CI Theme System

- **Theme-Toggle-Button** "VH" / "🔵" im Header neben ⚙️
- Persistenz via `localStorage('overlay_theme')` → 'default' oder 'vh'
- `body.vh-theme` CSS-Klasse mit vollständigen Overrides:
  - Background: `#000` + roter Radial-Glow statt blauem Gradient
  - Alle Grün-Akzente (`#4ade80`) → VH-Rot (`#ff5757`)
  - Gabarito-Font (Google Fonts)
  - Logo wechselt zu lokalem `ViralHouse_white.svg`
  - Live-Puls-Animation in Rot (`livePulseVH`)
  - Live Verlauf: neueste Turn, Trigger-Turn, Speaker-Label, ausgewählter History-Eintrag
  - Mini-Toggle-Buttons (Live / Learning / Lead Info) → Rot
  - Live Assistant Chat (User-Bubble, Send-Button, Input-Focus) → Rot
  - Info-Title-Row (Live Daten Header) → leichter rosa Shimmer
- **Immer grün** (semantisch positiv, auch im VH-Theme):
  - `lead-badge`, `chat-lead-name`, `input-hint.ok`
  - `tip-feedback-status.ok` (Gespeichert-Meldung)
  - `active-helpful` Feedback-Button
  - `active-won` Button (grün + Gold-Pulse, explizit in VH-Theme wiederhergestellt)

### 2. SVG-Dateien eingebunden

- `ViralHouse_white.svg` und `ViralHouse_black.svg` im Projektroot
- Beide werden jetzt in `package.json` build files aufgelistet (→ werden im App-Bundle mitgepackt)

### 3. Release v1.1.0

- `overlay_dev.html` → `overlay.html` kopiert
- Version von 1.0.2 auf 1.1.0 gebumpt
- Build + ZIP erstellt: `dist/release/SalesOverlay.app.zip`
- Git commit + Push auf `main`
- GitHub Release `v1.1.0` mit Asset veröffentlicht

### 4. Dokumentation aktualisiert

- `CLAUDE.md` vollständig aktualisiert (VH Theme, Feedback-System, Release-Prozess, Update-Funktion)
- `HANDOFF_2026-02-21_EOD.md` (dieses Dokument) erstellt
- `MEMORY.md` aktualisiert

---

## Was in diesem Release drin ist (kumulativ seit v1.0.2)

### Overlay-Features (entwickelt in overlay_dev.html)
- Feedback-Buttons: Helpful (grün), Neutral (gelb), Harmful (rot), Won (grün+Gold-Pulse)
- Separate Collapse-Toggles für Live Verlauf und Referenzen
- History-Einträge klickbar → zeigt Tipp in großer Karte
- Tipp-Karte: LIVE / HISTORY Chip + "Zurück zu Live-Tipp" Button
- Lead Info Panel mit Pinecone-Daten (Name, Kontakt, Stadt, Branche, Owner, Stage, Response-Days)
- Live Verlauf: Dedup-Logik verbessert (last 4 statt last 1), lastTipTime Fix
- Referenzen: werden nicht mehr überschrieben wenn kein neuer Input kommt (localStorage-Cache)
- Session-Speicherung: wird auch ohne `generated_at` korrekt archiviert
- VH CI Theme (komplett neu, s.o.)
- Header: "Sales Intelligence" (mit Leerzeichen)

### Parser-Updates
- `parse_tip_json_ai_v2.js`: Rescue-Logik für MOVE-only Fragmente
- Alle Node-Readings integriert: KI-Bremse, Session Facts, Feedback Guidance, Lead Profile

### n8n
- Learning Loop aktiv: Build Feedback Guidance v1 liest tip_feedback DataTable
- Load Lead Profile (Pinecone) → flache Lead-Felder durchgereicht
- tip_id stabil durchgeleitet (Parser → Store → Respond)

---

## Bekannte offene Punkte

1. **Fastlane Parser Parity**: Lead-Profile-Integration noch nicht im Fastlane-Parser
2. **QA-Runde**: 2-3 Lead-IDs end-to-end testen
3. **Branchen-Dropdown** (geplant): Manuelle Branchenauswahl im Overlay für direkte Refs
4. **Feedback Analytics**: Conversion nach tip_type, Top harmful/helpful Patterns

---

## Startpunkt nächste Session

1. QA: Workflow live triggern, prüfen ob lead_owner_name, industry, contact_name korrekt ankommen
2. VH Theme: finale visuelle Prüfung mit realen Call-Daten
3. Fastlane Parser: `parse_tip_json_fastlane_v2.js` mit Lead-Profile-Block nachrüsten (analog AI-Parser)

---

## Relevante Dateien

- `overlay_dev.html` / `overlay.html` (identisch in diesem Release)
- `ViralHouse_white.svg`, `ViralHouse_black.svg`
- `n8n/step_05_learning_loop/parse_tip_json_ai_v2.js`
- `package.json` (v1.1.0, SVGs eingetragen)
- `CLAUDE.md` (vollständig aktualisiert)
