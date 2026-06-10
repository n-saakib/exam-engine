import { describe, expect, it } from "vitest";

import { createSeededRng, generateSeed } from "@/server/services/seededRng";

describe("seededRng", () => {
  it("is reproducible: same seed → identical shuffle", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = createSeededRng("seed-xyz").shuffle(input);
    const b = createSeededRng("seed-xyz").shuffle(input);
    expect(a).toEqual(b);
  });

  it("different seeds generally produce different orders", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const a = createSeededRng("seed-a").shuffle(input);
    const b = createSeededRng("seed-b").shuffle(input);
    expect(a).not.toEqual(b);
  });

  it("shuffle is a permutation (no loss, no dupes) and does not mutate input", () => {
    const input = [10, 20, 30, 40, 50];
    const copy = [...input];
    const out = createSeededRng("s").shuffle(input);
    expect([...out].sort((x, y) => x - y)).toEqual(copy);
    expect(input).toEqual(copy); // unmutated
  });

  it("next() yields values in [0, 1)", () => {
    const rng = createSeededRng("s");
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("generateSeed() returns distinct non-empty strings", () => {
    const a = generateSeed();
    const b = generateSeed();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});
