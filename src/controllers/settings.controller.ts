import type { Request, Response } from "express";
import { z } from "zod";
import { AppSettings, APP_SETTINGS_ID } from "../models/AppSettings";
import { Voice } from "../models/Voice";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

const updateSettingsSchema = z.object({
  defaultProvider: z.enum(["elevenlabs", "cartesia"]).optional(),
  defaultVoiceId: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  res.json(settings.toJSON());
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid settings payload.");

  const settings = await getOrCreateSettings();
  Object.assign(settings, parsed.data);
  await settings.save();
  res.json(settings.toJSON());
});

async function getOrCreateSettings() {
  let settings = await AppSettings.findById(APP_SETTINGS_ID);
  if (!settings) {
    const firstVoice = await Voice.findOne({ provider: "elevenlabs" });
    settings = await AppSettings.create({
      _id: APP_SETTINGS_ID,
      defaultProvider: "elevenlabs",
      defaultVoiceId: firstVoice?.id ?? "",
      theme: "system",
    });
  }
  return settings;
}
