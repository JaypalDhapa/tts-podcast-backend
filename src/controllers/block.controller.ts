import type { Request, Response } from "express";
import { z } from "zod";
import { synthesizeBlock } from "../services/tts/ttsService";
import { uploadAudio, blockAudioKey } from "../services/storage/storageService";
import { hashBlockConfig } from "../services/hash";
import { AudioArtifact } from "../models/AudioArtifact";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

const previewSchema = z.object({
  text: z.string(),
  provider: z.enum(["elevenlabs", "cartesia"]),
  voiceId: z.string(),
  settings: z.object({
    model: z.string().optional(),
    language: z.string().optional(),
    speed: z.number().optional(),
    pitch: z.number().optional(),
    volume: z.number().optional(),
  }),
});

/**
 * POST /api/blocks/:id/preview
 * Generates audio for exactly one block and reuses the same
 * hash-addressed artifact table full generation uses — previewing a
 * block and then generating the podcast won't synthesize it twice.
 */
export const previewBlock = asyncHandler(async (req: Request, res: Response) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Missing text, provider, voice, or settings.");
  if (!parsed.data.text.trim()) throw new ApiError(400, "This block is empty. Write some text before previewing.");

  const { text, provider, voiceId, settings } = parsed.data;
  const hash = hashBlockConfig({ text, provider, voiceId, settings });

  const existing = await AudioArtifact.findOne({ hash });
  if (existing) {
    res.json({ audioUrl: existing.audioUrl, duration: existing.duration ?? 0 });
    return;
  }

  const { buffer, duration } = await synthesizeBlock({ provider, voiceId, text, settings });
  const key = blockAudioKey(hash);
  const audioUrl = await uploadAudio(key, buffer);

  await AudioArtifact.create({ hash, provider, voiceId, storageKey: key, audioUrl, duration, format: "mp3" });

  res.json({ audioUrl, duration });
});
