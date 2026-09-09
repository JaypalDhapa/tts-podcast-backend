# Podcast Studio — Backend

Node.js + TypeScript + Express API for Podcast Studio. Talks to:

- **MongoDB Atlas** — podcasts, versions, blocks, voices, generation jobs, settings
- **Backblaze B2** (via its S3-compatible API) — permanent audio storage
- **Cloudflare** — put a CDN/custom domain in front of your B2 bucket; the backend just returns whatever URL you configure in `B2_PUBLIC_BASE_URL`
- **ElevenLabs** and **Cartesia** — text-to-speech synthesis

This is the backend the frontend's `src/api/*Api.ts` service layer is already shaped to call — set `VITE_USE_MOCK_API=false` and `VITE_API_BASE_URL` to point at this server and no frontend code needs to change.

## Setup

### 1. MongoDB Atlas

Create a free cluster, add a database user, and allow network access from
wherever this runs (your IP, or `0.0.0.0/0` for local development). Copy
the connection string into `MONGODB_URI`.

### 2. Backblaze B2

1. Create a bucket (private or public — if private, put Cloudflare in
   front with a Worker or signed URLs; the simplest setup is a public
   bucket behind a Cloudflare custom domain).
2. Create an Application Key scoped to that bucket → `B2_KEY_ID` /
   `B2_APPLICATION_KEY`.
3. The bucket's S3-compatible endpoint (shown on the bucket page, e.g.
   `https://s3.us-west-004.backblazeb2.com`) → `B2_ENDPOINT` /
   `B2_REGION`.
4. Point a Cloudflare custom domain at the bucket for CDN caching →
   `B2_PUBLIC_BASE_URL`. If you skip this, audio is served directly from
   B2's own public URL instead.

### 3. TTS provider keys

You don't set these in `.env` — they're entered once in the app's
Settings → API Keys screen after you're logged in, and stored encrypted
in MongoDB (see `ENCRYPTION_KEY` below). This matches the frontend's
"keys are backend-owned, never in the browser" contract.

### 4. Secrets

```bash
cp .env.example .env

# Bcrypt-hash your login password:
npm install
npm run hash-password
# paste the output into APP_USER_PASSWORD_HASH in .env

# Generate the encryption key used for provider API keys at rest:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste into ENCRYPTION_KEY in .env
```

Fill in `JWT_SECRET` with any long random string.

### 5. Seed default voices

```bash
npm run seed
```

Creates the four default ElevenLabs/Cartesia voices and the app settings
document, matching what the frontend mock ships with.

### 6. Run it

```bash
npm run dev      # tsx watch, restarts on change
npm run build && npm start   # production
```

The API listens on `http://localhost:4000` by default. Health check at
`GET /health`.

## Architecture notes

- **Auth**: single user, credentials from env vars (no signup, matching
  the "one user, no registration" requirement). Stateless JWT, 30-day
  expiry by default.
- **Hashing**: `src/services/hash.ts` is the *authoritative* hash of a
  block's full TTS configuration (text + provider + voice + settings).
  The frontend's own hash helper is cosmetic/demo-only — this is the one
  that actually decides reuse vs. regenerate.
- **Audio artifacts are immutable**: `AudioArtifact` documents are never
  updated after creation, only created. A changed block hashes
  differently and gets a new artifact; old versions keep pointing at
  their original artifacts forever.
- **Generation is in-process, not a real queue**: `POST
  /api/podcasts/:id/generate` returns immediately (202) with a job id and
  runs the pipeline in the background (`services/generation/generationRunner.ts`),
  updating the `GenerationJob` document as it goes. `GET
  /api/generations/:id` is a plain polling read. This is intentional for
  a personal, zero-infrastructure project — swap in BullMQ/Redis if you
  need durability across server restarts or horizontal scaling.
- **Final audio assembly**: block clips are concatenated with `ffmpeg`
  (via `fluent-ffmpeg` + `ffmpeg-static`, no system ffmpeg install
  required) using a decode-and-re-encode concat filter, which tolerates
  clips coming from different providers/encoders.
- **Secrets**: TTS provider API keys are encrypted with AES-256-GCM
  before being stored in MongoDB and are only ever decrypted in-memory
  for the duration of a TTS call. `GET /api/provider-credentials` returns
  only `{ provider, configured, updatedAt }` — never the key.

## Folder structure

```text
src/
  config/env.ts         Validates all environment variables on boot
  db/connection.ts       MongoDB Atlas connection
  models/                 Mongoose schemas (Podcast, PodcastVersion, Voice,
                           AudioArtifact, ProviderCredential, GenerationJob,
                           AppSettings)
  services/
    storage/               Backblaze B2 client + upload/URL helpers
    tts/                    ElevenLabs + Cartesia clients, dispatch service
    audio/concat.ts         ffmpeg-based final MP3 assembly
    generation/             The generation pipeline orchestrator
    hash.ts                 Authoritative TTS-config hashing
    crypto.ts               AES-256-GCM encrypt/decrypt for provider keys
  controllers/             One per resource, request validation with zod
  routes/                  Route tables, mounted in app.ts
  middleware/              JWT auth guard, centralized error handler
  utils/                    ApiError, asyncHandler
scripts/
  hashPassword.ts          CLI to generate APP_USER_PASSWORD_HASH
  seed.ts                  Seeds default voices + settings
```
