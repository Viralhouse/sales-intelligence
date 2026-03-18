import fetch from "node-fetch";
import { spawn } from "child_process";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { detectAudioDevice } from "./detect_audio_devices.mjs";

// ==============================
// Config
// ==============================
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const SESSION_ID = process.env.CALL_SESSION_ID || `call-${Date.now()}`;

// ✅ Automatische Device-Erkennung mit Fallback
let AUDIO_DEVICE = process.env.AUDIO_DEVICE_MIC || process.env.AUDIO_DEVICE || null;

const SEND_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS || "25000");
const SAMPLE_RATE = "16000";
const CHANNELS = "1";

// ==============================
// Helpers
// ==============================
function chunkFilePath() {
  return path.join(process.cwd(), `temp_mic_${Date.now()}.wav`);
}

function startRecording(outFile, durationMs) {
  const durationSec = Math.max(1, Math.round(durationMs / 1000));
  console.log(`>>> Aufnahme läuft (MIC) für ${durationSec}s … (Device :${AUDIO_DEVICE})`);

  return spawn("ffmpeg", [
    "-f", "avfoundation",
    "-i", `:${AUDIO_DEVICE}`,
    "-vn",
    "-t", String(durationSec),
    "-ar", SAMPLE_RATE,
    "-ac", CHANNELS,
    "-y", outFile,
  ]);
}

async function sendAudioToN8n(filePath) {
  if (!fs.existsSync(filePath)) return;

  const form = new FormData();
  form.append("session_id", SESSION_ID);
  form.append("speaker", "you");
  form.append("source", "mic");

  form.append("audio", fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: "audio/wav",
  });

  try {
    const res = await fetch(N8N_WEBHOOK_URL, { method: "POST", body: form });
    console.log(`[n8n-mic] Paket gesendet. Status: ${res.status}`);
  } catch (err) {
    console.error(`[n8n-mic] Fehler: ${err.message}`);
  } finally {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
}

// ==============================
// Main loop (sequential)
// ==============================
async function main() {
  if (!N8N_WEBHOOK_URL) {
    console.error("Fehler: N8N_WEBHOOK_URL fehlt.");
    process.exit(1);
  }

  // ✅ Automatische Device-Erkennung
  if (!AUDIO_DEVICE) {
    console.log("🔍 Suche nach STT_MIC Device...");
    AUDIO_DEVICE = await detectAudioDevice("STT_MIC");
    
    if (!AUDIO_DEVICE) {
      console.error("❌ STT_MIC Device nicht gefunden. Setze AUDIO_DEVICE_MIC manuell.");
      process.exit(1);
    }
  }

  console.log(`🎙️ MIC-Bridge aktiv. Session: ${SESSION_ID}`);
  console.log(`   STT_MIC Device Index: ${AUDIO_DEVICE} | SEND_INTERVAL_MS=${SEND_INTERVAL_MS}ms`);

  const runLoop = async () => {
    const outFile = chunkFilePath();
    const ff = startRecording(outFile, SEND_INTERVAL_MS);

    ff.stderr.on("data", (d) => {
      const s = String(d);
      if (s.toLowerCase().includes("error") || s.toLowerCase().includes("avfoundation")) {
        console.log(`[ffmpeg-mic] ${s.trim()}`);
      }
    });

    await new Promise((resolve) => {
      ff.on("close", () => resolve());
      ff.on("error", () => resolve());
    });

    await sendAudioToN8n(outFile);

    setTimeout(runLoop, 50);
  };

  runLoop();
}

main();