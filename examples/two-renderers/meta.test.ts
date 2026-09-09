import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { meta } from "./meta";

const dir = path.join("examples", "two-renderers");

describe("meta", () => {
  it("lists only files that exist", () => {
    // meta.files is what the examples API publishes. A name that does not
    // resolve becomes a 404 on the example page.
    for (const file of meta.files) {
      expect(fs.existsSync(path.join(dir, file))).toBe(true);
    }
  });

  it("publishes the headless path and the golden test, which is the whole point", () => {
    // Every other example in the gallery keeps render-thumbnail.ts and its
    // tests out of meta.files, so a visitor never sees either. This example
    // exists to show exactly those two things, so it publishes them.
    expect(meta.files).toContain("scene.ts");
    expect(meta.files).toContain("render-thumbnail.ts");
    expect(meta.files).toContain("golden.test.ts");
  });

  it("keeps the ordinary unit tests out, so the published list stays a lesson", () => {
    // scene.test.ts and renderer.test.ts are the vi.mock unit tests every
    // example already has. Publishing them adds volume, not argument.
    expect(meta.files).not.toContain("scene.test.ts");
    expect(meta.files).not.toContain("renderer.test.ts");
  });

  it("never claims plain determinism", () => {
    expect(meta.description).not.toMatch(/\bdeterministic\b/i);
  });
});
