import type { Request, Response } from "express";
import { z } from "zod";
import { ProviderApiKey } from "../models/ProviderApiKey";
import { encryptSecret } from "../services/crypto";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

const createKeySchema = z.object({
  provider: z.enum(["elevenlabs", "cartesia"]),
  apiKey: z.string().min(1),
  label: z.string().optional(),
});

const updateKeySchema = z.object({
  label: z.string().optional(),
  isActive: z.boolean().optional(),
});

/** GET /api/provider-keys?provider=cartesia — never returns the actual key. */
export const listKeys = asyncHandler(async (req: Request, res: Response) => {
  const provider = req.query.provider as string | undefined;
  const filter = provider ? { provider } : {};
  const keys = await ProviderApiKey.find(filter).sort({ provider: 1, createdAt: 1 });
  res.json(keys.map((k) => k.toJSON()));
});

export const createKey = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createKeySchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "A provider and API key are required.");

  const { provider, apiKey, label } = parsed.data;
  const encryptedKey = encryptSecret(apiKey);

  const existingCount = await ProviderApiKey.countDocuments({ provider });
  const key = await ProviderApiKey.create({
    provider,
    encryptedKey,
    label: label?.trim() || `Key ${existingCount + 1}`,
    isActive: true,
  });

  res.status(201).json(key.toJSON());
});

/** Enable/disable or relabel a key. Never accepts a new apiKey — delete and re-add instead. */
export const updateKey = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateKeySchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid update payload.");

  const key = await ProviderApiKey.findByIdAndUpdate(req.params.id, parsed.data, { new: true });
  if (!key) throw new ApiError(404, "API key not found.");
  res.json(key.toJSON());
});

export const deleteKey = asyncHandler(async (req: Request, res: Response) => {
  const key = await ProviderApiKey.findByIdAndDelete(req.params.id);
  if (!key) throw new ApiError(404, "API key not found.");
  res.status(204).send();
});