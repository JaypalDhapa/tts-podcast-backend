import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const GenerationJobSchema = new Schema(
  {
    podcastId: { type: Schema.Types.ObjectId, ref: "Podcast", required: true, index: true },
    versionId: { type: Schema.Types.ObjectId, ref: "PodcastVersion", required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "cancelled"],
      default: "queued",
    },
    totalBlocks: { type: Number, required: true },
    completedBlocks: { type: Number, default: 0 },
    blockStatuses: {
      type: Map,
      of: String,
      default: {},
    },
    error: String,
    completedAt: Date,
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } }
);

GenerationJobSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    ret.podcastId = ret.podcastId?.toString?.() ?? ret.podcastId;
    ret.versionId = ret.versionId?.toString?.() ?? ret.versionId;
    ret.createdAt = ret.createdAt?.toISOString?.() ?? ret.createdAt;
    if (ret.completedAt) ret.completedAt = ret.completedAt.toISOString();
    ret.blockStatuses = ret.blockStatuses instanceof Map ? Object.fromEntries(ret.blockStatuses) : ret.blockStatuses ?? {};
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type GenerationJobDoc = HydratedDocument<InferSchemaType<typeof GenerationJobSchema>>;
export const GenerationJob = model("GenerationJob", GenerationJobSchema);
