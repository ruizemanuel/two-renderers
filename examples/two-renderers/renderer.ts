// The browser half. Everything that knows about canvases lives here, which is
// what keeps scene.ts able to run without them.
//
// The two left-hand panels are bytes painted onto 2D canvases: the reference is
// bytes we fetched, and the visitor's frame is bytes we read back to compare.
// Only the difference panel is live, because only it has a knob.
import {
  clock,
  effect,
  frameLoop,
  sampler,
  surface,
  target,
  type Effect,
  type FrameLoopHandle,
  type Gpu,
  type Target,
} from "vgpu";
import diffSource from "./diff.wgsl";
import { compare, type Comparison } from "./compare";
import { GOLDEN_BYTES } from "./golden";
import { SCENE_SIZE, createScene } from "./scene";

/**
 * The end of the scale, not an arbitrary maximum: at this gain one step of 255
 * is full brightness, so every pixel that differs at all is lit.
 */
export const MAX_GAIN = 255;

/** Seconds for one full sweep up and back down. Slow enough to read. */
const SWEEP_SECONDS = 9;

export type Probe = {
  readonly comparison: Comparison;
  readonly adapterLabel: string;
  /**
   * Resolves if the device is lost for any reason other than this probe's own
   * `dispose()`. Never rejects: losing a device is a thing that happens to a
   * page, not an error it made.
   */
  readonly lost: Promise<void>;
  /** A number pins the amplification; "auto" hands it back to the sweep. */
  setAmplification(gain: number | "auto"): void;
  /** Whatever gain is on screen this instant, for the caption to read. */
  currentGain(): number;
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

  const scene = createScene(gpu);
  scene.render(mine);
  const minePixels = await mine.read();

  // Once, on load. 262,144 pixels walked a single time does not justify a
  // compute pass and its reduction.
  const comparison = compare(minePixels, opts.golden);

  // The two still panels need no GPU: the reference is bytes we were handed and
  // this one is bytes we just read back.
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
  const view = surface(gpu, opts.diffCanvas, { dpr: [1, 2] });
  const ticker = clock(gpu);

  // Someone who asked for less motion gets the most informative still frame
  // rather than a stopped one: at the top of the scale every disagreement shows.
  const still = prefersReducedMotion();

  let pinned: number | null = null;
  let gain = MAX_GAIN;

  const loop: FrameLoopHandle = frameLoop(gpu, (frame) => {
    gain = pinned ?? (still ? MAX_GAIN : sweptGain(ticker.time));
    diff.set({ golden: goldenTexture, mine: mine.color, samp: nearest, amplify: gain });
    frame.pass(view, diff);
  });

  return {
    comparison,
    lost: lostPromise(gpu),
    setAmplification(next) {
      pinned = next === "auto" ? null : next;
    },
    currentGain: () => gain,
    // `adapter` on the browser's Gpu is the adapter object, not a description of
    // it, so the label has to come from WebGPU itself.
    adapterLabel: await adapterLabel(),
    dispose() {
      loop.stop();
      scene.destroy();
      goldenTexture.destroy();
      gpu.dispose();
    },
  };
}

/**
 * Logarithmic, so every doubling of the gain gets the same time on screen and
 * the interesting middle is not rushed through. Eased at both ends, because the
 * point of the sweep is to be read, not to strobe.
 */
function sweptGain(time: number): number {
  const phase = (time % SWEEP_SECONDS) / SWEEP_SECONDS;
  // Starts at the top, dives briefly, comes back. Two shaping decisions, both
  // about where the seconds go: it opens at ×255 because opening at ×1 would
  // spend a visitor's first moment on an empty square, and it is cubed so most
  // of the cycle sits high — the panel is worth looking at when it is lit, and
  // "everything vanishes" only needs an instant to read.
  const dip = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI);
  return Math.pow(MAX_GAIN, 1 - dip * dip * dip);
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Resolves on a real loss. `dispose()` settles the same promise with reason
 *  "destroyed", and forwarding that would tell every visitor who navigates away
 *  that their GPU fell over. */
function lostPromise(gpu: Gpu): Promise<void> {
  return new Promise((resolve) => {
    void gpu.gpu.lost.then((info) => {
      if (info.reason !== "destroyed") resolve();
    });
  });
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
