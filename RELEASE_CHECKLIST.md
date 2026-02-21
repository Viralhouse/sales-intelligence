# Release Checklist (SalesOverlay)

Diese Checkliste nutzen wir fuer jeden Release, damit der Ablauf immer gleich und sauber ist.

## Dev-Flow (ohne Release)

1. Neue UI-Aenderungen zuerst in `overlay_dev.html` entwickeln und testen.
2. Runtime-/API-Aenderungen in den produktiven Dateien machen (`main.js`, `overlay-control.mjs`, ggf. Bridges).
3. Wenn Feature fertig ist: relevante Aenderungen von `overlay_dev.html` nach `overlay.html` uebernehmen.

## Release-Flow (nur bei groesseren/stabilen Aenderungen)

1. Arbeitsstand pruefen:
   - `git status --short --branch`
2. Sicherstellen, dass `overlay.html` den finalen UI-Stand hat.
3. Version bump:
   - `npm version <x.y.z> --no-git-tag-version`
4. Build + Release-Asset erstellen:
   - `./scripts/make-release.sh`
5. Pruefen, ob Asset korrekt ist:
   - Datei vorhanden: `dist/release/SalesOverlay.app.zip`
   - Asset-Name muss exakt `SalesOverlay.app.zip` sein
6. Relevante Dateien committen:
   - mindestens `package.json`, `package-lock.json`, `overlay.html`
   - plus weitere geaenderte produktive Dateien
7. Push auf `main`:
   - `git push origin main`
8. GitHub Release erstellen:
   - `gh release create v<x.y.z> dist/release/SalesOverlay.app.zip --repo Viralhouse/sales-intelligence --title "v<x.y.z>" --notes "Release v<x.y.z>"`
9. Release verifizieren:
   - `gh release view v<x.y.z> --repo Viralhouse/sales-intelligence --json tagName,assets,url`
   - Asset `SalesOverlay.app.zip` muss im Release vorhanden sein

## Update-Test (App)

1. Installierte App in `/Applications` beibehalten.
2. In der App auf `↻` klicken.
3. Pruefen:
   - neue Version wird gefunden
   - Download/Restart funktioniert
   - neue Aenderung ist sichtbar

## Regeln

1. Kein Release fuer Kleinigkeiten/Experimente.
2. Erst release, wenn Aenderung lokal stabil getestet ist.
3. Immer nur einen klaren Versionssprung pro Release.
