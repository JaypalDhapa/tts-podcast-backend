import { env } from "../../config/env";

/**
 * Purges specific URLs from Cloudflare's edge cache after a permanent
 * delete, so a stale cached copy doesn't keep serving after the B2
 * object is gone.
 *
 * Requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID, which only apply
 * if audio is served through a Cloudflare-proxied custom domain (the
 * setup recommended in the README). If you're using a bare
 * *.workers.dev URL, there's no zone to purge via this API — the Worker
 * itself would need a matching /purge endpoint that calls
 * `caches.default.delete()`, which only clears that one edge colo, not
 * globally. In that case this function just logs and no-ops; deletion
 * from B2 and MongoDB still happens correctly either way.
 */
export async function purgeCacheUrls(urls: string[]): Promise<void> {
  if (urls.length === 0) return;

  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
    console.warn(
      `[cachePurge] Skipped — CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID not configured. ${urls.length} URL(s) may remain cached at the edge until they expire naturally.`
    );
    return;
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ files: urls }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[cachePurge] Cloudflare purge failed (${response.status}): ${body}`);
    // Don't throw — a failed cache purge shouldn't block the actual
    // storage/database deletion from completing.
  }
}