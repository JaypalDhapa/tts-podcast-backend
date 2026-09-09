import type { Request, Response } from "express";
import { z } from "zod";
import { ProviderCredential } from "../models/ProviderCredential";
import { encryptSecret } from "../services/crypto";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

const PROVIDERS = [
  { id: "elevenlabs", label: "ElevenLabs" },
  { id: "cartesia", label: "Cartesia" },
];

const saveCredentialSchema = z.object({
  provider: z.enum(["elevenlabs", "cartesia"]),
  apiKey: z.string().min(1),
});

export const listProviders = asyncHandler(async (_req: Request, res: Response) => {
  res.json(PROVIDERS);
});

export const getCredentialStatus = asyncHandler(async (_req: Request, res: Response) => {
  const credentials = await ProviderCredential.find();
  const byProvider = new Map(credentials.map((c) => [c.provider, c]));

  res.json(
    PROVIDERS.map((p) => {
      const cred = byProvider.get(p.id as "elevenlabs" | "cartesia");
      return {
        provider: p.id,
        configured: !!cred,
        updatedAt: cred?.updatedAt?.toISOString(),
      };
    })
  );
});

/** The raw key is used once to encrypt-and-store, then discarded. It is never echoed back. */
export const saveCredential = asyncHandler(async (req: Request, res: Response) => {
  const parsed = saveCredentialSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "A provider and API key are required.");

  const { provider, apiKey } = parsed.data;
  const encryptedKey = encryptSecret(apiKey);

  const credential = await ProviderCredential.findOneAndUpdate(
    { provider },
    { encryptedKey },
    { upsert: true, new: true }
  );

  res.json({ provider, configured: true, updatedAt: credential.updatedAt?.toISOString() });
});

export const deleteCredential = asyncHandler(async (req: Request, res: Response) => {
  const provider = req.params.provider;
  await ProviderCredential.deleteOne({ provider });
  res.status(204).send();
});
