/**
 * Canonical word-timing shape used internally, once each provider's raw
 * response has been normalized. Milliseconds, integers, always relative
 * to *some* clip's own start — never seconds, never floats — until the
 * very last step (toOutputFormat) converts to what the frontend gets.
 * Keeping everything in integer ms end-to-end is what prevents rounding
 * error from silently accumulating across dozens of blocks.
 */
export interface Word {
    word: string;
    startMs: number;
    endMs: number;
  }
  
  /**
   * Groups ElevenLabs' character-level alignment into words. Splits on
   * whitespace-only characters; the whitespace itself isn't a "word" and
   * is dropped, but its duration is naturally absorbed into the gap
   * between the previous word's end and the next word's start.
   */
  export function wordsFromElevenLabsAlignment(
    characters: string[],
    startTimesSeconds: number[],
    endTimesSeconds: number[]
  ): Word[] {
    const words: Word[] = [];
    let currentChars: string[] = [];
    let currentStartMs: number | null = null;
    let currentEndMs = 0;
  
    const flush = () => {
      if (currentChars.length > 0 && currentStartMs !== null) {
        words.push({
          word: currentChars.join(""),
          startMs: currentStartMs,
          endMs: currentEndMs,
        });
      }
      currentChars = [];
      currentStartMs = null;
    };
  
    for (let i = 0; i < characters.length; i++) {
      const ch = characters[i];
      if (/^\s*$/.test(ch)) {
        flush();
        continue;
      }
      const startMs = Math.round((startTimesSeconds[i] ?? 0) * 1000);
      const endMs = Math.round((endTimesSeconds[i] ?? 0) * 1000);
      if (currentStartMs === null) currentStartMs = startMs;
      currentEndMs = endMs;
      currentChars.push(ch);
    }
    flush();
  
    return words;
  }
  
  /**
   * Cartesia's word_timestamps are already word-level — just seconds -> ms,
   * rounded once.
   */
  export function wordsFromCartesiaTimestamps(
    wordsList: string[],
    startTimesSeconds: number[],
    endTimesSeconds: number[]
  ): Word[] {
    return wordsList.map((word, i) => ({
      word,
      startMs: Math.round((startTimesSeconds[i] ?? 0) * 1000),
      endMs: Math.round((endTimesSeconds[i] ?? 0) * 1000),
    }));
  }
  
  /**
   * Fallback when a provider doesn't return usable timestamps for a block
   * (network hiccup on that call, or a legacy cached artifact from before
   * this feature existed). Splits the block's text into words and spaces
   * them evenly across its known real duration. Not precise, but keeps
   * the pipeline unblocked and the transcript complete instead of failing
   * the whole generation — or silently dropping that block's captions —
   * over one block's missing timing data.
   */
  export function estimateWords(text: string, durationMs: number): Word[] {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || durationMs <= 0) return [];
    const perWordMs = durationMs / tokens.length;
    return tokens.map((word, i) => ({
      word,
      startMs: Math.round(i * perWordMs),
      endMs: Math.round((i + 1) * perWordMs),
    }));
  }
  
  /**
   * Rescales a block's words so its last word ends exactly at the block's
   * *actual* decoded audio duration (measured via ffprobe on the real
   * buffer) rather than whatever the provider's own alignment implied.
   * Small provider-side rounding or trailing silence would otherwise
   * compound once blocks are offset one after another into the final
   * timeline — this pins each block to reality before that ever happens.
   */
  export function scaleWordsToDuration(words: Word[], actualDurationMs: number): Word[] {
    if (words.length === 0 || actualDurationMs <= 0) return words;
    const lastEndMs = words[words.length - 1].endMs;
    if (lastEndMs <= 0) return words;
  
    const scale = actualDurationMs / lastEndMs;
    // Skip rescaling entirely when the provider was already spot-on —
    // avoids introducing needless rounding noise on the common case.
    if (Math.abs(scale - 1) < 0.0005) return words;
  
    return words.map((w) => ({
      word: w.word,
      startMs: Math.round(w.startMs * scale),
      endMs: Math.round(w.endMs * scale),
    }));
  }
  
  /**
   * Shifts every word in a block by a fixed amount — the point in the
   * final concatenated timeline where this block's own audio begins.
   */
  export function offsetWords(words: Word[], offsetMs: number): Word[] {
    return words.map((w) => ({
      word: w.word,
      startMs: w.startMs + offsetMs,
      endMs: w.endMs + offsetMs,
    }));
  }
  
  /**
   * The only place ms is converted back to a float. Ms is already an
   * integer by this point, so this is a single clean division — nowhere
   * upstream re-rounds an already-rounded value.
   */
  export function toOutputFormat(words: Word[]): Array<{ word: string; start: number; end: number }> {
    return words.map((w) => ({
      word: w.word,
      start: w.startMs / 1000,
      end: w.endMs / 1000,
    }));
  }