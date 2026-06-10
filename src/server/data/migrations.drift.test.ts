import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "@/server/data/migrations";

/**
 * Drift guard: the inlined SQL in `migrations/index.ts` (the runtime source) MUST
 * match the authored `.sql` file (the reviewable source of truth) byte-for-byte.
 * If you edit one without the other, this fails.
 */
describe("migration registry drift", () => {
  const dir = path.resolve(process.cwd(), "src/server/data/migrations");

  for (const m of MIGRATIONS) {
    it(`${m.name}: embedded SQL matches ${m.name}.sql`, () => {
      const filePath = path.join(dir, `${m.name}.sql`);
      const onDisk = fs.readFileSync(filePath, "utf8");
      expect(m.sql).toBe(onDisk);
    });
  }

  it("versions are unique and ascending", () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
  });
});
