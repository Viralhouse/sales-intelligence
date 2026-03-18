import { spawn } from "child_process";

/**
 * Parses ffmpeg avfoundation device list and returns index for given device name.
 * Returns null if not found.
 */
export async function detectAudioDevice(searchName) {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", ["-f", "avfoundation", "-list_devices", "true", "-i", ""]);
    
    let output = "";
    
    ff.stderr.on("data", (d) => {
      output += String(d);
    });
    
    ff.on("close", () => {
      // Parse lines like: [AVFoundation indev @ ...] [4] STT_MIC
      const lines = output.split("\n");
      
      for (const line of lines) {
        // Match pattern: [index] DeviceName
        const match = line.match(/\[(\d+)\]\s+(.+?)$/);
        if (!match) continue;
        
        const [, index, deviceName] = match;
        const cleanName = deviceName.trim();
        
        if (cleanName === searchName) {
          console.log(`✅ Device "${searchName}" gefunden bei Index ${index}`);
          resolve(index);
          return;
        }
      }
      
      console.warn(`⚠️ Device "${searchName}" nicht gefunden`);
      resolve(null);
    });
    
    ff.on("error", () => {
      console.error(`❌ ffmpeg Fehler bei Device-Erkennung`);
      resolve(null);
    });
  });
}

/**
 * Detects both STT_MIC and STT_SYSTEM devices.
 * Returns { mic: "4", system: "5" } or null values if not found.
 */
export async function detectBothDevices() {
  const [mic, system] = await Promise.all([
    detectAudioDevice("STT_MIC"),
    detectAudioDevice("STT_SYSTEM")
  ]);
  
  return { mic, system };
}
