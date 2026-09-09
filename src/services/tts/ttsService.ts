import { parseBuffer } from "music-metadata";
import { synthesizeWithElevenLabs } from "./elevenlabs";
import { synthesizeWithCartesia } from "./cartesia";
import { ProviderCredential } from "../../models/ProviderCredential";
import { Voice } from "../../models/Voice";
import { decryptSecret } from "../crypto";
import type { TTSProvider, TTSSettings } from "../../types/domain";
import { ApiError } from "../../utils/apiError";

export interface SynthesisResult {
  buffer: Buffer;
  duration: number;
}

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

  const [credential, voice] = await Promise.all([
    ProviderCredential.findOne({ provider }),
    Voice.findById(voiceId).catch(() => null),
  ]);

  if (!credential) {
    throw new ApiError(
      422,
      `No API key configured for ${providerLabel(provider)}. Add one in Settings → API Keys.`
    );
  }
  if (!voice) {
    throw new ApiError(422, "This block's voice no longer exists. Pick a different voice.");
  }
  if (voice.provider !== provider) {
    throw new ApiError(422, "This block's voice doesn't match its provider.");
  }

  const apiKey = decryptSecret(credential.encryptedKey);

  let buffer: Buffer;
  try {
    buffer =
      provider === "elevenlabs"
        ? await synthesizeWithElevenLabs({ apiKey, providerVoiceId: voice.providerVoiceId, text, settings })
        : await synthesizeWithCartesia({ apiKey, providerVoiceId: voice.providerVoiceId, text, settings });
  } catch (err) {
    throw new ApiError(
      502,
      `${providerLabel(provider)} voice generation failed. Please verify the configured API key and voice ID.`,
      err instanceof Error ? err.message : undefined
    );
  }

  const duration = await probeDuration(buffer);
  return { buffer, duration };
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
