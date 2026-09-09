import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const SINGLETON_ID = "app_settings";

const AppSettingsSchema = new Schema({
  _id: { type: String, default: SINGLETON_ID },
  defaultProvider: { type: String, enum: ["elevenlabs", "cartesia"], default: "elevenlabs" },
  defaultVoiceId: { type: String, required: true },
  theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
});

AppSettingsSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type AppSettingsDoc = HydratedDocument<InferSchemaType<typeof AppSettingsSchema>>;
export const AppSettings = model("AppSettings", AppSettingsSchema);
export const APP_SETTINGS_ID = SINGLETON_ID;
