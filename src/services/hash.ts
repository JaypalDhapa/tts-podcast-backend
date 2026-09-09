import crypto from "node:crypto";
import type { BlockInput } from "../types/domain";

/**
 * Deterministically hashes a block's full synthesis configuration —
 * text + provider + voice + every TTS setting, never text alone. Two
 * blocks with the same hash are guaranteed to produce identical audio,
 * so generation can safely reuse an existing artifact instead of
 * calling the TTS provider again.
 */
export function hashBlockConfig(block: Pick<BlockInput, "text" | "provider" | "voiceId" | "settings">): string {
  const canonical = JSON.stringify({
    text: block.text,
    provider: block.provider,
    voiceId: block.voiceId,
    settings: {
      model: block.settings?.model ?? null,
      language: block.settings?.language ?? null,
      speed: block.settings?.speed ?? null,
      pitch: block.settings?.pitch ?? null,
      volume: block.settings?.volume ?? null,
    },
  });

  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 24);
}
