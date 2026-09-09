import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effect: vi.fn(),
  sampler: vi.fn(() => ({})),
  surface: vi.fn(),
  target: vi.fn(),
  init: vi.fn(),
}));
vi.mock("vgpu", () => mocks);

import { createProbe } from "./renderer";

const SIZE = 512;

function setup(minePixels: Uint8Array) {
  const fx = { draw: vi.fn(() => fx), set: vi.fn(() => fx), destroy: vi.fn() };
  mocks.effect.mockReturnValue(fx);
  const made: unknown[] = [];
  mocks.target.mockImplementation(() => {
    const t = { color: {}, size: [SIZE, SIZE], read: vi.fn(async () => minePixels) };
    made.push(t);
    return t;
  });
  const writeTexture = vi.fn();
  // The real device settles this promise on loss — and also on destroy(), which
  // is what dispose() does. The test drives both.
  let settleLost: (info: { reason: string }) => void = () => {};
  const lost = new Promise<{ reason: string }>((resolve) => {
    settleLost = resolve;
  });
  mocks.init.mockResolvedValue({
    // No `adapter` here on purpose: the browser's Gpu does not have one. If a
    // future change reads gpu.adapter, this mock makes it fail rather than
    // quietly return undefined.
    device: { createTexture: vi.fn(() => ({ gpu: {}, destroy: vi.fn() })) },
    gpu: { queue: { writeTexture }, lost },
    dispose: vi.fn(),
  });
  // navigator.gpu is where the adapter label actually comes from.
  vi.stubGlobal("navigator", {
    gpu: {
      requestAdapter: vi.fn(async () => ({
        info: { vendor: "test", architecture: "arch-1", device: "" },
      })),
    },
  });
  const painted: { data: Uint8ClampedArray }[] = [];
  const canvas = () =>
    ({
      getContext: vi.fn(() => ({
        // A real 2D context hands out the buffer; the module fills it. Using
        // this instead of the ImageData global keeps renderer.ts free of a
        // global that not every host provides.
        createImageData: (w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        }),
        putImageData: vi.fn((img: { data: Uint8ClampedArray }) => painted.push(img)),
      })),
    }) as never;
  return { fx, made, canvas, writeTexture, painted, settleLost };
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("createProbe", () => {
  it("reports the comparison against the golden it was handed", async () => {
    const golden = new Uint8Array(SIZE * SIZE * 4);
    const mine = new Uint8Array(SIZE * SIZE * 4);
    mine[0] = 1;                                   // one channel, one step
    const { canvas, writeTexture, painted } = setup(mine);

    const probe = await createProbe({
      golden,
      mineCanvas: canvas(),
      diffCanvas: canvas(),
    });

    expect(probe.comparison.differing).toBe(1);
    expect(probe.comparison.maxDelta).toBe(1);
    expect(probe.adapterLabel).toBe("test · arch-1");
    // The golden has to reach the GPU through a texture of its own: a Target's
    // colour texture has no CopyDst and writeTexture into it writes nothing.
    expect(writeTexture).toHaveBeenCalledTimes(1);
    // The pixels the visitor sees are the pixels that were measured.
    expect(painted[0]?.data[0]).toBe(1);
  });

  it("changes only the gain uniform when amplification moves", async () => {
    // The scene must not be re-rendered: it is the expensive half, and the
    // control is meant to feel instantaneous.
    const bytes = new Uint8Array(SIZE * SIZE * 4);
    const { fx, canvas } = setup(bytes);
    const probe = await createProbe({ golden: bytes, mineCanvas: canvas(), diffCanvas: canvas() });

    const drawsAfterSetup = fx.draw.mock.calls.length;
    fx.set.mockClear();
    probe.setAmplification(32);

    expect(fx.set).toHaveBeenCalledWith(expect.objectContaining({ amplify: 32 }));
    // exactly one more draw: the diff pass, never the scene
    expect(fx.draw.mock.calls.length).toBe(drawsAfterSetup + 1);
  });

  it("reports a lost device, but not the loss its own dispose() causes", async () => {
    // `dispose()` destroys the device, which settles the same promise with
    // reason "destroyed". Reporting that would mean every unmount tells the
    // visitor their GPU fell over.
    const bytes = new Uint8Array(SIZE * SIZE * 4);
    const { canvas, settleLost } = setup(bytes);
    const probe = await createProbe({
      golden: bytes,
      mineCanvas: canvas(),
      diffCanvas: canvas(),
    });

    let reported = false;
    void probe.lost.then(() => {
      reported = true;
    });

    settleLost({ reason: "destroyed" });
    await Promise.resolve();
    await Promise.resolve();
    expect(reported).toBe(false);
  });

  it("reports a genuine device loss", async () => {
    const bytes = new Uint8Array(SIZE * SIZE * 4);
    const { canvas, settleLost } = setup(bytes);
    const probe = await createProbe({
      golden: bytes,
      mineCanvas: canvas(),
      diffCanvas: canvas(),
    });

    settleLost({ reason: "unknown" });
    await expect(probe.lost).resolves.toBeUndefined();
  });

  it("rejects a golden that is not one frame", async () => {
    const { canvas } = setup(new Uint8Array(SIZE * SIZE * 4));
    await expect(
      createProbe({ golden: new Uint8Array(16), mineCanvas: canvas(), diffCanvas: canvas() }),
    ).rejects.toThrow(RangeError);
  });
});
