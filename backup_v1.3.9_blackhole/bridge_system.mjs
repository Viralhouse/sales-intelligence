import fetch from "node-fetch";
import { spawn } from "child_process";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { detectAudioDevice } from "./detect_audio_devices.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = __dirname;

// --- KONFIGURATION ---
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const SESSION_ID = process.env.CALL_SESSION_ID || `call-${Date.now()}`;

// ✅ Automatische Device-Erkennung mit Fallback
let AUDIO_DEVICE = process.env.AUDIO_DEVICE_SYSTEM || process.env.AUDIO_DEVICE || null;

const SEND_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS_SYSTEM || process.env.SEND_INTERVAL_MS || "25000");
const MAX_BYTES = Number(process.env.MAX_CHUNK_BYTES || "18000000");
const SAMPLE_RATE = "16000";
const CHANNELS = "1";

function chunkFilePath() {
  return path.join(BASE_DIR, `temp_system_${Date.now()}.wav`);
}

function startRecording(outFile, durationMs) {
  const durationSec = Math.max(1, Math.round(durationMs / 1000));
  console.log(`>>> Aufnahme läuft (SYSTEM) für ${durationSec}s … (Device :${AUDIO_DEVICE}, interval ${SEND_INTERVAL_MS}ms)`);

  return spawn("ffmpeg", [
    "-f", "avfoundation",
    "-i", `:${AUDIO_DEVICE}`,
    "-vn",
    "-t", String(durationSec),
    "-ar", SAMPLE_RATE,
    "-ac", CHANNELS,
    "-y", outFile
  ]);
}

function getFileSize(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.size || 0;
  } catch (_) {
    return 0;
  }
}

async function sendAudioToN8n(filePath) {
  if (!fs.existsSync(filePath)) return;

  const size = getFileSize(filePath);
  if (size <= 0) {
    try { fs.unlinkSync(filePath); } catch (_) {}
    return;
  }
  if (size > MAX_BYTES) {
    console.warn(`[n8n-System] Chunk zu groß (${size} bytes) – skip & delete (MAX_BYTES=${MAX_BYTES}).`);
    try { fs.unlinkSync(filePath); } catch (_) {}
    return;
  }

  const form = new FormData();
  form.append("session_id", SESSION_ID);
  form.append("speaker", "them");  // ✅ KORRIGIERT
  form.append("source", "system");

  form.append("audio", fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: "audio/wav",
  });

  try {
    const res = await fetch(N8N_WEBHOOK_URL, { method: "POST", body: form });
    console.log(`[n8n-System] Paket gesendet. Status: ${res.status}`);
  } catch (err) {
    console.error(`[n8n-System] Fehler: ${err.message}`);
  } finally {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
}

async function main() {
  if (!N8N_WEBHOOK_URL) {
    console.error("Fehler: N8N_WEBHOOK_URL fehlt.");
    process.exit(1);
  }

  // ✅ Automatische Device-Erkennung
  if (!AUDIO_DEVICE) {
    console.log("🔍 Suche nach STT_SYSTEM Device...");
    AUDIO_DEVICE = await detectAudioDevice("STT_SYSTEM");
    
    if (!AUDIO_DEVICE) {
      console.error("❌ STT_SYSTEM Device nicht gefunden. Setze AUDIO_DEVICE_SYSTEM manuell.");
      process.exit(1);
    }
  }

  console.log(`🔊 System-Audio Bridge aktiv. Session: ${SESSION_ID}`);
  console.log(`   STT_SYSTEM Device Index: ${AUDIO_DEVICE} | INTERVAL=${SEND_INTERVAL_MS}ms`);

  let backoffMs = 200;

  const runLoop = async () => {
    const outFile = chunkFilePath();
    const ff = startRecording(outFile, SEND_INTERVAL_MS);

    ff.stderr.on("data", (d) => {
      const s = String(d);
      if (s.toLowerCase().includes("error") || s.toLowerCase().includes("avfoundation")) {
        console.log(`[ffmpeg-system] ${s.trim()}`);
      }
    });

    const ffResult = await new Promise((resolve) => {
      let hadError = false;
      ff.on("error", () => { hadError = true; resolve({ hadError, code: -1 }); });
      ff.on("close", (code) => {
        resolve({ hadError: hadError || (code !== 0), code: code ?? 0 });
      });
    });

    if (ffResult.hadError) {
      backoffMs = Math.min(5000, Math.round(backoffMs * 1.7));
      console.warn(`[ffmpeg-system] Aufnahme fehlgeschlagen (code=${ffResult.code}) – retry in ${backoffMs}ms`);
      try { fs.unlinkSync(outFile); } catch (_) {}
      return setTimeout(runLoop, backoffMs);
    }

    backoffMs = 200;

    await sendAudioToN8n(outFile);

    setTimeout(runLoop, 50);
  };

  runLoop();
}

main();