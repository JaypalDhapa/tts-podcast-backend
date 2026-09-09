import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * One document per API key. There is no array-of-keys anywhere and no
 * hardcoded count — rotation, enable/disable, and failure tracking all
 * operate over however many documents exist for a given provider.
 */
const ProviderApiKeySchema = new Schema(
  {
    provider: { type: String, enum: ["elevenlabs", "cartesia"], required: true, index: true },
    label: { type: String, default: "" }, // e.g. "Key 1" — display only, never the key itself
    encryptedKey: { type: String, required: true }, // AES-256-GCM, see services/crypto.ts

    isActive: { type: Boolean, default: true }, // manual enable/disable
    cooldownUntil: { type: Date, default: null }, // temporary exclusion after a rate-limit hit
    lastUsedAt: { type: Date, default: null }, // drives round-robin selection order

    failureCount: { type: Number, default: 0 }, // consecutive failures; reset on success
    lastFailureAt: { type: Date, default: null },
    lastFailureReason: { type: String, default: null },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

// Powers the rotation query: filter by provider+isActive, sort by lastUsedAt.
ProviderApiKeySchema.index({ provider: 1, isActive: 1, lastUsedAt: 1 });

ProviderApiKeySchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.createdAt = ret.createdAt?.toISOString?.() ?? ret.createdAt;
    ret.updatedAt = ret.updatedAt?.toISOString?.() ?? ret.updatedAt;
    if (ret.lastUsedAt) ret.lastUsedAt = ret.lastUsedAt.toISOString();
    if (ret.lastFailureAt) ret.lastFailureAt = ret.lastFailureAt.toISOString();
    if (ret.cooldownUntil) ret.cooldownUntil = ret.cooldownUntil.toISOString();
    delete ret._id;
    delete ret.__v;
    delete ret.encryptedKey; // never leaves the server, even by accident
    return ret;
  },
});

export type ProviderApiKeyDoc = HydratedDocument<InferSchemaType<typeof ProviderApiKeySchema>>;
export const ProviderApiKey = model("ProviderApiKey", ProviderApiKeySchema);