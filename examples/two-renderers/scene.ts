// The boundary of the example.
//
// It takes a Gpu and a Target and nothing else: no canvas, no DOM, no clock of
// its own. That is the entire reason the same code can run in your browser, in
// headless Node on the pinned CPU renderer, and inside a test — and it is the
// one file worth copying out of here.
import { effect, type Effect, type Gpu, type Target } from "vgpu";
import filmSource from "./film.wgsl";

/** The film shader hardcodes this: it derives uv from @builtin(position). */
export const SCENE_SIZE = 512;

export type Scene = {
  render(target: Target): void;
  destroy(): void;
};

export function createScene(gpu: Gpu): Scene {
  // Built once. On the pinned CPU renderer the first draw pays an LLVM compile
  // measured in hundreds of milliseconds; every later draw is single digits.
  const film: Effect = effect(gpu, filmSource, { label: "film" });

  return {
    render(target) {
      film.draw(target);
    },
    /**
     * Deliberately a no-op. `Effect` exposes only gpu/set/draw/compile — there
     * is nothing to release here, and `gpu.dispose()` frees everything the
     * device owns. The method exists so callers have one shape to follow.
     */
    destroy() {},
  };
}
