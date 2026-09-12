import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * TESTING ONLY — writes a transcript JSON to a local folder so you can
 * eyeball the merged timeline without needing B2 configured. Not called
 * anywhere in production paths; wire uploadJson() in generationRunner.ts
 * back in (or alongside this) once you're done testing.
 */
export async function saveTranscriptLocally(
  podcastId: string,
  versionId: string,
  transcript: unknown
): Promise<string> {
  const dir = path.join(process.cwd(), "tmp", "transcripts");
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${podcastId}_${versionId}.json`);
  await fs.writeFile(filePath, JSON.stringify(transcript, null, 2), "utf-8");

  console.log(`[DEBUG] Transcript saved locally: ${filePath}`);
  return filePath;
}