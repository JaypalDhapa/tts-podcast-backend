// src/services/tts/credits.ts

export interface KeyCredits {
    supported: boolean;
    used: number | null;
    limit: number | null;
    remaining: number | null;
    resetAt: string | null;
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
  
  export async function fetchCartesiaCredits(apiKey: string): Promise<KeyCredits> {
    // Cartesia does not currently expose a public credits/balance API
    void apiKey;
    return { supported: false, used: null, limit: null, remaining: null, resetAt: null };
  }