import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Stores TTS provider API keys encrypted with AES-256-GCM (see
 * services/crypto.ts). The plaintext key only ever exists in memory for
 * the duration of the save request and the duration of a TTS call — it
 * is never logged and never sent back to the frontend. Responses to the
 * client only ever expose `{ provider, configured, updatedAt }`.
 */
const ProviderCredentialSchema = new Schema(
  {
    provider: { type: String, enum: ["elevenlabs", "cartesia"], required: true, unique: true },
    encryptedKey: { type: String, required: true }, // iv:authTag:ciphertext, hex-encoded
  },
  { timestamps: { createdAt: false, updatedAt: "updatedAt" } }
);

export type ProviderCredentialDoc = HydratedDocument<InferSchemaType<typeof ProviderCredentialSchema>>;
export const ProviderCredential = model("ProviderCredential", ProviderCredentialSchema);
