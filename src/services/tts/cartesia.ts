import type { TTSSettings } from "../../types/domain";

interface SynthesizeParams {
  apiKey: string;
  providerVoiceId: string;
  text: string;
  settings: TTSSettings;
}

/**
 * Calls Cartesia's TTS bytes endpoint and returns raw MP3 bytes.
 * https://docs.cartesia.ai/api-reference/tts/bytes
 */
export async function synthesizeWithCartesia({ apiKey, providerVoiceId, text, settings }: SynthesizeParams): Promise<Buffer> {
  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": "2024-06-10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: settings.model || "sonic-3.5",
      transcript: text,
      voice: { mode: "id", id: providerVoiceId },
      language: settings.language || "en",
      output_format: {
        container: "mp3",
        bit_rate: 128000,
        sample_rate: 44100,
      },
      // Removed top-level `speed` — Cartesia's schema rejects unknown
      // top-level fields with an unhelpful 400. Speed control needs a
      // different nested shape (voice.experimental_controls); left out
      // for now until confirmed against current API docs.
    }),
  });

  if (!response.ok) {
    const body = await safeReadError(response);
    throw new Error(`Cartesia synthesis failed (${response.status}): ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function safeReadError(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const json = JSON.parse(raw);
    return json?.message ?? json?.error ?? raw;
  } catch {
    return raw || response.statusText;
  }
}