import { Podcast, type PodcastDoc } from "../../models/Podcast";
import { PodcastVersion } from "../../models/PodcastVersion";
import { AudioArtifact } from "../../models/AudioArtifact";
import {
  GenerationJob,
  type GenerationJobDoc,
} from "../../models/GenerationJob";
import { hashBlockConfig } from "../hash";
import { synthesizeBlock } from "../tts/ttsService";
import {
  uploadAudio,
  uploadJson,
  blockAudioKey,
  finalAudioKey,
  finalTranscriptKey,
} from "../storage/storageService";
import { concatenateAudio, probeDurationMs, CONCAT_GAP_SECONDS } from "../audio/concat";
import {
  scaleWordsToDuration,
  offsetWords,
  toOutputFormat,
  estimateWords,
  stripEmotionTagWords,
  type Word,
} from "../tts/wordTimestamps";
import type { BlockInput, TranscriptWord } from "../../types/domain";

interface ResolvedBlockAudio {
  buffer: Buffer;
  status: "reused" | "generated";
  artifactId: string;
  audioUrl: string;
  words: Word[];
  timingSource: "provider" | "estimated";
}

interface BlockTimingRecord {
  order: number;
  words: Word[];
  actualDurationMs: number;
}

/**
 * Runs in the background after POST /api/podcasts/:id/generate responds.
 * Mutates the GenerationJob document as it goes so GET /api/generations/:id
 * can report live progress via polling.
 */
export async function runGeneration(
  podcastId: string,
  versionId: string,
  jobId: string
): Promise<void> {
  const job = await GenerationJob.findById(jobId);
  if (!job) return;

  job.status = "processing";
  await job.save();

  const podcast = await Podcast.findById(podcastId);
  const version = await PodcastVersion.findById(versionId);
  if (!podcast || !version) {
    await failJob(job, "Podcast or version no longer exists.");
    return;
  }

  const clipBuffers: Buffer[] = [];
  const blockTimings: BlockTimingRecord[] = [];
  let hadFailure = false;

  for (const block of podcast.blocks) {
    const blockData: BlockInput = {
      id: block.id,
      order: block.order,
      text: block.text,
      provider: block.provider as BlockInput["provider"],
      voiceId: block.voiceId,
      settings: {
        model: block.settings?.model ?? undefined,
        language: block.settings?.language ?? undefined,
        speed: block.settings?.speed ?? undefined,
        pitch: block.settings?.pitch ?? undefined,
        volume: block.settings?.volume ?? undefined,
      },
    };

    try {
      const result = await resolveBlockAudio(blockData);
      clipBuffers.push(result.buffer);

      const actualDurationMs = await probeDurationMs(result.buffer);
      blockTimings.push({
        order: block.order,
        words: scaleWordsToDuration(result.words, actualDurationMs),
        actualDurationMs,
      });

      applyBlockResult(
        podcast,
        version,
        block.id,
        result.status,
        undefined,
        result.artifactId,
        result.audioUrl
      );
    } catch (err) {
      hadFailure = true;
      applyBlockResult(
        podcast,
        version,
        block.id,
        "failed",
        err instanceof Error ? err.message : "Generation failed."
      );
    }

    job.completedBlocks += 1;
    job.blockStatuses.set(block.id, findBlockStatus(version, block.id));
    await job.save();
  }

  await podcast.save();
  await version.save();

  if (hadFailure) {
    await failJob(
      job,
      "One or more blocks failed to generate. Fix them and try again."
    );
    version.status = "failed";
    await version.save();
    return;
  }

  try {
    const { buffer: finalBuffer, duration } = await concatenateAudio(clipBuffers);

    const key = finalAudioKey(podcastId, versionId);
    const url = await uploadAudio(key, finalBuffer);

    const transcript = buildTranscript(blockTimings, CONCAT_GAP_SECONDS, duration);
    const transcriptKey = finalTranscriptKey(podcastId, versionId);
    const transcriptUrl = await uploadJson(transcriptKey, transcript);

    version.finalAudio = { url, duration, transcriptUrl };
    version.status = "generated";
    version.generatedAt = new Date();
    await version.save();

    podcast.finalAudio = { url, duration, transcriptUrl };
    podcast.currentVersionId = versionId;
    podcast.isOutOfDate = false;
    await podcast.save();

    job.status = "completed";
    job.completedAt = new Date();
    await job.save();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await failJob(job, `Unable to assemble the final podcast audio: ${errorMessage}`);
    version.status = "failed";
    await version.save();
  }
}

