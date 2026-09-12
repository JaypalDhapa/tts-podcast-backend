import { parseBuffer } from "music-metadata";
import { synthesizeWithElevenLabs } from "./elevenlabs";
import { synthesizeWithCartesia } from "./cartesia";
import { acquireKey, classifyFailure, reportKeyFailure, reportKeySuccess } from "./keyManager";
import { TTSProviderError } from "./TTSProviderError";
import { Voice } from "../../models/Voice";
import type { TTSProvider, TTSSettings } from "../../types/domain";
import { ApiError } from "../../utils/apiError";
import { estimateWords, type Word } from "./wordTimestamps";

export interface SynthesisResult {
  buffer: Buffer;
  duration: number;
  words: Word[];
  timingSource: "provider" | "estimated";
}

const MAX_ATTEMPTS = 3;

export async function synthesizeBlock(params: {
  provider: TTSProvider;
  voiceId: string;
  text: string;
  settings: TTSSettings;
}): Promise<SynthesisResult> {
  const { provider, voiceId, text, settings } = params;

  if (!text.trim()) {
    throw new ApiError(400, "Cannot synthesize empty text.");
  }

  const voice = await Voice.findById(voiceId).catch(() => null);
  if (!voice) {
    throw new ApiError(422, "This block's voice no longer exists. Pick a different voice.");
  }
  if (voice.provider !== provider) {
    throw new ApiError(422, "This block's voice doesn't match its provider.");
  }

  const excludeIds: string[] = [];
  let lastErrorMessage = "Unknown error.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const key = await acquireKey(provider, excludeIds);

    try {
      const result =
        provider === "elevenlabs"
          ? await synthesizeWithElevenLabs({ apiKey: key.apiKey, providerVoiceId: voice.providerVoiceId, text, settings })
          : await synthesizeWithCartesia({ apiKey: key.apiKey, providerVoiceId: voice.providerVoiceId, text, settings });

      await reportKeySuccess(key.id);
      const duration = await probeDuration(result.buffer);

      let words = result.words;
      let timingSource: "provider" | "estimated" = "provider";
      if (words.length === 0) {
        words = estimateWords(text, Math.round(duration * 1000));
        timingSource = "estimated";
      }

      return { buffer: result.buffer, duration, words, timingSource };
    } catch (err) {
      const status = err instanceof TTSProviderError ? err.status : undefined;
      const classification = classifyFailure(status);
      const message = err instanceof Error ? err.message : "Synthesis failed.";

      await reportKeyFailure(key.id, classification, message);
      excludeIds.push(key.id);
      lastErrorMessage = message;
    }
  }

  throw new ApiError(
    502,
    `${providerLabel(provider)} voice generation failed after ${MAX_ATTEMPTS} attempts. Please check your configured API keys.`,
    lastErrorMessage
  );
}

async function probeDuration(buffer: Buffer): Promise<number> {
  try {
    const metadata = await parseBuffer(buffer, "audio/mpeg");
    return metadata.format.duration ?? 0;
  } catch {
    return 0;
  }
}

function providerLabel(provider: TTSProvider): string {
  return provider === "elevenlabs" ? "ElevenLabs" : "Cartesia";
}