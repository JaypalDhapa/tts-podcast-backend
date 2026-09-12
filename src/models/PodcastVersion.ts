import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { BlockSchema } from "./BlockSchema";

const PodcastVersionSchema = new Schema(
  {
    podcastId: { type: Schema.Types.ObjectId, ref: "Podcast", required: true, index: true },
    versionNumber: { type: Number, required: true },
    title: { type: String, required: true },
    mode: { type: String, enum: ["single", "multiple"], required: true },
    blocks: { type: [BlockSchema], default: [] },
    finalAudio: {
      url: String,
      duration: Number,
      transcriptUrl: String,
    },
    status: {
      type: String,
      enum: ["draft", "generating", "generated", "failed"],
      default: "draft",
    },
    generatedAt: Date,
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } }
);

PodcastVersionSchema.index({ podcastId: 1, versionNumber: -1 });

PodcastVersionSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.podcastId = ret.podcastId?.toString?.() ?? ret.podcastId;
    ret.createdAt = ret.createdAt?.toISOString?.() ?? ret.createdAt;
    if (ret.generatedAt) ret.generatedAt = ret.generatedAt.toISOString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type PodcastVersionDoc = HydratedDocument<InferSchemaType<typeof PodcastVersionSchema>>;
export const PodcastVersion = model("PodcastVersion", PodcastVersionSchema);