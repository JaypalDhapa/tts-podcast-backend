import type { TTSSettings } from "../../types/domain";

interface SynthesizeParams {
  apiKey: string;
  providerVoiceId: string;
  text: string;
  settings: TTSSettings;
}

/**
 * Calls ElevenLabs' text-to-speech endpoint and returns raw MP3 bytes.
 * https://elevenlabs.io/docs/api-reference/text-to-speech
 */
export async function synthesizeWithElevenLabs({ apiKey, providerVoiceId, text, settings }: SynthesizeParams): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(providerVoiceId)}`;

  const voiceSettings: Record<string, number | boolean> = {
    stability: 0.5,
    similarity_boost: 0.75,
  };
  // Speed is only honored by newer ElevenLabs models (e.g. eleven_v3);
  // older models silently ignore it, so it's safe to always include.
  if (typeof settings.speed === "number") {
    voiceSettings.speed = clamp(settings.speed, 0.7, 1.2);
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
    throw new Error(`ElevenLabs synthesis failed (${response.status}): ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as any;
    return json?.detail?.message ?? JSON.stringify(json);
  } catch {
    return response.statusText;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
