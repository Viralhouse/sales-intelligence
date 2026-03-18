/**
 * bridge_system_native.mjs
 *
 * Native macOS system audio capture using CoreAudio Process Taps (macOS 14.2+).
 * Replaces bridge_system.mjs — no BlackHole or virtual audio device needed.
 *
 * Uses the `audiotee` npm package which wraps a Swift binary.
 * Audio is captured as 16kHz mono PCM, wrapped in WAV, and POSTed to n8n.
 */

import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIG ---
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const SESSION_ID = process.env.CALL_SESSION_ID || `call-${Date.now()}`;
const SEND_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS_SYSTEM || process.env.SEND_INTERVAL_MS || "20000");
const MAX_BYTES = Number(process.env.MAX_CHUNK_BYTES || "18000000");
const SAMPLE_RATE = 16000;

// --- WAV HEADER ---
function createWavHeader(pcmDataLength) {
  const header = Buffer.alloc(44);
  const byteRate = SAMPLE_RATE * 2; // 16-bit mono = 2 bytes per sample
  const blockAlign = 2;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmDataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);        // PCM format chunk size
  header.writeUInt16LE(1, 20);         // PCM format
  header.writeUInt16LE(1, 22);         // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 30);
  header.writeUInt16LE(16, 32);        // 16-bit
  header.write("data", 36);
  header.writeUInt32LE(pcmDataLength, 40);

  return header;
}

// --- SEND TO N8N ---
async function sendChunkToN8n(pcmBuffer) {
  if (!pcmBuffer || pcmBuffer.length === 0) return;

  const wavHeader = createWavHeader(pcmBuffer.length);
  const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

  if (wavBuffer.length > MAX_BYTES) {
    console.warn(`[native-system] Chunk zu groß (${wavBuffer.length} bytes) — skip`);
    return;
  }

  // Write to temp file for FormData stream
  const tmpFile = path.join(os.tmpdir(), `native_system_${Date.now()}.wav`);
  fs.writeFileSync(tmpFile, wavBuffer);

  const form = new FormData();
  form.append("session_id", SESSION_ID);
  form.append("speaker", "them");
  form.append("source", "system");
  form.append("audio", fs.createReadStream(tmpFile), {
    filename: path.basename(tmpFile),
    contentType: "audio/wav",
  });

  try {
    const res = await fetch(N8N_WEBHOOK_URL, { method: "POST", body: form });
    console.log(`[native-system] Chunk gesendet (${(wavBuffer.length / 1024).toFixed(0)} KB). Status: ${res.status}`);
  } catch (err) {
    console.error(`[native-system] Fehler: ${err.message}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

// --- MAIN ---
async function main() {
  if (!N8N_WEBHOOK_URL) {
    console.error("Fehler: N8N_WEBHOOK_URL fehlt.");
    process.exit(1);
  }

  // Check macOS version
  const darwinMajor = parseInt(os.release().split(".")[0], 10);
  if (darwinMajor < 23) {
    console.error(`❌ Native Audio Capture benötigt macOS 14.2+ (Darwin 23+). Gefunden: Darwin ${darwinMajor}`);
    console.error("   Bitte bridge_system.mjs (BlackHole) verwenden.");
    process.exit(2);
  }

  // Dynamic import (audiotee is ESM-only)
  let AudioTee;
  try {
    const mod = await import("audiotee");
    AudioTee = mod.AudioTee || mod.default?.AudioTee || mod.default;
  } catch (err) {
    console.error(`❌ audiotee Modul nicht gefunden: ${err.message}`);
    console.error("   npm install audiotee");
    process.exit(3);
  }

  console.log("──────────────────────────────────────────────");
  console.log("🔊 Native System-Audio Bridge (CoreAudio Tap)");
  console.log(`   Session:  ${SESSION_ID}`);
  console.log(`   Interval: ${SEND_INTERVAL_MS}ms`);
  console.log(`   Rate:     ${SAMPLE_RATE}Hz mono 16-bit`);
  console.log("   Kein BlackHole/virtuelles Device nötig");
  console.log("──────────────────────────────────────────────");

  const audiotee = new AudioTee({
    sampleRate: SAMPLE_RATE,
    chunkDurationMs: 200,  // small chunks, we aggregate ourselves
  });

  // Accumulate PCM data and send at SEND_INTERVAL_MS
  let pcmChunks = [];
  let totalBytes = 0;
  let sendTimer = null;

  function flushAndSend() {
    if (pcmChunks.length === 0) return;

    const combined = Buffer.concat(pcmChunks);
    pcmChunks = [];
    totalBytes = 0;

    // Don't await — fire and forget, don't block the accumulator
    sendChunkToN8n(combined).catch(err => {
      console.error(`[native-system] Send error: ${err.message}`);
    });
  }

  audiotee.on("data", (chunk) => {
    if (chunk && chunk.data) {
      pcmChunks.push(chunk.data);
      totalBytes += chunk.data.length;
    }
  });

  audiotee.on("start", () => {
    console.log("✅ Native Audio Capture gestartet");
    // Start periodic flush
    sendTimer = setInterval(flushAndSend, SEND_INTERVAL_MS);
  });

  audiotee.on("error", (err) => {
    console.error(`[native-system] AudioTee Fehler: ${err.message}`);
    if (err.message && err.message.includes("permission")) {
      console.error("   → Bitte 'System Audio Recording' Permission in Systemeinstellungen erlauben");
      console.error("   → Einstellungen > Datenschutz & Sicherheit > Bildschirm- & Systemtonaufnahme");
    }
  });

  audiotee.on("stop", () => {
    console.log("🛑 Native Audio Capture gestoppt");
    if (sendTimer) clearInterval(sendTimer);
    // Flush remaining data
    flushAndSend();
  });

  audiotee.on("log", (level, msg) => {
    if (level === "info") {
      console.log(`[audiotee] ${msg.message || msg}`);
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n🛑 Beende Native System Bridge...");
    if (sendTimer) clearInterval(sendTimer);
    flushAndSend();
    try { await audiotee.stop(); } catch (_) {}
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  try {
    await audiotee.start();
  } catch (err) {
    console.error(`❌ AudioTee Start fehlgeschlagen: ${err.message}`);
    if (err.message && (err.message.includes("permission") || err.message.includes("denied"))) {
      console.error("   → System Audio Recording Permission fehlt.");
      console.error("   → Einstellungen > Datenschutz & Sicherheit > Bildschirm- & Systemtonaufnahme");
    }
    process.exit(4);
  }
}

main();
