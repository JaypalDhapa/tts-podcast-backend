import type { Request, Response } from "express";
import { Podcast } from "../models/Podcast";
import { PodcastVersion } from "../models/PodcastVersion";
import { GenerationJob } from "../models/GenerationJob";
import { runGeneration } from "../services/generation/generationRunner";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

export const generatePodcast = asyncHandler(async (req: Request, res: Response) => {
  const podcast = await Podcast.findById(req.params.id);
  if (!podcast) throw new ApiError(404, "Podcast not found.");
  if (podcast.blocks.length === 0) throw new ApiError(400, "Add at least one block before generating.");

  const nextVersionNumber = (await PodcastVersion.countDocuments({ podcastId: podcast.id })) + 1;

  const version = await PodcastVersion.create({
    podcastId: podcast.id,
    versionNumber: nextVersionNumber,
    title: podcast.title,
    mode: podcast.mode,
    blocks: podcast.blocks,
    status: "generating",
  });

  const job = await GenerationJob.create({
    podcastId: podcast.id,
    versionId: version.id,
    status: "queued",
    totalBlocks: podcast.blocks.length,
    completedBlocks: 0,
    blockStatuses: {},
  });

  // Responds immediately; the frontend polls GET /api/generations/:id for
  // progress while this runs in the background. For a personal, single-
  // user, zero-infrastructure project this in-process approach is
  // intentional — swap for a real queue (BullMQ, etc.) if you outgrow it.
  void runGeneration(podcast.id, version.id, job.id).catch((err) => {
    console.error(`Generation job ${job.id} crashed:`, err);
  });

  res.status(202).json({ job: job.toJSON() });
});

export const getGenerationStatus = asyncHandler(async (req: Request, res: Response) => {
  const job = await GenerationJob.findById(req.params.id);
  if (!job) throw new ApiError(404, "Generation job not found.");
  res.json(job.toJSON());
});
