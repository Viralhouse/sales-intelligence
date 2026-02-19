# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

A macOS dual-channel real-time speech-to-text system for sales call recording. It captures microphone audio ("you") and system audio ("them") in parallel, sending chunked WAV files to an n8n webhook for transcription/storage. The bridge processes use ffmpeg + AVFoundation for audio capture and tag all chunks with a shared `CALL_SESSION_ID`.

## Running & Stopping

```bash
# Set required env vars, then start both bridges
export OPENAI_API_KEY="sk-..."
export N8N_WEBHOOK_URL="https://..."
./test_run.sh

# Stop all bridge processes
./stop_run.sh
```

The overlay HTTP control server (`overlay-control.mjs`) provides an API on port 8787:
```bash
curl -X POST http://127.0.0.1:8787/run       -H "X-Token: change-me"
curl         http://127.0.0.1:8787/status    -H "X-Token: change-me"
curl -X POST http://127.0.0.1:8787/stop      -H "X-Token: change-me"
curl -X POST http://127.0.0.1:8787/new-session -H "X-Token: change-me"
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes | — | Read from env or `.openai_key` file |
| `N8N_WEBHOOK_URL` | Yes | — | Webhook URL for audio delivery |
| `AUDIO_DEVICE_MIC` | No | auto-detect | AVFoundation device index for mic |
| `AUDIO_DEVICE_SYSTEM` | No | auto-detect | AVFoundation device index for system audio |
| `SEND_INTERVAL_MS` | No | 20000 | Chunk recording duration in ms |
| `CALL_SESSION_ID` | No | auto-generated | Session ID; persisted in `call_session.env` |
| `PORT` | No | 8787 | Overlay HTTP server port |
| `OVERLAY_TOKEN` | No | `change-me` | Auth token for HTTP API |

## Architecture

### Key Files

- **`bridge_mic.mjs`** — Captures microphone audio, sends chunks tagged `speaker: "you"`
- **`bridge_system.mjs`** — Captures system audio, sends chunks tagged `speaker: "them"`; includes backoff logic and 18MB chunk size limit
- **`bridge.mjs`** — Legacy alternative using OpenAI Realtime WebSocket API with RMS-based voice gating; targets `gpt-4o-mini-transcribe`
- **`bridge_whisper.mjs`** — Alternative using Whisper API
- **`detect_audio_devices.mjs`** — Runs `ffmpeg -f avfoundation -list_devices` and parses output to find devices named `STT_MIC` and `STT_SYSTEM`
- **`overlay-control.mjs`** — HTTP server that manages bridge process lifecycle via PID tracking

### Session Lifecycle

`test_run.sh` generates a `CALL_SESSION_ID` (format: `call-{timestamp}`) on first run and persists it in `call_session.env`. All audio chunks from both bridges share this ID so downstream n8n workflows can correlate them. `/new-session` deletes `call_session.env` to force a new ID on next run.

### Audio Pipeline

```
AVFoundation device → ffmpeg (16kHz PCM mono) → bridge buffers chunk → HTTP POST (form-data WAV) → n8n webhook
```

Each POST includes: `session_id`, `speaker`, `source` (`mic`/`system`), and the `audio` WAV file.

### Audio Device Setup (macOS)

The system expects AVFoundation virtual audio devices named exactly `STT_MIC` and `STT_SYSTEM`. These are typically created via BlackHole or similar virtual audio routing tools. `detect_audio_devices.mjs` auto-detects their indices at startup.
