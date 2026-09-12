import {
  Schema,
  model,
  type InferSchemaType,
  type HydratedDocument,
} from "mongoose";

const WordTimestampSchema = new Schema(
  {
    word: { type: String, required: true },
    startMs: { type: Number, required: true },
    endMs: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * One row per distinct (text + provider + voice + settings) hash. Never
 * updated after creation — a changed block produces a new artifact, it
 * never overwrites this one. This is what lets old versions keep playing
 * forever and lets identical blocks across versions share one B2 object.
 */
const AudioArtifactSchema = new Schema(
  {
    hash: { type: String, required: true, unique: true, index: true },
    provider: {
      type: String,
      enum: ["elevenlabs", "cartesia"],
      required: true,
    },
    voiceId: { type: String, required: true },
    storageKey: { type: String, required: true }, // B2 object key
    audioUrl: { type: String, required: true }, // public/CDN URL
    duration: Number,
    format: { type: String, enum: ["mp3", "wav"], default: "mp3" },
    // Word-level timing for this block's own audio (0-based, milliseconds).
    // Cached alongside the audio so a reused artifact carries its timing
    // with it instead of losing it on cache-hit.
    words: { type: [WordTimestampSchema], default: [] },
    timingSource: {
      type: String,
      enum: ["provider", "estimated"],
      default: "provider",
    },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } }
);

AudioArtifactSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.createdAt = ret.createdAt?.toISOString?.() ?? ret.createdAt;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type AudioArtifactDoc = HydratedDocument<
  InferSchemaType<typeof AudioArtifactSchema>
>;
export const AudioArtifact = model("AudioArtifact", AudioArtifactSchema);
