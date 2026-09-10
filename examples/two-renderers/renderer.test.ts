import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effect: vi.fn(),
  sampler: vi.fn(() => ({})),
  surface: vi.fn(() => ({ kind: "surface" })),
  target: vi.fn(),
  init: vi.fn(),
  clock: vi.fn(),
  frameLoop: vi.fn(),
}));
vi.mock("vgpu", () => mocks);

import { createProbe } from "./renderer";

const SIZE = 512;

function setup(minePixels: Uint8Array) {
  // Two effects, told apart by their label, so a test can say which one drew.
  const film = { draw: vi.fn(() => film), set: vi.fn(() => film) };
  const diff = { draw: vi.fn(() => diff), set: vi.fn(() => diff) };
  mocks.effect.mockImplementation((_gpu: unknown, _src: unknown, opts?: { label?: string }) =>
    opts?.label === "diff" ? diff : film,
  );

  // The loop is captured rather than run: the test ticks it by hand, with a
  // clock it controls, which is the only way to watch a sweep deterministically.
  const ticker = { time: 0 };
  mocks.clock.mockReturnValue(ticker);
  const passes: [unknown, unknown][] = [];
  let tick: ((frame: { pass: (t: unknown, e: unknown) => void }) => void) | undefined;
  mocks.frameLoop.mockImplementation((_gpu: unknown, cb: typeof tick) => {
    tick = cb;
    return { stop: vi.fn() };
  });
  const run = () => tick?.({ pass: (t, e) => passes.push([t, e]) });
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
  return { film, diff, made, canvas, writeTexture, painted, settleLost, ticker, run, passes };
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

  it("sweeps the gain on its own, and pins it when asked", async () => {
    const bytes = new Uint8Array(SIZE * SIZE * 4);
    const { film, diff, canvas, ticker, run, passes } = setup(bytes);
    const probe = await createProbe({ golden: bytes, mineCanvas: canvas(), diffCanvas: canvas() });

    // Left alone, the gain moves with the clock and nothing else.
    ticker.time = 0;
    run();
    const first = probe.currentGain();
    ticker.time = 2.5;
    run();
    expect(probe.currentGain()).not.toBe(first);
    expect(diff.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ amplify: probe.currentGain() }),
    );

    // Pinned, the clock stops mattering.
    probe.setAmplification(32);
    ticker.time = 5;
    run();
    expect(probe.currentGain()).toBe(32);
    expect(diff.set).toHaveBeenLastCalledWith(expect.objectContaining({ amplify: 32 }));

    // And back, without the scene ever being drawn a second time: it is the
    // expensive half, and the control is meant to feel instantaneous.
    probe.setAmplification("auto");
    ticker.time = 7.5;
    run();
    expect(probe.currentGain()).not.toBe(32);
    expect(film.draw).toHaveBeenCalledTimes(1);
    expect(passes.every(([t]) => (t as { kind: string }).kind === "surface")).toBe(true);
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
