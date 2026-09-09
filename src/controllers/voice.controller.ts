import type { Request, Response } from "express";
import { z } from "zod";
import { Voice } from "../models/Voice";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

const createVoiceSchema = z.object({
  name: z.string().min(1),
  provider: z.enum(["elevenlabs", "cartesia"]),
  providerVoiceId: z.string().min(1),
  gender: z.enum(["male", "female", "other"]).optional(),
  language: z.string().optional(),
});

const updateVoiceSchema = createVoiceSchema.partial();

export const listVoices = asyncHandler(async (_req: Request, res: Response) => {
  const voices = await Voice.find().sort({ isDefault: -1, name: 1 });
  res.json(voices.map((v) => v.toJSON()));
});

export const createVoice = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createVoiceSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Name, provider, and provider voice ID are required.");

  const voice = await Voice.create({ ...parsed.data, isDefault: false });
  res.status(201).json(voice.toJSON());
});

export const updateVoice = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateVoiceSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid voice update payload.");

  const voice = await Voice.findByIdAndUpdate(req.params.id, parsed.data, { new: true });
  if (!voice) throw new ApiError(404, "Voice not found.");
  res.json(voice.toJSON());
});

export const deleteVoice = asyncHandler(async (req: Request, res: Response) => {
  const voice = await Voice.findById(req.params.id);
  if (!voice) throw new ApiError(404, "Voice not found.");
  if (voice.isDefault) throw new ApiError(400, "Default voices can't be deleted.");

  await voice.deleteOne();
  res.status(204).send();
});
