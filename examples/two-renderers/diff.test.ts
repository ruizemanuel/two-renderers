import { describe, expect, it } from "vitest";
import type { Gpu } from "vgpu";
import { SOFTWARE } from "../../test/helpers/software";

const SIZE = 64;

/** A texture of one solid colour, uploaded the way the page uploads the golden. */
function solid(gpu: Gpu, rgba: readonly [number, number, number, number]) {
  const tex = gpu.device.createTexture({
    size: [SIZE, SIZE],
    format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst"],
  });
  const bytes = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < bytes.length; i += 4) bytes.set(rgba, i);
  gpu.gpu.queue.writeTexture({ texture: tex.gpu }, bytes, { bytesPerRow: SIZE * 4 }, [
    SIZE,
    SIZE,
    1,
  ]);
  return tex;
}

describe.skipIf(!SOFTWARE)("diff", () => {
  it("stays black where the two inputs agree, and lights a one-step difference once amplified", async () => {
    // Two separate textures, not the same one bound twice: binding one texture
    // to both sides is black by construction and would pass with the sampling
    // completely wrong.
    const { init } = await import("vgpu/node");
    const { effect, sampler, target } = await import("vgpu");
    const diffSource = (await import("./diff.wgsl")).default;

    const gpu = await init({ adapter: "software" });
    try {
      const same = [solid(gpu, [10, 20, 30, 255]), solid(gpu, [10, 20, 30, 255])] as const;
      const off = solid(gpu, [11, 20, 30, 255]); // one step of red, nothing else

      const out = target(gpu, { size: [SIZE, SIZE], format: "rgba8unorm" });
      const nearest = sampler(gpu, { magFilter: "nearest", minFilter: "nearest" });
      const fx = effect(gpu, diffSource);

      const run = async (a: typeof off, b: typeof off, amplify: number) => {
        fx.set({ golden: a, mine: b, samp: nearest, amplify }).draw(out);
        const px = await out.read();
        let lit = 0;
        let peak = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i] !== 0 || px[i + 1] !== 0 || px[i + 2] !== 0) lit++;
          peak = Math.max(peak, px[i], px[i + 1], px[i + 2]);
        }
        return { lit, peak, total: px.length / 4 };
      };

      // Agreement is black at any gain. If this fails, every number the page
      // prints is suspect.
      expect((await run(same[0], same[1], 64)).lit).toBe(0);

      // One step apart: invisible at ×1, unmistakable at ×64. That gap is the
      // argument the page makes, so it is worth pinning to a number.
      const plain = await run(same[0], off, 1);
      const amplified = await run(same[0], off, 64);
      expect(plain.peak).toBeLessThanOrEqual(1);
      expect(amplified.lit).toBe(amplified.total);
      expect(amplified.peak).toBeGreaterThan(32);
    } finally {
      gpu.dispose();
    }
  }, 120_000);
});
