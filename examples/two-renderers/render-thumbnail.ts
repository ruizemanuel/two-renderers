import type { Gpu, Target } from "vgpu";
import { createScene } from "./scene";

/**
 * The gallery's thumbnail hook. There is no clock or input to park before
 * capturing: the scene takes neither, so two calls on one renderer draw the
 * same frame.
 */
export async function renderThumbnail(gpu: Gpu, output: Target): Promise<void> {
  const scene = createScene(gpu);
  try {
    scene.render(output);
  } finally {
    // Both, the way the gallery's own thumbnails do it: the queue promise
    // covers submitted GPU work, `settled()` covers the work vgpu is still
    // holding, and a thumbnail captured before either is a blank frame.
    await Promise.allSettled([
      Promise.resolve().then(() => gpu.gpu.queue.onSubmittedWorkDone()),
      Promise.resolve().then(() => gpu.settled()),
    ]);
    scene.destroy();
  }
}
