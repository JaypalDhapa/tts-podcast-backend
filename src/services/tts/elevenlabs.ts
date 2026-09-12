import type { TTSSettings } from "../../types/domain";
import { TTSProviderError } from "./TTSProviderError";
import { wordsFromElevenLabsAlignment, type Word } from "./wordTimestamps";

interface SynthesizeParams {
  apiKey: string;
  providerVoiceId: string;
  text: string;
  settings: TTSSettings;
}

export interface ElevenLabsSynthesisResult {
  buffer: Buffer;
  words: Word[];
}

export async function synthesizeWithElevenLabs({
  apiKey,
  providerVoiceId,
  text,
  settings,
}: SynthesizeParams): Promise<ElevenLabsSynthesisResult> {
  // "/with-timestamps" runs the exact same synthesis pipeline as the plain
  // endpoint, but wraps the audio in a JSON envelope alongside
  // character-level alignment data. This is the only ElevenLabs endpoint
  // that gives us timing information at all.
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(providerVoiceId)}/with-timestamps`;

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
      Accept: "application/json",
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

  const payload = (await response.json()) as {
    audio_base64?: string;
    alignment?: {
      characters?: string[];
      character_start_times_seconds?: number[];
      character_end_times_seconds?: number[];
    } | null;
  };

  if (!payload.audio_base64) {
    throw new TTSProviderError(502, "ElevenLabs response did not include audio data.");
  }

  const buffer = Buffer.from(payload.audio_base64, "base64");

  const alignment = payload.alignment;
  const words =
    alignment?.characters && alignment.character_start_times_seconds && alignment.character_end_times_seconds
      ? wordsFromElevenLabsAlignment(
          alignment.characters,
          alignment.character_start_times_seconds,
          alignment.character_end_times_seconds
        )
      : [];

  return { buffer, words };
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