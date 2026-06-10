import "server-only";

/**
 * Deterministic, seedable PRNG for reproducible shuffles (F4-T3). Reproducibility
 * matters for two reasons: tests can assert an exact presentation order, and the
 * stored `shuffle_seed` lets us reason about / re-derive an ordering if needed.
 *
 * Implementation: a 32-bit string hash (cyrb53-lite) seeds a Mulberry32 generator
 * — small, fast, no dependency, and good enough for shuffling exam questions.
 */

/** Hash an arbitrary seed string to a 32-bit unsigned integer. */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Mulberry32 — returns a function yielding floats in [0, 1). */
function mulberry32(seedInt: number): () => number {
  let a = seedInt >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded random source. */
export interface SeededRng {
  /** Next float in [0, 1). */
  next(): number;
  /**
   * Return a NEW array that is a deterministic Fisher–Yates shuffle of `input`
   * (does not mutate `input`).
   */
  shuffle<T>(input: readonly T[]): T[];
}

/** Build a seeded RNG from a seed string. Same seed ⇒ identical output. */
export function createSeededRng(seed: string): SeededRng {
  const rand = mulberry32(hashSeed(seed));
  return {
    next: rand,
    shuffle<T>(input: readonly T[]): T[] {
      const out = [...input];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = out[i]!;
        out[i] = out[j]!;
        out[j] = tmp;
      }
      return out;
    },
  };
}

/** Generate a fresh random seed string (when the caller didn't supply one). */
export function generateSeed(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
