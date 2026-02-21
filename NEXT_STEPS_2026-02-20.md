# Next Steps Runbook – 2026-02-20 (nach Mittag)

## Step 1 – Overlay UX Politur (15-30 min)

Ziel:
- Klar erkennbar machen, ob aktuell ein Verlaufstipp oder ein Live-Tipp angezeigt wird.

Umsetzung:
1. In `overlay_dev.html` oberhalb der Tipp-Karte einen kleinen Statuschip einfuehren:
   - `LIVE` wenn `selectedHistoryTipIdx === -1`
   - `HISTORY` wenn `selectedHistoryTipIdx >= 0`
2. Button `Zurueck zu Live-Tipp` ergaenzen, der:
   - `selectedHistoryTipIdx = -1` setzt
   - letzten Live-Tipp (`tipHistory[0]`) in die Karte laedt
3. Beim Eintreffen eines neuen Live-Tipps bleibt Verhalten wie jetzt:
   - automatisch auf LIVE zurueck

Akzeptanz:
- User kann jederzeit erkennen, welchen Tipp er sieht.
- Ein Klick stellt Live-Ansicht sofort wieder her.

## Step 2 – Learning-Qualitaet validieren (30-45 min)

Ziel:
- Nachweisen, dass Feedback die Tip-Type-Auswahl beeinflusst.

Testplan:
1. 2 Tipps eines Typs auf `harmful` setzen
2. 2 Tipps eines anderen Typs auf `helpful` oder `won` setzen
3. 2 neue Runs starten
4. Pruefen:
   - `Build Feedback Guidance v1` Output
   - AI `tip_type` Trend

Erwartung:
- `feedback_best_tip_type` korreliert mit positiven Outcomes
- `feedback_avoid_tip_type` setzt bei ausreichend negativer Evidenz

## Step 3 – Optional: Outcome Note im Overlay (30 min)

Ziel:
- Kontextqualitaet fuer spaeteres Lernen erhoehen.

Umsetzung:
1. kleines optionales Textfeld unter Feedback-Buttons
2. bei Klick auf Outcome den Text als `outcome_note` mitsenden
3. Feld nach Erfolg optional leeren

## Step 4 – Stabilitaetscheck

Checkliste:
- Keine JS-Errors in Overlay-Konsole
- `tip_feedback_debug_log` nur erwartbare Eintraege
- Keine neuen Null-Records in `tip_feedback`
- Webhook-Test und produktiver Webhook nicht verwechselt

## Step 5 – Release-Entscheidung

Wenn stabil:
- Aenderungen von `overlay_dev.html` nach `overlay.html` uebernehmen
- dann gem. `RELEASE_CHECKLIST.md` releasen
