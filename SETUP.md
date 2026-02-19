# Sales Overlay — Setup-Anleitung

## Was ist das?

Das Sales Overlay nimmt während eines Telefonats **beide Audiospuren** auf (Mikrofon + Systemaudio) und sendet sie an einen KI-Agenten in n8n. Dieser analysiert das Gespräch in Echtzeit und zeigt Live-Tipps im App-Fenster.

---

## Einrichtung (einmalig, ca. 10 Min)

### Schritt 1: BlackHole installieren

BlackHole 2ch leitet das Systemaudio (Kundenstimme) in die Aufnahme.

```bash
brew install --cask blackhole-2ch
```

> Homebrew nicht vorhanden? → [brew.sh](https://brew.sh) → Installation kopieren & ausführen

---

### Schritt 2: Audio MIDI Setup einrichten

Öffne **Audio MIDI Setup** (Spotlight: „Audio MIDI Setup") und erstelle zwei Geräte:

**Gerät 1 — System-Audio:**
1. Links unten **+** → **Gerät mit mehreren Ausgängen erstellen**
2. Aktiviere: **BlackHole 2ch** + deine Lautsprecher/Kopfhörer
3. Name: **`STT_SYSTEM`**

**Gerät 2 — Mikrofon:**
1. Links unten **+** → **Gerät mit mehreren Eingängen erstellen**
2. Aktiviere: dein Mikrofon (z.B. „MacBook Pro-Mikrofon")
3. Name: **`STT_MIC`**

**Systemeinstellungen → Ton:**
- Ausgabe → `STT_SYSTEM`
- Eingabe → `STT_MIC`

> Die Gerätenamen müssen **exakt** so heißen: `STT_MIC` und `STT_SYSTEM`

---

### Schritt 3: App öffnen & konfigurieren

1. Doppelklick auf **SalesOverlay.app**
2. Beim ersten Start: **Rechtsklick → Öffnen → Öffnen bestätigen** (Gatekeeper)
3. Die App zeigt automatisch einen Einrichtungsscreen — Webhook-URLs eintragen:
   - **n8n Webhook URL** — erhältst du von deinem Admin
   - **n8n Tips URL** — erhältst du von deinem Admin
4. **Einstellungen speichern** → fertig

**Das war's.** Kein Terminal, kein Konfigurationsfile.

---

## Tägliche Nutzung

| Aktion | Was tun |
|---|---|
| App starten | Doppelklick auf **SalesOverlay.app** (oder aus Dock) |
| Neuen Call starten | **▶ Neuer Call** klicken |
| Call beenden | **⏹ Stoppen** klicken |
| Nächsten Call | **↺ Neu starten** klicken |
| App beenden | Fenster schließen oder Dock → Beenden |

---

## Update

Falls ein `↻` Button in der App erscheint: darauf klicken → Update wird automatisch heruntergeladen und die App neu gestartet.

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| „STT_MIC Device nicht gefunden" | Audio MIDI Setup prüfen — Name muss exakt `STT_MIC` sein |
| „STT_SYSTEM Device nicht gefunden" | Audio MIDI Setup prüfen — Name muss exakt `STT_SYSTEM` sein |
| App öffnet sich nicht (Gatekeeper) | Rechtsklick → Öffnen → Öffnen bestätigen |
| Webhook-URLs ändern | ⚙ Button in der App → neue URLs eintragen |
| Keine Tipps erscheinen | n8n Tips URL prüfen; mindestens 1–2 Minuten warten |
| Port 8787 belegt | App beenden → neu starten |
| ffmpeg Fehler | `brew install ffmpeg` ausführen |
