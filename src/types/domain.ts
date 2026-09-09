export type TTSProvider = "elevenlabs" | "cartesia";
export type VoiceGender = "male" | "female" | "other";
export type PodcastMode = "single" | "multiple";

export type BlockGenerationStatus = "idle" | "pending" | "generating" | "reused" | "generated" | "failed";

export interface TTSSettings {
  model?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}

export interface BlockInput {
  id: string;
  order: number;
  text: string;
  provider: TTSProvider;
  voiceId: string;
  settings: TTSSettings;
  status?: BlockGenerationStatus;
  audioArtifactId?: string;
  audioUrl?: string;
  hash?: string;
  error?: string;
}

export type GenerationStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface PodcastAudio {
  url: string;
  duration: number;
}

export interface KeyCredits {
  supported: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
}