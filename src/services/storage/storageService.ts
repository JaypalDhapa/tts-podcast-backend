import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { b2Client } from "./b2Client";
import { env } from "../../config/env";

/**
 * Uploads a buffer to B2 under `key` and returns the public URL clients
 * should use to fetch it. That URL points at B2_PUBLIC_BASE_URL, which
 * should be your Cloudflare CDN/custom domain in front of the bucket —
 * B2 remains the durable origin, Cloudflare just caches it. Nothing
 * outside this file constructs a storage URL or knows about B2 vs.
 * Cloudflare vs. anything else; callers only ever get back `audioUrl`.
 */
export async function uploadAudio(key: string, buffer: Buffer, contentType = "audio/mpeg"): Promise<string> {
  await b2Client.send(
    new PutObjectCommand({
      Bucket: env.B2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  const url = buildPublicUrl(key);
  await waitUntilReadable(url);
  return url;
}

/**
 * B2's S3-compatible read path can lag slightly behind a write
 * (eventual consistency). Poll the public URL with backoff until it's
 * actually fetchable, so the URL handed back to the frontend works on
 * the very first request instead of racing the propagation delay.
 */
async function waitUntilReadable(url: string, attempts = 6, delayMs = 400): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) return;
    } catch {
      // network hiccup — fall through to retry
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
  }
  // Give up waiting but don't fail generation over it — worst case the
  // frontend's first play attempt races the same propagation delay.
  console.warn(`[storage] ${url} did not become readable after ${attempts} attempts.`);
}

export async function deleteAudio(key: string): Promise<void> {
  await b2Client.send(new DeleteObjectCommand({ Bucket: env.B2_BUCKET, Key: key }));
}

function buildPublicUrl(key: string): string {
  if (env.B2_PUBLIC_BASE_URL) {
    return `${env.B2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  // Fallback: B2's own friendly URL format (works without a CDN in front,
  // though Cloudflare is strongly recommended for production).
  return `${env.B2_ENDPOINT.replace(/\/$/, "")}/${env.B2_BUCKET}/${key}`;
}

export function blockAudioKey(hash: string): string {
  return `audio/blocks/${hash}.mp3`;
}

export function finalAudioKey(podcastId: string, versionId: string): string {
  return `audio/final/${podcastId}/${versionId}.mp3`;
}
