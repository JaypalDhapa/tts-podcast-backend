import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const VoiceSchema = new Schema(
  {
    name: { type: String, required: true },
    provider: { type: String, enum: ["elevenlabs", "cartesia"], required: true },
    providerVoiceId: { type: String, required: true },
    language: { type: String, default: "en" },
    gender: { type: String, enum: ["male", "female", "other"] },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: false }
);

VoiceSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type VoiceDoc = HydratedDocument<InferSchemaType<typeof VoiceSchema>>;
export const Voice = model("Voice", VoiceSchema);
