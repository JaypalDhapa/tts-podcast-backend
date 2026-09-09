import { S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env";

/**
 * Backblaze B2 exposes an S3-compatible API, so we talk to it with the
 * standard AWS SDK pointed at B2's endpoint. This is the only file that
 * knows B2-specific connection details; everything else calls
 * storageService.ts.
 */
export const b2Client = new S3Client({
  endpoint: env.B2_ENDPOINT,
  region: env.B2_REGION,
  credentials: {
    accessKeyId: env.B2_KEY_ID,
    secretAccessKey: env.B2_APPLICATION_KEY,
  },
  forcePathStyle: true,
});
