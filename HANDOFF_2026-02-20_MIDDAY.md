# Handoff – Sales Intelligence (Midday) – 2026-02-20

## 1) Zielbild (aktueller Fokus)
Aus dem Sales Call Assistant einen lernenden Agenten machen:
- Live-Tipps in Calls
- strukturierte Speicherung der Tipp-Qualität
- Outcome-Feedback direkt aus dem Overlay
- Feedback-Rueckfluss in die naechste Tipp-Generierung

## 2) Was heute umgesetzt wurde

### A. Overlay / UX
Datei: `overlay_dev.html`

Erledigt:
- App-Label auf `SalesIntelligence` umgestellt
  - `<title>` -> `SalesIntelligence`
  - Header-Text -> `SalesIntelligence`
  - Setup-Text -> `Willkommen bei SalesIntelligence`
- Backup erstellt: `overlay.bak` (Quelle: `overlay_dev.html`)
- Feedback-Buttons in der Tipp-Karte eingebaut (`Helpful`, `Neutral`, `Harmful`, `Won`)
- Feedback-POST auf produktiven Webhook fixiert:
  - `https://viralhouse.app.n8n.cloud/webhook/tip-outcome`
- Debug-Logging fuer Feedback-POST eingebaut:
  - `localStorage["tip_feedback_debug_log"]` (letzte 30 Eintraege)
  - loggt URL, Payload, Status, Response, Fehler
- Tipp-Verlauf erweitert:
  - pro History-Eintrag Feedback-Buttons
  - nachtraegliches Labeln alter Tipps per `tip_id`
  - Outcome wird lokal in `tipHistory` persistiert
- Tipp-Verlauf klickbar gemacht:
  - Klick auf Verlaufseintrag zeigt diesen Tipp oben in der grossen Karte (`Aktueller Tipp`)
  - inkl. Sentiment-/Zeit-/Feedback-Zustand
  - gewaehlter Verlaufseintrag wird visuell markiert (`selected`)

### B. Call Assistant / Parser / Learning Flow

Erledigt:
- `tip_id`-Durchleitung konsistent gemacht (Parser -> Store -> Respond)
- Parser-Haertung:
  - kein erzwungenes Ueberschreiben gueltiger AI-Tipps wegen Format-Warnung
  - Format-Warnungen bleiben als `warnings` erhalten
- `session_facts` im Parser robust durchgereicht (nicht mehr `null`)
- `tip_feedback` Data Table erstellt + angebunden
- Write-Flow fuer neue Tipps implementiert:
  - `Store in Cache` -> `Prepare Tip Feedback Row` -> `Upsert Tip Feedback`
- Outcome-Webhook (`tip-outcome`) stabilisiert
  - Payload-Validierung robust
  - Matching/Update-Logik korrigiert

### C. Feedback-Learning vor AI

Erledigt:
- Read-Flow vor AI korrekt positioniert
- `Build Feedback Guidance v1` aktiv
  - Tip-Type Scoring aus Historie
  - Guardrails gegen Overfitting (Mindest-Samples)
- Prompt erhaelt Guidance-Felder:
  - `feedback_guidance`
  - `feedback_best_tip_type`
  - `feedback_avoid_tip_type`

## 3) Verifiziert (funktionale Tests)

- Outcome-Webhook schreibt/updated erfolgreich (`Gespeichert: helpful`)
- Overlay-Feedback-Buttons (aktuelle Karte) funktionieren
- Overlay-Feedback-Buttons im Verlauf funktionieren
- Klick auf Verlaufseintrag zeigt Tipp in der grossen Karte
- AI/Parser/Webhook tip payload bleibt konsistent (kein ungewollter Fallback mehr)
- `tip_feedback` Datensaetze werden mit echten Werten aktualisiert

## 4) Wichtige Implementierungsdetails (nicht vergessen)

- n8n JSON Body bei sensiblen Nodes weiterhin streng behandeln (falls noetig `JSON.stringify`-Pattern)
- Outcome nicht mehr "blind" als neuer Teil-Datensatz erzeugen
- `tip_id` ist Schluessel fuer Learning-Loop
- Overlay sendet Feedback immer auf `.../webhook/tip-outcome` (nicht webhook-test)

## 5) Aktueller Stand: offene Punkte

### P0 (naechste sinnvolle Schritte)
1. Overlay: kleine UX-Politur fuer Verlaufsauswahl
   - z. B. "Zurueck zu Live-Tipp" Button in der Tipp-Karte
   - deutlicher Hinweis, wenn ein alter Verlaufseintrag angezeigt wird
2. n8n: Outcome-Update-Flow final gegen Dubletten absichern
   - sicherstellen, dass kein Null-Row-Verhalten mehr auftreten kann
3. Learning: leichte Gewichtungsoptimierung
   - `won` spaeter ggf. staerker als `+2`

### P1 (danach)
1. Feedback-Buttons auch im Session-History-View (archivierte Sessions) optional nachziehen
2. Mini-Analytics:
   - Conversion nach `tip_type`
   - Top `harmful` / Top `helpful` Patterns
3. Overlay optional mit kurzem Freitext-Feld fuer `outcome_note`

## 6) Dateien mit heutigem Hauptbezug

- `overlay_dev.html` (alle Overlay-Aenderungen)
- `overlay.bak` (Backup vor Umbau)
- `n8n/step_05_learning_loop/parse_tip_json_ai_v2.js`
- `n8n/step_05_learning_loop/parse_tip_json_fastlane_v2.js`
- `HANDOFF_2026-02-20_MIDDAY.md` (dieses Dokument)
- `NEXT_STEPS_2026-02-20.md` (Runbook)

## 7) Sofortiger Wiedereinstieg nach Pause

Empfohlener erster Schritt:
- UX-Politur in `overlay_dev.html`:
  - "Live"-Reset fuer Tipp-Karte
  - sichtbarer Label-Badge: `Viewing History Tip` vs `Live Tip`

Danach:
- 2-3 End-to-End Testruns (Live Tipp -> Feedback -> naechster Tipp)
- beobachten, ob `feedback_best_tip_type` stabil und plausibel bleibt
