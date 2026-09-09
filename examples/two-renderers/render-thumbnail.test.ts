import { describe, expect, it } from "vitest";
import { SOFTWARE } from "../../test/helpers/software";
import { SCENE_SIZE } from "./scene";
import { renderThumbnail } from "./render-thumbnail";

describe.skipIf(!SOFTWARE)("renderThumbnail", () => {
  it("leaves a drawn frame behind, not the blank one an unawaited capture gets", async () => {
    // This file is published in meta.files as an example of the headless path,
    // so it is worth running rather than only reading.
    const { init } = await import("vgpu/node");
    const { target } = await import("vgpu");
    const gpu = await init({ adapter: "software" });
    try {
      const out = target(gpu, { size: [SCENE_SIZE, SCENE_SIZE], format: "rgba8unorm" });
      await renderThumbnail(gpu, out);
      const px = await out.read();
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] || px[i + 1] || px[i + 2]) lit++;
      }
      expect(lit).toBeGreaterThan(px.length / 4 / 2);
    } finally {
      gpu.dispose();
    }
  }, 120_000);
});
