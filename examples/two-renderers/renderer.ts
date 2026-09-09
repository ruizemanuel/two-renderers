// The browser half. Everything that knows about canvases lives here, which is
// what keeps scene.ts able to run without them.
import { effect, sampler, target, type Effect, type Gpu, type Target } from "vgpu";
import diffSource from "./diff.wgsl";
import { compare, type Comparison } from "./compare";
import { GOLDEN_BYTES } from "./golden";
import { SCENE_SIZE, createScene } from "./scene";

export type Probe = {
  readonly comparison: Comparison;
  readonly adapterLabel: string;
  setAmplification(gain: number): void;
  dispose(): void;
};

export async function createProbe(opts: {
  golden: Uint8Array;
  mineCanvas: HTMLCanvasElement;
  diffCanvas: HTMLCanvasElement;
}): Promise<Probe> {
  if (opts.golden.length !== GOLDEN_BYTES) {
    throw new RangeError(
      `createProbe: golden must be ${GOLDEN_BYTES} bytes, got ${opts.golden.length}`,
    );
  }

  const { init } = await import("vgpu");
  const gpu: Gpu = await init();

  const mine: Target = target(gpu, { size: [SCENE_SIZE, SCENE_SIZE], format: "rgba8unorm" });
  const diffTarget: Target = target(gpu, { size: [SCENE_SIZE, SCENE_SIZE], format: "rgba8unorm" });

  const scene = createScene(gpu);
  scene.render(mine);
  const minePixels = await mine.read();

  // Once, on load. 262,144 pixels walked a single time does not justify a
  // compute pass and its reduction.
  const comparison = compare(minePixels, opts.golden);

  // The golden panel needs no GPU: it is bytes we already have.
  paint(opts.mineCanvas, minePixels);

  // A Target's colour texture is CopySrc|TextureBinding|RenderAttachment — it
  // has no CopyDst, so writeTexture into it is a validation error that silently
  // leaves the texture black. The golden therefore needs a texture of its own,
  // declared copy_dst, which is the same pattern the environment-map example
  // uses to fill its baked environment.
  const goldenTexture = gpu.device.createTexture({
    size: [SCENE_SIZE, SCENE_SIZE],
    format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst"],
  });
  gpu.gpu.queue.writeTexture(
    { texture: goldenTexture.gpu },
    opts.golden,
    { bytesPerRow: SCENE_SIZE * 4 },
    [SCENE_SIZE, SCENE_SIZE, 1],
  );

  const nearest = sampler(gpu, { magFilter: "nearest", minFilter: "nearest" });
  const diff: Effect = effect(gpu, diffSource, { label: "diff" });

  const setAmplification = (gain: number) => {
    diff
      .set({ golden: goldenTexture, mine: mine.color, samp: nearest, amplify: gain })
      .draw(diffTarget);
    void diffTarget.read().then((px) => paint(opts.diffCanvas, px));
  };
  setAmplification(1);

  return {
    comparison,
    // `adapter` on the browser's Gpu is the adapter object, not a description of
    // it, so the label has to come from WebGPU itself.
    adapterLabel: await adapterLabel(),
    setAmplification,
    dispose() {
      scene.destroy();
      goldenTexture.destroy();
      gpu.dispose();
    },
  };
}

/** Whatever the browser is willing to say about the GPU that just rendered. */
async function adapterLabel(): Promise<string> {
  try {
    const adapter = await navigator.gpu.requestAdapter();
    const info = adapter?.info;
    if (!info) return "unknown";
    const parts = [info.vendor, info.architecture, info.device].filter(Boolean);
    return parts.length ? parts.join(" · ") : info.description || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Copies raw RGBA onto a canvas. `ctx.createImageData` rather than the
 * `ImageData` constructor: the context always has it, and it keeps this module
 * from reaching for a global that not every host defines.
 */
function paint(canvas: HTMLCanvasElement, rgba: Uint8Array): void {
  canvas.width = SCENE_SIZE;
  canvas.height = SCENE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(SCENE_SIZE, SCENE_SIZE);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
}
