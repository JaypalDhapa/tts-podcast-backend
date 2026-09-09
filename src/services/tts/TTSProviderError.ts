/**
 * Thrown by provider TTS clients (elevenlabs.ts, cartesia.ts) instead of
 * a plain Error, so the key manager can classify the failure by HTTP
 * status (401/403 = invalid key, 429 = rate limited, else transient).
 */
export class TTSProviderError extends Error {
    status: number;
  
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }