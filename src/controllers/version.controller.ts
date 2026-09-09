import type { Request, Response } from "express";
import { z } from "zod";
import { PodcastVersion } from "../models/PodcastVersion";
import { Podcast } from "../models/Podcast";
import { AudioArtifact } from "../models/AudioArtifact";
import { deleteAudio } from "../services/storage/storageService";
import { purgeCacheUrls } from "../services/storage/cachePurge";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

export const listAllVersions = asyncHandler(async (_req: Request, res: Response) => {
  const versions = await PodcastVersion.find().sort({ createdAt: -1 });
  res.json(versions.map((v) => v.toJSON()));
});

const bulkDeleteSchema = z.object({
  versionIds: z.array(z.string()).min(1),
});

/**
 * POST /api/versions/delete — permanently deletes the selected version
 * records AND their audio:
 *
 * - Final audio (the assembled episode MP3) is never shared between
 *   versions, so it's always deleted from B2 outright.
 * - Per-block audio artifacts ARE content-hash-shared and may still be
 *   referenced by other versions or by a podcast's live (unsaved) draft
 *   blocks. Each one is only deleted from B2/Mongo if, after removing
 *   the versions being deleted, nothing else still points at it.
 * - Cloudflare's edge cache is purged for every URL actually deleted.
 */
export const bulkDeleteVersions = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bulkDeleteSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "versionIds is required.");

  const { versionIds } = parsed.data;
  const versions = await PodcastVersion.find({ _id: { $in: versionIds } });
  if (versions.length === 0) {
    res.status(204).send();
    return;
  }

  const urlsToPurge: string[] = [];

  // 1. Final audio — always safe to delete, never shared.
  for (const version of versions) {
    if (version.finalAudio?.url) {
      const key = extractStorageKey(version.finalAudio.url);
      if (key) {
        await deleteAudio(key).catch((err) => console.error(`[versions] Failed to delete final audio ${key}:`, err));
        urlsToPurge.push(version.finalAudio.url);
      }
    }
  }

  // 2. Per-block artifacts — only delete if nothing else still references them.
  const artifactIds = new Set<string>();
  for (const version of versions) {
    for (const block of version.blocks) {
      if (block.audioArtifactId) artifactIds.add(block.audioArtifactId);
    }
  }

  for (const artifactId of artifactIds) {
    const stillReferenced = await isArtifactStillReferenced(artifactId, versionIds);
    if (stillReferenced) continue; // other versions/drafts still need this file — leave it alone

    const artifact = await AudioArtifact.findById(artifactId);
    if (!artifact) continue;

    await deleteAudio(artifact.storageKey).catch((err) =>
      console.error(`[versions] Failed to delete artifact ${artifactId}:`, err)
    );
    urlsToPurge.push(artifact.audioUrl);
    await artifact.deleteOne();
  }

  // 3. Clear any live podcast's "generated" pointer if it referenced a
  //    version being deleted, so the editor doesn't reference a version
  //    that no longer exists. The draft's title/blocks are untouched.
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

  // 4. Delete the version records themselves.
  await PodcastVersion.deleteMany({ _id: { $in: versionIds } });

  // 5. Purge Cloudflare's edge cache for everything actually deleted.
  await purgeCacheUrls(urlsToPurge);

  res.status(204).send();
});

/** True if any version NOT being deleted, or any live podcast draft, still points at this artifact. */
async function isArtifactStillReferenced(artifactId: string, excludingVersionIds: string[]): Promise<boolean> {
  const [versionRefCount, podcastRefCount] = await Promise.all([
    PodcastVersion.countDocuments({
      "blocks.audioArtifactId": artifactId,
      _id: { $nin: excludingVersionIds },
    }),
    Podcast.countDocuments({ "blocks.audioArtifactId": artifactId }),
  ]);
  return versionRefCount > 0 || podcastRefCount > 0;
}

/** Recovers the B2 object key from a full audio URL (works with either the Worker/CDN URL or the raw B2 fallback URL). */
function extractStorageKey(url: string): string | null {
  const match = url.match(/\/(audio\/.+)$/);
  return match ? match[1] : null;
}
