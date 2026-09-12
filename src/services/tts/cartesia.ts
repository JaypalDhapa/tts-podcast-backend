import type { TTSSettings } from "../../types/domain";
import { TTSProviderError } from "./TTSProviderError";

interface SynthesizeParams {
  apiKey: string;
  providerVoiceId: string;
  text: string;
  settings: TTSSettings;
}

// Your app uses a 0.5x–2x multiplier. Cartesia's __experimental_controls.speed
// expects a number from -1.0 (slowest) to 1.0 (fastest), where 0 = normal (1x).
function toCartesiaSpeed(multiplier?: number): number | undefined {
  if (typeof multiplier !== "number" || Number.isNaN(multiplier)) return undefined;
  const clamped = Math.min(2, Math.max(0.5, multiplier));
  if (clamped === 1) return 0;
  if (clamped < 1) return (clamped - 1) / 0.5; // 0.5 -> -1
  return (clamped - 1) / 1;                    // 2.0 -> 1
}

export async function synthesizeWithCartesia({ apiKey, providerVoiceId, text, settings }: SynthesizeParams): Promise<Buffer> {
  const cartesiaSpeed = toCartesiaSpeed(settings.speed);

  const voice: Record<string, unknown> = {
    mode: "id",
    id: providerVoiceId,
  };
  if (cartesiaSpeed !== undefined) {
    voice.__experimental_controls = { speed: cartesiaSpeed };
  }

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
      voice,
      language: settings.language || "en",
      output_format: {
        container: "mp3",
        bit_rate: 128000,
        sample_rate: 44100,
      },
    }),
  });

  if (!response.ok) {
    const body = await safeReadError(response);
    throw new TTSProviderError(response.status, `Cartesia synthesis failed (${response.status}): ${body}`);
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