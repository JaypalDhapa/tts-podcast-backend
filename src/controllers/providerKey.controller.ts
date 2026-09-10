// src/controllers/providerKey.controller.ts

import type { Request, Response } from "express";
import { z } from "zod";
import { ProviderApiKey } from "../models/ProviderApiKey";
import { encryptSecret, decryptSecret } from "../services/crypto";
import { fetchElevenLabsCredits, fetchCartesiaCredits } from "../services/tts/credits";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

const createKeySchema = z.object({
  provider: z.enum(["elevenlabs", "cartesia"]),
  apiKey: z.string().min(1),
  label: z.string().optional(),
  // Cartesia only — required to call their /usage/credits endpoint.
  adminKey: z.string().min(1).optional(),
  monthlyCreditLimit: z.number().positive().optional(),
});

const updateKeySchema = z.object({
  label: z.string().optional(),
  isActive: z.boolean().optional(),
  // Pass an empty string for adminKey to clear it; omit to leave unchanged.
  adminKey: z.string().optional(),
  monthlyCreditLimit: z.number().positive().nullable().optional(),
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

  const { provider, apiKey, label, adminKey, monthlyCreditLimit } = parsed.data;
  const encryptedKey = encryptSecret(apiKey);

  const existingCount = await ProviderApiKey.countDocuments({ provider });
  const key = await ProviderApiKey.create({
    provider,
    encryptedKey,
    label: label?.trim() || `Key ${existingCount + 1}`,
    isActive: true,
    encryptedAdminKey: provider === "cartesia" && adminKey ? encryptSecret(adminKey) : null,
    monthlyCreditLimit: provider === "cartesia" ? monthlyCreditLimit ?? null : null,
  });

  res.status(201).json(key.toJSON());
});

/** Enable/disable, relabel, or update Cartesia's admin key / credit limit. Never accepts a new apiKey — delete and re-add instead. */
export const updateKey = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updateKeySchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid update payload.");

  const { adminKey, monthlyCreditLimit, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest };

  if (adminKey !== undefined) {
    update.encryptedAdminKey = adminKey.trim() ? encryptSecret(adminKey.trim()) : null;
  }
  if (monthlyCreditLimit !== undefined) {
    update.monthlyCreditLimit = monthlyCreditLimit;
  }

  const key = await ProviderApiKey.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!key) throw new ApiError(404, "API key not found.");
  res.json(key.toJSON());
});

export const deleteKey = asyncHandler(async (req: Request, res: Response) => {
  const key = await ProviderApiKey.findByIdAndDelete(req.params.id);
  if (!key) throw new ApiError(404, "API key not found.");
  res.status(204).send();
});

/** GET /api/provider-keys/:id/credits — decrypts the key server-side and checks balance with provider. */
export const getKeyCredits = asyncHandler(async (req: Request, res: Response) => {
  const doc = await ProviderApiKey.findById(req.params.id);
  if (!doc) throw new ApiError(404, "API key not found.");

  if (doc.provider === "elevenlabs") {
    const apiKey = decryptSecret(doc.encryptedKey);
    return res.json(await fetchElevenLabsCredits(apiKey));
  }

  const adminApiKey = doc.encryptedAdminKey ? decryptSecret(doc.encryptedAdminKey) : null;
  res.json(await fetchCartesiaCredits(adminApiKey, doc.monthlyCreditLimit ?? null));
});