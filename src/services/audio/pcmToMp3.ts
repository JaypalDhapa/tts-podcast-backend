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
 * Cartesia's streaming endpoints (SSE/WebSocket) only support the "raw"
 * output container — no mp3 option like the one-shot /tts/bytes endpoint
 * has. Since the rest of this pipeline (storage, concat, duration
 * probing) is built entirely around mp3 buffers, we transcode raw PCM to
 * mp3 immediately after synthesis, in this one place — nothing
 * downstream ever needs to know Cartesia audio existed in raw form.
 */
const FFMPEG_FORMAT_BY_ENCODING: Record<string, string> = {
  pcm_s16le: "s16le",
  pcm_f32le: "f32le",
  pcm_mulaw: "mulaw",
  pcm_alaw: "alaw",
};

export async function pcmToMp3(
  pcmBuffer: Buffer,
  options: { encoding: string; sampleRate: number; channels?: number }
): Promise<Buffer> {
  const ffmpegFormat = FFMPEG_FORMAT_BY_ENCODING[options.encoding];
  if (!ffmpegFormat) {
    throw new Error(`Unsupported PCM encoding for mp3 transcoding: ${options.encoding}`);
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "cartesia-pcm-"));
  const inputPath = path.join(workDir, "input.pcm");
  const outputPath = path.join(workDir, `${crypto.randomUUID()}.mp3`);

  try {
    await fs.writeFile(inputPath, pcmBuffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions([
          "-f", ffmpegFormat,
          "-ar", String(options.sampleRate),
          "-ac", String(options.channels ?? 1), // Cartesia's default raw output is mono
        ])
        .audioCodec("libmp3lame")
        .audioBitrate("128k")
        .on("error", reject)
        .on("end", () => resolve())
        .save(outputPath);
    });

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}