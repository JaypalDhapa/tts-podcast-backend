import type { TTSSettings } from "../../types/domain";
import { TTSProviderError } from "./TTSProviderError";
import { wordsFromCartesiaTimestamps, type Word } from "./wordTimestamps";
import { pcmToMp3 } from "../audio/pcmToMp3";

interface SynthesizeParams {
  apiKey: string;
  providerVoiceId: string;
  text: string;
  settings: TTSSettings;
}

export interface CartesiaSynthesisResult {
  buffer: Buffer;
  words: Word[];
}

const SAMPLE_RATE = 44100;
const ENCODING = "pcm_s16le";

// Your app uses a 0.5x–2x multiplier. Cartesia's generation_config.speed
// expects a number from 0.6 (slowest) to 1.5 (fastest), where 1.0 = normal.
function toCartesiaSpeed(multiplier?: number): number | undefined {
  if (typeof multiplier !== "number" || Number.isNaN(multiplier)) return undefined;
  const clamped = Math.min(2, Math.max(0.5, multiplier));
  if (clamped === 1) return 1;
  if (clamped < 1) return 1 + ((clamped - 1) / 0.5) * 0.4; // 0.5 -> 0.6
  return 1 + ((clamped - 1) / 1) * 0.5;                    // 2.0 -> 1.5
}

type CartesiaSSEEvent =
  | { type: "chunk"; data: string }
  | { type: "timestamps"; word_timestamps?: { words: string[]; start: number[]; end: number[] } }
  | { type: "phoneme_timestamps"; [key: string]: unknown }
  | { type: "done" }
  | { type: "error"; title?: string; message?: string };

export async function synthesizeWithCartesia({
  apiKey,
  providerVoiceId,
  text,
  settings,
}: SynthesizeParams): Promise<CartesiaSynthesisResult> {
  const cartesiaSpeed = toCartesiaSpeed(settings.speed);

  const voice: Record<string, unknown> = {
    mode: "id",
    id: providerVoiceId,
  };

  const generationConfig: Record<string, unknown> | undefined =
    cartesiaSpeed !== undefined ? { speed: cartesiaSpeed } : undefined;

  // SSE only supports "raw" output — mp3/wav containers are Bytes-only.
  // We ask for raw PCM here and transcode to mp3 ourselves below.
  const response = await fetch("https://api.cartesia.ai/tts/sse", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": "2024-06-10",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model_id: settings.model || "sonic-3.5",
      transcript: text,
      voice,
      language: settings.language || "en",
      add_timestamps: true,
      output_format: {
        container: "raw",
        encoding: ENCODING,
        sample_rate: SAMPLE_RATE,
      },
      ...(generationConfig ? { generation_config: generationConfig } : {}),
    }),
  });

  if (!response.ok) {
    const body = await safeReadError(response);
    throw new TTSProviderError(response.status, `Cartesia synthesis failed (${response.status}): ${body}`);
  }
  if (!response.body) {
    throw new TTSProviderError(502, "Cartesia SSE response had no body.");
  }

  const audioChunks: Buffer[] = [];
  let words: Word[] = [];
  let streamError: string | null = null;

  for await (const event of readSSEEvents<CartesiaSSEEvent>(response.body)) {
    if (event.type === "chunk" && event.data) {
      audioChunks.push(Buffer.from(event.data, "base64"));
    } else if (event.type === "timestamps" && event.word_timestamps) {
      const wt = event.word_timestamps;
      words = words.concat(wordsFromCartesiaTimestamps(wt.words, wt.start, wt.end));
    } else if (event.type === "error") {
      streamError = event.message || event.title || "Unknown Cartesia streaming error.";
    } else if (event.type === "done") {
      break;
    }
  }

  if (streamError) {
    throw new TTSProviderError(502, `Cartesia synthesis failed: ${streamError}`);
  }
  if (audioChunks.length === 0) {
    throw new TTSProviderError(502, "Cartesia SSE stream returned no audio.");
  }

  const rawPcm = Buffer.concat(audioChunks);
  const mp3Buffer = await pcmToMp3(rawPcm, { encoding: ENCODING, sampleRate: SAMPLE_RATE, channels: 1 });

  return { buffer: mp3Buffer, words };
}

async function* readSSEEvents<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let frameEnd: number;
      while ((frameEnd = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);

        const dataLines = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());

        if (dataLines.length === 0) continue;

        const payload = dataLines.join("");
        if (!payload || payload === "[DONE]") continue;

        try {
          yield JSON.parse(payload) as T;
        } catch {
          // Malformed/partial frame — skip rather than crash the whole
          // synthesis over one unparsable event.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
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