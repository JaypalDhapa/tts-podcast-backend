// src/services/tts/credits.ts

export interface KeyCredits {
    supported: boolean;
    used: number | null;
    limit: number | null;
    remaining: number | null;
    resetAt: string | null;
    note?: string; // optional human-readable hint, e.g. "admin key required"
  }
  
  export async function fetchElevenLabsCredits(apiKey: string): Promise<KeyCredits> {
    const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": apiKey },
    });
  
    if (!response.ok) {
        const errorText = await response.text();
      
        console.error("ElevenLabs API error:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
      
        throw new Error(
          `ElevenLabs API error ${response.status}: ${errorText}`
        );
      }
  
    const data = await response.json() as {
      character_count?: number;
      character_limit?: number;
      next_character_count_reset_unix?: number;
    };
  
    const used = data.character_count ?? null;
    const limit = data.character_limit ?? null;
    const remaining = used !== null && limit !== null ? limit - used : null;
    const resetAt = data.next_character_count_reset_unix
      ? new Date(data.next_character_count_reset_unix * 1000).toISOString()
      : null;
  
    return { supported: true, used, limit, remaining, resetAt };
  }
  
  /**
   * Cartesia has no "remaining balance" endpoint. It exposes credit *usage*
   * over a time window via /usage/credits, gated behind a separate admin key
   * (sk_car_admin_...) — the normal TTS key is rejected on this route.
   * We sum usage for the current calendar month and, if the caller has told
   * us their plan's monthly credit limit, derive remaining/resetAt from it —
   * mirroring the ElevenLabs shape as closely as the API allows.
   */
  export async function fetchCartesiaCredits(
    adminApiKey: string | null,
    monthlyLimit: number | null
  ): Promise<KeyCredits> {
    if (!adminApiKey) {
      return {
        supported: false,
        used: null,
        limit: null,
        remaining: null,
        resetAt: null,
        note: "Add a Cartesia admin API key to this entry to track credits.",
      };
    }

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const params = new URLSearchParams({
      start_ts: startOfMonth.toISOString(),
      end_ts: now.toISOString(),
    });

    const response = await fetch(`https://api.cartesia.ai/usage/credits?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${adminApiKey}`,
        "Cartesia-Version": "2026-03-01",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error("Cartesia usage API error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });

      throw new Error(`Cartesia API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ start_ts: string; end_ts: string; credits: number }>;
    };

    const used = (data.data ?? []).reduce((sum, bucket) => sum + (bucket.credits ?? 0), 0);
    const limit = monthlyLimit ?? null;
    const remaining = limit !== null ? limit - used : null;

    return {
      supported: true,
      used,
      limit,
      remaining,
      resetAt: startOfNextMonth.toISOString(),
    };
  }