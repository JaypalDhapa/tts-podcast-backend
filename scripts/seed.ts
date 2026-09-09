import { connectDatabase, disconnectDatabase } from "../src/db/connection";
import { Voice } from "../src/models/Voice";
import { AppSettings, APP_SETTINGS_ID } from "../src/models/AppSettings";

/**
 * Run with: npx tsx scripts/seed.ts
 * Populates the default ElevenLabs/Cartesia voices and app settings
 * document on a fresh MongoDB Atlas database. Safe to re-run — it only
 * inserts voices that don't already exist by name+provider.
 */
const DEFAULT_VOICES = [
  {
    name: "Default Male",
    provider: "elevenlabs" as const,
    providerVoiceId: "21m00Tcm4TlvDq8ikWAM",
    language: "en",
    gender: "male" as const,
    isDefault: true,
  },
  {
    name: "Default Female",
    provider: "elevenlabs" as const,
    providerVoiceId: "EXAVITQu4vr4xnSDxMaL",
    language: "en",
    gender: "female" as const,
    isDefault: true,
  },
  {
    name: "Default Male",
    provider: "cartesia" as const,
    providerVoiceId: "a0e99841-438c-4a64-b679-ae501e7d6091",
    language: "en",
    gender: "male" as const,
    isDefault: true,
  },
  {
    name: "Default Female",
    provider: "cartesia" as const,
    providerVoiceId: "bf0a246a-8642-498a-9950-80c35e9276b5",
    language: "en",
    gender: "female" as const,
    isDefault: true,
  },
];

async function main() {
  await connectDatabase();

  for (const voice of DEFAULT_VOICES) {
    const existing = await Voice.findOne({ name: voice.name, provider: voice.provider });
    if (existing) continue;
    await Voice.create(voice);
    console.log(`Created voice: ${voice.name} (${voice.provider})`);
  }

  const settings = await AppSettings.findById(APP_SETTINGS_ID);
  if (!settings) {
    const defaultVoice = await Voice.findOne({ provider: "elevenlabs", isDefault: true });
    await AppSettings.create({
      _id: APP_SETTINGS_ID,
      defaultProvider: "elevenlabs",
      defaultVoiceId: defaultVoice?.id ?? "",
      theme: "system",
    });
    console.log("Created default app settings.");
  }

  console.log("Seed complete.");
  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
