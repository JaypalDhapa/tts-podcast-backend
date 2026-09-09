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
  blockAudioKey,
  finalAudioKey,
} from "../storage/storageService";
import { concatenateAudio } from "../audio/concat";
import type { BlockInput } from "../../types/domain";

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
    console.log(`[DEBUG] Starting audio concatenation for ${clipBuffers.length} clips...`);
    const { buffer: finalBuffer, duration } = await concatenateAudio(clipBuffers);
    console.log(`[DEBUG] Audio concatenated successfully. Duration: ${duration}s, Size: ${finalBuffer.length} bytes`);
    
    const key = finalAudioKey(podcastId, versionId);
    console.log(`[DEBUG] Uploading final audio to: ${key}`);
    const url = await uploadAudio(key, finalBuffer);
    console.log(`[DEBUG] Final audio uploaded successfully: ${url}`);

    version.finalAudio = { url, duration };
    version.status = "generated";
    version.generatedAt = new Date();
    await version.save();

    podcast.finalAudio = { url, duration };
    podcast.currentVersionId = versionId;
    podcast.isOutOfDate = false;
    await podcast.save();

    job.status = "completed";
    job.completedAt = new Date();
    await job.save();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] Final assembly failed:`, errorMessage);
    console.error(`[ERROR] Stack trace:`, err instanceof Error ? err.stack : "No stack trace");
    await failJob(job, `Unable to assemble the final podcast audio: ${errorMessage}`);
    version.status = "failed";
    await version.save();
  }
}

/**
 * For one block: compute its hash, reuse a matching artifact if one
 * exists, otherwise call the TTS provider and store a new one. Either
 * way, returns the raw audio bytes (needed for final assembly) and
 * whether this block was reused or freshly generated.
 */
async function resolveBlockAudio(
  block: BlockInput
): Promise<{
  buffer: Buffer;
  status: "reused" | "generated";
  artifactId: string;
  audioUrl: string;
}> {
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
    return {
      buffer,
      status: "reused",
      artifactId: existing.id,
      audioUrl: existing.audioUrl,
    };
  }

  const { buffer, duration } = await synthesizeBlock({
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
  });

  return { buffer, status: "generated", artifactId: artifact.id, audioUrl };
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
