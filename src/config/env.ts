import "dotenv/config";
import { z } from "zod";

/**
 * All configuration comes from environment variables — nothing here is
 * hardcoded, and nothing secret ever leaves this process (the frontend
 * only ever receives derived values like `configured: true`).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  // MongoDB Atlas connection string, e.g.
  // mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/podcast_studio
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required (MongoDB Atlas connection string)"),

  // Single-user auth. Generate PASSWORD_HASH with `npm run hash-password`.
  APP_USER_EMAIL: z.string().email(),
  APP_USER_PASSWORD_HASH: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET should be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("30d"),

  // AES-256-GCM key (32 bytes, hex-encoded = 64 hex chars) used to encrypt
  // TTS provider API keys at rest. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"),

  // Backblaze B2, accessed via its S3-compatible API.
  B2_ENDPOINT: z.string().url(),
  B2_REGION: z.string().default("us-west-004"),
  B2_BUCKET: z.string().min(1),
  B2_KEY_ID: z.string().min(1),
  B2_APPLICATION_KEY: z.string().min(1),
  // Public base URL audio is served from. Point this at your Cloudflare
  // CDN/custom domain in front of the B2 bucket (recommended), or leave
  // unset to fall back to the B2 friendly URL directly.
  B2_PUBLIC_BASE_URL: z.string().url().optional(),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nCopy .env.example to .env and fill in real values.");
  process.exit(1);
}

export const env = parsed.data;
