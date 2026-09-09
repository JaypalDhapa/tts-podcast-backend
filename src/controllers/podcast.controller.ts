import type { Request, Response } from "express";
import { z } from "zod";
import { Podcast } from "../models/Podcast";
import { PodcastVersion } from "../models/PodcastVersion";
import { AppSettings, APP_SETTINGS_ID } from "../models/AppSettings";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";
import { deleteAudio } from "../services/storage/storageService";
import { purgeCacheUrls } from "../services/storage/cachePurge";
import { AudioArtifact } from "../models/AudioArtifact";

const ttsSettingsSchema = z.object({
  model: z.string().optional(),
  language: z.string().optional(),
  speed: z.number().optional(),
  pitch: z.number().optional(),
  volume: z.number().optional(),
});

const blockSchema = z.object({
  id: z.string(),
  order: z.number(),
  text: z.string(),
  provider: z.enum(["elevenlabs", "cartesia"]),
  voiceId: z.string(),
  settings: ttsSettingsSchema,
  status: z.enum(["idle", "pending", "generating", "reused", "generated", "failed"]).optional(),
  audioArtifactId: z.string().optional(),
  audioUrl: z.string().optional(),
  hash: z.string().optional(),
  error: z.string().optional(),
});

const createPodcastSchema = z.object({
  title: z.string().min(1),
  mode: z.enum(["single", "multiple"]),
});

const updatePodcastSchema = z.object({
  title: z.string().min(1).optional(),
  mode: z.enum(["single", "multiple"]).optional(),
  blocks: z.array(blockSchema).optional(),
  defaultProvider: z.enum(["elevenlabs", "cartesia"]).optional(),
  defaultVoiceId: z.string().optional(),
});

export const listPodcasts = asyncHandler(async (_req: Request, res: Response) => {
  const podcasts = await Podcast.find().sort({ updatedAt: -1 });
  res.json(podcasts.map((p) => p.toJSON()));
});

export const getPodcast = asyncHandler(async (req: Request, res: Response) => {
  const podcast = await Podcast.findById(req.params.id);
  if (!podcast) throw new ApiError(404, "Podcast not found.");
  res.json(podcast.toJSON());
});

export const createPodcast = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createPodcastSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "A title and mode are required.");

  const settings = await AppSettings.findById(APP_SETTINGS_ID);
  const podcast = await Podcast.create({
    title: parsed.data.title,
    mode: parsed.data.mode,
    blocks: [],
    defaultProvider: settings?.defaultProvider ?? "elevenlabs",
    defaultVoiceId: settings?.defaultVoiceId,
    isOutOfDate: false,
  });

  res.status(201).json(podcast.toJSON());
});

export const updatePodcast = asyncHandler(async (req: Request, res: Response) => {
  const parsed = updatePodcastSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid podcast update payload.");

  const podcast = await Podcast.findById(req.params.id);
  if (!podcast) throw new ApiError(404, "Podcast not found.");

  const isContentChange = "blocks" in parsed.data || "title" in parsed.data || "mode" in parsed.data;

  Object.assign(podcast, parsed.data);
  if (isContentChange && podcast.finalAudio?.url) {
    podcast.isOutOfDate = true;
  }

  await podcast.save();
  res.json(podcast.toJSON());
});

export const deletePodcast = asyncHandler(async (req: Request, res: Response) => {
  const podcast = await Podcast.findById(req.params.id);
  if (!podcast) throw new ApiError(404, "Podcast not found.");

  // Get all versions first before deleting
  const versions = await PodcastVersion.find({ podcastId: podcast.id });
  
  const urlsToPurge: string[] = [];

  // 1. Delete final audio from B2
  if (podcast.finalAudio?.url) {
    const key = extractStorageKey(podcast.finalAudio.url);
    if (key) {
      await deleteAudio(key).catch((err) => 
        console.error(`[podcast] Failed to delete final audio ${key}:`, err)
      );
      urlsToPurge.push(podcast.finalAudio.url);
    }
  }

  // 2. Delete all block artifacts from B2
  const artifactIds = new Set<string>();
  for (const version of versions) {
    for (const block of version.blocks) {
      if (block.audioArtifactId) artifactIds.add(block.audioArtifactId);
    }
  }

  for (const artifactId of artifactIds) {
    const artifact = await AudioArtifact.findById(artifactId);
    if (artifact) {
      await deleteAudio(artifact.storageKey).catch((err) =>
        console.error(`[podcast] Failed to delete artifact ${artifactId}:`, err)
      );
      urlsToPurge.push(artifact.audioUrl);
      await artifact.deleteOne();
    }
  }

  // 3. Delete from MongoDB
  await Podcast.findByIdAndDelete(podcast.id);
  await PodcastVersion.deleteMany({ podcastId: podcast.id });

  // 4. Purge Cloudflare cache
  await purgeCacheUrls(urlsToPurge);

  res.status(204).send();
});

/** Helper function - same as in version.controller.ts */
function extractStorageKey(url: string): string | null {
  const match = url.match(/\/(audio\/.+)$/);
  return match ? match[1] : null;
}

export const listVersions = asyncHandler(async (req: Request, res: Response) => {
  const versions = await PodcastVersion.find({ podcastId: req.params.id }).sort({ versionNumber: -1 });
  res.json(versions.map((v) => v.toJSON()));
});

export const getVersion = asyncHandler(async (req: Request, res: Response) => {
  const version = await PodcastVersion.findOne({ _id: req.params.versionId, podcastId: req.params.id });
  if (!version) throw new ApiError(404, "That version could not be found.");
  res.json(version.toJSON());
});

/** "Edit as New Version" — copies a historical version's blocks back into the live, editable podcast. The historical version itself is never mutated. */
export const editAsNewVersion = asyncHandler(async (req: Request, res: Response) => {
  const fromVersionId = req.body?.fromVersionId as string | undefined;
  if (!fromVersionId) throw new ApiError(400, "fromVersionId is required.");

  const podcast = await Podcast.findById(req.params.id);
  if (!podcast) throw new ApiError(404, "Podcast not found.");

  const version = await PodcastVersion.findOne({ _id: fromVersionId, podcastId: podcast.id });
  if (!version) throw new ApiError(404, "That version could not be found.");

  podcast.title = version.title;
  podcast.mode = version.mode;
  podcast.blocks = version.blocks.map((b) => ({
    ...b.toObject(),
    // Editable copies keep their audio pointers (still valid, still
    // reusable by hash) but drop any transient generation status.
    status: "idle" as const,
    error: undefined,
  })) as any;

  await podcast.save();
  res.json(podcast.toJSON());
});
