import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { BlockSchema } from "./BlockSchema";

const PodcastSchema = new Schema(
  {
    title: { type: String, required: true, default: "My English Podcast" },
    mode: { type: String, enum: ["single", "multiple"], default: "multiple" },
    blocks: { type: [BlockSchema], default: [] },
    defaultProvider: { type: String, enum: ["elevenlabs", "cartesia"], default: "elevenlabs" },
    defaultVoiceId: { type: String, required: true },
    currentVersionId: String,
    finalAudio: {
      url: String,
      duration: Number,
      transcriptUrl: String,
    },
    isOutOfDate: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

PodcastSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.updatedAt = ret.updatedAt?.toISOString?.() ?? ret.updatedAt;
    ret.isDirty = false; // isDirty is a frontend-only concept; the API always returns the saved state
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type PodcastDoc = HydratedDocument<InferSchemaType<typeof PodcastSchema>>;
export const Podcast = model("Podcast", PodcastSchema);