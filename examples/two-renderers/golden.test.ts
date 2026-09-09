import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SOFTWARE } from "../../test/helpers/software";
import { compare } from "./compare";
import { GOLDEN_BYTES, GOLDEN_FILE, MESA } from "./golden";
import { SCENE_SIZE, createScene } from "./scene";

const goldenPath = path.join("examples", "two-renderers", GOLDEN_FILE);

describe("golden", () => {
  it("ships a reference of exactly one frame", () => {
    // Runs everywhere: a truncated or missing asset should fail on every
    // machine, not only on the one that can render.
    const bytes = fs.statSync(goldenPath).size;
    expect(bytes).toBe(GOLDEN_BYTES);
  });
});

describe.skipIf(!SOFTWARE)("golden on the pinned renderer", () => {
  it("reproduces the reference with zero tolerance", async () => {
    const { init } = await import("vgpu/node");
    const { target } = await import("vgpu");
    const gpu = await init({ adapter: "software" });
    try {
      // Refuse to compare against pixels from the wrong renderer. Without this
      // a machine with a real GPU happily "passes" a file whose name says Mesa.
      const name = gpu.adapter.name;
      expect(gpu.adapter.type).toBe("cpu");
      expect(name).toContain(`Mesa ${MESA}`);

      const out = target(gpu, { size: [SCENE_SIZE, SCENE_SIZE], format: "rgba8unorm" });
      const scene = createScene(gpu);
      scene.render(out);
      const pixels = await out.read();

      const expected = new Uint8Array(fs.readFileSync(goldenPath));
      expect(compare(pixels, expected).differing).toBe(0);
    } finally {
      gpu.dispose();
    }
  }, 120_000);
});
