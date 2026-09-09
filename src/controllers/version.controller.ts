import type { Request, Response } from "express";
import { z } from "zod";
import { PodcastVersion } from "../models/PodcastVersion";
import { Podcast } from "../models/Podcast";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

/** GET /api/versions — every version across every podcast, newest first. */
export const listAllVersions = asyncHandler(async (_req: Request, res: Response) => {
  const versions = await PodcastVersion.find().sort({ createdAt: -1 });
  res.json(versions.map((v) => v.toJSON()));
});

const bulkDeleteSchema = z.object({
  versionIds: z.array(z.string()).min(1),
});

/**
 * POST /api/versions/delete — bulk-deletes version *records* only.
 *
 * Deliberately does NOT touch AudioArtifact documents or the underlying
 * B2 objects: artifacts are content-hash-addressed and may still be
 * referenced by other versions (or reused by a future identical block).
 * Deleting them here could silently break playback elsewhere. Only the
 * historical metadata entry goes away.
 */
export const bulkDeleteVersions = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bulkDeleteSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "versionIds is required.");

  const { versionIds } = parsed.data;
  const versions = await PodcastVersion.find({ _id: { $in: versionIds } });

  // If a podcast's "currently generated" pointer references a version
  // being deleted, clear it so the editor doesn't point at a version
  // that no longer exists. The podcast's live draft (title/blocks) is
  // untouched — only the "generated" state resets.
  const podcastIds = [...new Set(versions.map((v) => v.podcastId.toString()))];
  for (const podcastId of podcastIds) {
    const podcast = await Podcast.findById(podcastId);
    if (podcast?.currentVersionId && versionIds.includes(podcast.currentVersionId)) {
      podcast.currentVersionId = undefined;
      podcast.finalAudio = undefined;
      podcast.isOutOfDate = true;
      await podcast.save();
    }
  }

  await PodcastVersion.deleteMany({ _id: { $in: versionIds } });
  res.status(204).send();
});