import type { TTSSettings } from "../../types/domain";
import { TTSProviderError } from "./TTSProviderError";

interface SynthesizeParams {
  apiKey: string;
  providerVoiceId: string;
  text: string;
  settings: TTSSettings;
}

export async function synthesizeWithElevenLabs({ apiKey, providerVoiceId, text, settings }: SynthesizeParams): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(providerVoiceId)}`;

  const voiceSettings: Record<string, number | boolean> = {
    stability: 0.5,
    similarity_boost: 0.75,
  };
  if (typeof settings.speed === "number") {
    voiceSettings.speed = toElevenLabsSpeed(settings.speed);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: settings.model || "eleven_v3",
      voice_settings: voiceSettings,
    }),
  });

  if (!response.ok) {
    const body = await safeReadError(response);
    throw new TTSProviderError(response.status, `ElevenLabs synthesis failed (${response.status}): ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function safeReadError(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const json = JSON.parse(raw);
    return json?.detail?.message ?? raw;
  } catch {
    return raw || response.statusText;
  }
}



// Your app uses a 0.5x–2x multiplier. ElevenLabs only accepts 0.7–1.2.
// Map the full app range onto ElevenLabs' supported range instead of clamping,
// so 0.5x and 2x actually produce audibly different results.
function toElevenLabsSpeed(multiplier: number): number {
  const clamped = Math.min(2, Math.max(0.5, multiplier));
  if (clamped === 1) return 1;
  if (clamped < 1) {
    // 0.5 -> 0.7
    return 1 + ((clamped - 1) / 0.5) * 0.3;
  }
  // 2.0 -> 1.2
  return 1 + ((clamped - 1) / 1) * 0.2;
}