/**
 * Combines every block's own (already duration-scaled) word timeline
 * into one flat, globally-offset array — the exact shape the frontend
 * consumes. Blocks are processed in `order`, never array/generation
 * order. Each block's offset is the running sum of every prior block's
 * actual audio duration plus the fixed silence gap concat.ts inserts
 * between clips.
 */
function buildTranscript(
  blockTimings: BlockTimingRecord[],
  gapSeconds: number,
  finalDurationSeconds: number
): TranscriptWord[] {
  const sorted = [...blockTimings].sort((a, b) => a.order - b.order);
  const gapMs = Math.round(gapSeconds * 1000);

  let cursorMs = 0;
  const merged: Word[] = [];

  for (const block of sorted) {
    merged.push(...offsetWords(block.words, cursorMs));
    cursorMs += block.actualDurationMs + gapMs;
  }

  return reconcileWithFinalDuration(toOutputFormat(merged), finalDurationSeconds);
}

/**
 * Safety net: if the merged timeline's last word doesn't line up with
 * the actually-probed duration of the final concatenated file (beyond a
 * small tolerance), clamp rather than let the frontend seek past the
 * end of the audio.
 */
function reconcileWithFinalDuration(words: TranscriptWord[], finalDurationSeconds: number): TranscriptWord[] {
  if (words.length === 0) return words;

  const toleranceMs = 20;
  const finalMs = Math.round(finalDurationSeconds * 1000);
  const lastEndMs = Math.round(words[words.length - 1].end * 1000);

  if (Math.abs(lastEndMs - finalMs) <= toleranceMs) return words;

  const finalSeconds = finalMs / 1000;
  return words.map((w) => ({
    word: w.word,
    start: Math.min(w.start, finalSeconds),
    end: Math.min(w.end, finalSeconds),
  }));
}

/**
 * For one block: compute its hash, reuse a matching artifact if one
 * exists, otherwise call the TTS provider and store a new one.
 */
async function resolveBlockAudio(block: BlockInput): Promise<ResolvedBlockAudio> {
  const hash = hashBlockConfig(block);
  const existing = await AudioArtifact.findOne({ hash });

  if (existing) {
    const response = await fetch(existing.audioUrl);
    if (!response.ok) {
      throw new Error(
        `Could not fetch existing audio artifact (${response.status}).`
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    let words: Word[] = stripEmotionTagWords(
      (existing.words ?? []).map((w) => ({
        word: w.word,
        startMs: w.startMs,
        endMs: w.endMs,
      }))
    );
    let timingSource: "provider" | "estimated" = (existing.timingSource as "provider" | "estimated") ?? "provider";

    if (words.length === 0) {
      const durationMs = await probeDurationMs(buffer);
      words = estimateWords(block.text, durationMs);
      timingSource = "estimated";
      existing.words = words as any;
      existing.timingSource = timingSource;
      await existing.save().catch(() => undefined);
    }

    return {
      buffer,
      status: "reused",
      artifactId: existing.id,
      audioUrl: existing.audioUrl,
      words,
      timingSource,
    };
  }

  const { buffer, duration, words, timingSource } = await synthesizeBlock({
    provider: block.provider,
    voiceId: block.voiceId,
    text: block.text,
    settings: block.settings,
  });

  const key = blockAudioKey(hash);
  const audioUrl = await uploadAudio(key, buffer);

  const artifact = await AudioArtifact.create({
    hash,
    provider: block.provider,
    voiceId: block.voiceId,
    storageKey: key,
    audioUrl,
    duration,
    format: "mp3",
    words,
    timingSource,
  });

  return { buffer, status: "generated", artifactId: artifact.id, audioUrl, words, timingSource };
}

function applyBlockResult(
  podcast: PodcastDoc,
  version: InstanceType<typeof PodcastVersion>,
  blockId: string,
  status: "reused" | "generated" | "failed",
  error?: string,
  artifactId?: string,
  audioUrl?: string
) {
  for (const doc of [podcast, version] as unknown as { blocks: any[] }[]) {
    const block = doc.blocks.find((b: any) => b.id === blockId);
    if (!block) continue;
    block.status = status;
    block.error = error;
    if (status !== "failed") {
      block.hash = hashBlockConfig(block);
      block.audioArtifactId = artifactId;
      block.audioUrl = audioUrl;
    }
  }
}

function findBlockStatus(
  version: InstanceType<typeof PodcastVersion>,
  blockId: string
): string {
  const block = (version.blocks as any[]).find((b: any) => b.id === blockId);
  return block?.status ?? "failed";
}

async function failJob(job: GenerationJobDoc, message: string) {
  job.status = "failed";
  job.error = message;
  job.completedAt = new Date();
  await job.save();
}