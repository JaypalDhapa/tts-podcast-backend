import { ProviderApiKey } from "../../models/ProviderApiKey";
import { decryptSecret } from "../crypto";
import { ApiError } from "../../utils/apiError";
import type { TTSProvider } from "../../types/domain";

const RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const AUTO_DISABLE_AFTER_FAILURES = 5;

export type FailureClassification = "invalid" | "rate_limited" | "transient";

export interface AcquiredKey {
  id: string;
  apiKey: string;
}

/**
 * Atomically selects the least-recently-used active, non-cooling-down key
 * for a provider and stamps it as just-used — all in one MongoDB
 * operation, so it's safe under concurrent calls and across multiple
 * server instances with no in-memory state involved.
 */
export async function acquireKey(provider: TTSProvider, excludeIds: string[] = []): Promise<AcquiredKey> {
  const now = new Date();

  const doc = await ProviderApiKey.findOneAndUpdate(
    {
      provider,
      isActive: true,
      _id: { $nin: excludeIds },
      $or: [{ cooldownUntil: null }, { cooldownUntil: { $lte: now } }],
    },
    { $set: { lastUsedAt: now } },
    { sort: { lastUsedAt: 1 }, new: true }
  );

  if (!doc) {
    throw new ApiError(
      422,
      `No active API keys available for ${providerLabel(provider)}. Add one in Settings → API Keys.`
    );
  }

  return { id: doc.id, apiKey: decryptSecret(doc.encryptedKey) };
}

export function classifyFailure(status: number | undefined): FailureClassification {
  if (status === 401 || status === 403) return "invalid";
  if (status === 429) return "rate_limited";
  return "transient";
}

/** Records a failed attempt and disables/cools down the key as appropriate. */
export async function reportKeyFailure(keyId: string, classification: FailureClassification, reason: string): Promise<void> {
  const key = await ProviderApiKey.findById(keyId);
  if (!key) return;

  key.failureCount += 1;
  key.lastFailureAt = new Date();
  key.lastFailureReason = reason.slice(0, 500); // never store secrets; provider errors don't contain keys

  if (classification === "invalid") {
    key.isActive = false; // known-broken key — stop selecting it entirely
  } else if (classification === "rate_limited") {
    key.cooldownUntil = new Date(Date.now() + RATE_LIMIT_COOLDOWN_MS);
  } else if (key.failureCount >= AUTO_DISABLE_AFTER_FAILURES) {
    // Repeatedly failing even for "transient" reasons — stop hammering it.
    key.isActive = false;
  }

  await key.save();
}

/** Resets failure tracking after a successful call. */
export async function reportKeySuccess(keyId: string): Promise<void> {
  await ProviderApiKey.findByIdAndUpdate(keyId, {
    $set: { failureCount: 0, lastFailureReason: null },
  });
}

function providerLabel(provider: TTSProvider): string {
  return provider === "elevenlabs" ? "ElevenLabs" : "Cartesia";
}