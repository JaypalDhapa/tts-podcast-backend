import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Silence gap (seconds) inserted between every pair of clips during
 * concatenation. Exported so the generation runner computes offsets for
 * the combined word-timestamp timeline using this exact same number —
 * this constant and the ffmpeg filter below must never be allowed to
 * disagree.
 */
export const CONCAT_GAP_SECONDS = 0.6;

/**
 * Sample rate every duration probe decodes to. The actual number doesn't
 * matter for correctness (resampling doesn't change how long the audio
 * *is*, only how many samples represent it) — what matters is that every
 * probe in this file goes through ffmpeg's own decoder, the same decoder
 * that will later actually decode these same buffers inside the concat
 * filter graph. Using a second, different duration estimator (e.g.
 * parsing MP3/Xing metadata) here is exactly what previously caused
 * per-block drift: two different code paths estimating "how long is this
 * MP3" rarely agree down to the millisecond, and that disagreement
 * silently compounds across every block in a long podcast.
 */
const PROBE_SAMPLE_RATE = 44100;

/**
 * Concatenates block audio clips (in order) into a single MP3 buffer.
 * Uses ffmpeg's concat filter (decode + re-encode) rather than the
 * concat demuxer, so it works correctly even when clips came from
 * different providers/encoders with slightly different formats.
 */
export async function concatenateAudio(buffers: Buffer[]): Promise<{ buffer: Buffer; duration: number }> {
  if (buffers.length === 0) {
    throw new Error("No audio clips to concatenate.");
  }
  if (buffers.length === 1) {
    const duration = (await probeDurationMs(buffers[0])) / 1000;
    return { buffer: buffers[0], duration };
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "podcast-studio-"));
  const inputPaths: string[] = [];

  try {
    for (let i = 0; i < buffers.length; i++) {
      const filePath = path.join(workDir, `clip_${i}.mp3`);
      await fs.writeFile(filePath, buffers[i]);
      inputPaths.push(filePath);
    }

    const outputPath = path.join(workDir, `${crypto.randomUUID()}.mp3`);
    await runFfmpegConcat(inputPaths, outputPath, CONCAT_GAP_SECONDS);

    const buffer = await fs.readFile(outputPath);
    const duration = (await probeDurationMs(buffer)) / 1000;
    return { buffer, duration };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runFfmpegConcat(inputPaths: string[], outputPath: string, gapSeconds = CONCAT_GAP_SECONDS): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    inputPaths.forEach((p) => command.input(p));

    // Create separate silence filter for EACH gap between clips
    const filterParts: string[] = [];
    const segments: string[] = [];

    // Create silence filters: sil0, sil1, sil2, etc.
    for (let i = 0; i < inputPaths.length - 1; i++) {
      filterParts.push(`aevalsrc=0:d=${gapSeconds}[sil${i}]`);
    }

    // Build concat segments: [0:a][sil0][1:a][sil1][2:a]...[13:a]
    inputPaths.forEach((_, i) => {
      segments.push(`[${i}:a]`);
      if (i < inputPaths.length - 1) {
        segments.push(`[sil${i}]`);
      }
    });

    const n = segments.length; // Total segments (clips + silences)
    filterParts.push(`${segments.join("")}concat=n=${n}:v=0:a=1[out]`);

    command
      .complexFilter(filterParts.join(";"))
      .outputOptions(["-map", "[out]"])
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .on("error", (err) => reject(err))
      .on("end", () => resolve())
      .save(outputPath);
  });
}

/**
 * Sample-accurate duration of a buffer, measured by actually decoding it
 * through ffmpeg's own MP3 decoder — the exact same decoder that later
 * reads this same buffer inside the concat filter graph above. This is
 * the single source of truth for "how long is this clip" used both for
 * per-block word-timing scaling and for cross-block offset math, so
 * those two things can no longer silently disagree with what the
 * concatenated output actually plays.
 */
export async function probeDurationMs(buffer: Buffer): Promise<number> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "duration-probe-"));
  const inputPath = path.join(workDir, "input.mp3");
  const outputPath = path.join(workDir, "output.pcm");

  try {
    await fs.writeFile(inputPath, buffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(["-f", "s16le", "-ac", "1", "-ar", String(PROBE_SAMPLE_RATE)])
        .on("error", reject)
        .on("end", () => resolve())
        .save(outputPath);
    });

    const pcm = await fs.readFile(outputPath);
    const sampleCount = pcm.length / 2; // s16le, mono = 2 bytes per sample
    return Math.round((sampleCount / PROBE_SAMPLE_RATE) * 1000);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}