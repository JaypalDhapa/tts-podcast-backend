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
  transcriptUrl?: string;
}

/**
 * One word in the final, flattened, globally-offset timeline — exactly
 * the shape written to the transcript JSON and consumed by the
 * frontend for subtitles / active-word highlighting.
 */
export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface KeyCredits {
  supported: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
}