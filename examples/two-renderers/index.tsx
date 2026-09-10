"use client";

import { useEffect, useRef, useState } from "react";
import { GOLDEN_FILE } from "./golden";
import { MAX_GAIN, createProbe, type Probe } from "./renderer";

// ×255 is the end of the scale, not an arbitrary maximum: one step of 255 is
// exactly full brightness at that gain, so every pixel that differs at all
// lights up. Measured: at ×64 a one-step difference only reaches 64/255, and
// the panel scales down from 512, which dims it further.
const GAINS = [1, 4, 16, 64, MAX_GAIN];

/** The page is written in English, so its numbers are too: a visitor's locale
 *  would render 262144 as "262.144" next to English prose, which reads as a
 *  decimal. */
const count = new Intl.NumberFormat("en-US");

/** What went wrong, when something did. The two causes read differently on the
 *  page, because telling someone their browser lacks WebGPU when the asset just
 *  failed to load sends them to fix the wrong thing. */
type Failure = "none" | "no-golden" | "no-webgpu";

export function Example() {
  const mineCanvas = useRef<HTMLCanvasElement>(null);
  const diffCanvas = useRef<HTMLCanvasElement>(null);
  const goldenCanvas = useRef<HTMLCanvasElement>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  // null means the gain is sweeping. The number on the caption is read back from
  // the renderer a few times a second rather than every frame: the sweep lives
  // on the GPU, and re-rendering React at 60fps to move one label would be the
  // most expensive part of the page.
  const [pinned, setPinned] = useState<number | null>(null);
  const [shownGain, setShownGain] = useState(MAX_GAIN);
  const [failure, setFailure] = useState<Failure>("none");
  const [deviceLost, setDeviceLost] = useState(false);

  // Resolves once the previous probe is gone. React can mount, unmount and mount
  // again before any of the setup below settles — StrictMode does exactly that
  // in development — and two probes fighting over one canvas leave its WebGPU
  // context unconfigured, so the second waits for the first to be disposed.
  const previousGone = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let live = true;
    let started: Probe | null = null;
    let finished!: () => void;
    const gone = new Promise<void>((resolve) => {
      finished = resolve;
    });
    const waitFor = previousGone.current;
    previousGone.current = gone;

    const ready = waitFor.then(async () => {
      if (!live) return;
      const bytes = await fetchGolden();
      if (!bytes) {
        if (live) setFailure("no-golden");
        return;
      }
      paint(goldenCanvas.current, bytes);
      try {
        if (!live || !mineCanvas.current || !diffCanvas.current) return;
        const made = await createProbe({
          golden: bytes,
          mineCanvas: mineCanvas.current,
          diffCanvas: diffCanvas.current,
        });
        if (!live) {
          made.dispose();
          return;
        }
        started = made;
        setProbe(made);
        // Panels 1 and 2 are 2D bitmaps by now and survive a lost device; only
        // the amplification pass needs the GPU still to be there.
        void made.lost.then(() => {
          if (live) setDeviceLost(true);
        });
      } catch {
        if (live) setFailure("no-webgpu");
      }
    });

    return () => {
      live = false;
      void ready.then(() => {
        started?.dispose();
        finished();
      });
    };
  }, []);

  useEffect(() => {
    if (!probe) return;
    const id = setInterval(() => setShownGain(Math.round(probe.currentGain())), 120);
    return () => clearInterval(id);
  }, [probe]);

  // Without WebGPU the reference still says something on its own. Without the
  // reference there is nothing to show at all, so the panels go rather than
  // standing there empty.
  const showGolden = failure !== "no-golden";
  const showComparison = failure === "none";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 bg-black p-6 text-neutral-300">
      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-lg font-medium text-white">The same shader, two renderers</h1>
        <p className="text-sm leading-relaxed">
          The frame on the left was drawn by a computer with no graphics card — vgpu&rsquo;s
          pinned CPU renderer, Mesa 25.0.7. The one in the middle was drawn by yours, from the
          same WGSL, just now. They are bit-identical on the pinned CPU renderer; across
          different GPUs they are not, and the panel on the right is where they disagree.
        </p>
        <p className="text-sm leading-relaxed">
          The third panel sweeps its amplification. At ×255 every pixel that differs at all
          is lit, because one step out of 255 is full brightness at that gain. Watch it turn
          down and almost everything vanishes: on most GPUs every difference is a step or
          two, far below what a screen can show. What survives at low gain is a pixel that
          crossed one of the scene&rsquo;s own edges — a noise cell, or a thickness terrace —
          where a rounding difference stops being one. It is also why a golden-image test can
          run at zero tolerance against the pinned renderer, and could not against a real
          GPU.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {showGolden && <Panel caption="Pinned CPU renderer · Mesa 25.0.7" ref={goldenCanvas} />}
        {showComparison && (
          <>
            <Panel
              caption={`Your GPU${probe ? ` · ${probe.adapterLabel}` : ""}`}
              ref={mineCanvas}
            />
            <Panel caption={`Difference · ×${shownGain}`} ref={diffCanvas} />
          </>
        )}
      </div>

      {failure === "no-webgpu" && (
        <p className="max-w-3xl text-sm leading-relaxed">
          The comparison needs WebGPU, and this browser has none. The frame above is still
          there.
        </p>
      )}
      {failure === "no-golden" && (
        <p className="max-w-3xl text-sm leading-relaxed">
          The reference frame could not be loaded, so there is nothing to compare against and
          no number to report.
        </p>
      )}

      {probe && (
        <div className="flex max-w-3xl flex-col gap-3">
          <p className="text-sm leading-relaxed">
            <span className="text-white">{count.format(probe.comparison.differing)}</span> of{" "}
            {count.format(probe.comparison.total)} pixels differ (
            {probe.comparison.percent.toFixed(2)}%). The largest difference measured on your
            GPU is {probe.comparison.maxDelta} of 255.
          </p>
          <div
            role="group"
            aria-label="Amplification"
            className="flex w-fit gap-1 rounded-md border border-white/10 p-1"
          >
            {([null, ...GAINS] as const).map((g) => (
              <button
                key={g ?? "auto"}
                type="button"
                aria-pressed={g === pinned}
                disabled={deviceLost}
                onClick={() => {
                  setPinned(g);
                  probe.setAmplification(g ?? "auto");
                }}
                className={`rounded px-3 py-1 text-xs tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  g === pinned ? "bg-white text-black" : "text-neutral-400 hover:text-white"
                }`}
              >
                {g === null ? "Auto" : `×${g}`}
              </button>
            ))}
          </div>
          {deviceLost && (
            <p className="text-sm leading-relaxed">
              The GPU device was lost, so the panels are frozen at the last result and the
              amplification control is inert. The measurement above still stands: it was taken
              before the device went away.
            </p>
          )}
        </div>
      )}
    </main>
  );
}

export default Example;

function Panel({
  caption,
  ref,
}: {
  caption: string;
  ref: React.RefObject<HTMLCanvasElement | null>;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="truncate text-xs tracking-wide text-neutral-500 uppercase">
        {caption}
      </figcaption>
      {/* Left to scale smoothly. Nearest-neighbour would drop isolated pixels
          outright when the panel is smaller than 512; averaging keeps a dim
          mark where a single pixel disagreed. */}
      <canvas ref={ref} className="block aspect-square w-full rounded ring-1 ring-white/10" />
    </figure>
  );
}

/**
 * The reference, or null. One retry: the realistic way a same-origin static
 * asset fails is a dropped connection, and a second attempt costs nothing
 * against the alternative of telling the visitor the page is broken.
 */
async function fetchGolden(): Promise<Uint8Array | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(GOLDEN_FILE);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
    } catch {
      // Fall through: a thrown fetch and a bad status get the same second try.
    }
  }
  return null;
}

/** Same trick as renderer.ts: the context hands out the buffer, so this file
 *  needs no `ImageData` global. */
function paint(canvas: HTMLCanvasElement | null, rgba: Uint8Array): void {
  if (!canvas) return;
  const size = Math.sqrt(rgba.length / 4);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(size, size);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
}
