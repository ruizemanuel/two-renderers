import fs from "node:fs";
import path from "node:path";
import { target } from "vgpu";
import { init } from "vgpu/node";
import { GOLDEN_FILE, MESA } from "../examples/two-renderers/golden";
import { SCENE_SIZE, createScene } from "../examples/two-renderers/scene";

if (process.platform !== "linux") {
  throw new Error("The pinned software renderer only exists on Linux. Use CI or WSL.");
}

const gpu = await init({ adapter: "software" });
if (gpu.adapter.type !== "cpu" || !gpu.adapter.name.includes(`Mesa ${MESA}`)) {
  const seen = `${gpu.adapter.name} (${gpu.adapter.type})`;
  gpu.dispose();
  throw new Error(
    `Refusing to write a golden from "${seen}". ` +
      `It must be the pinned CPU renderer, Mesa ${MESA}.`,
  );
}

const adapterName = gpu.adapter.name;
const out = target(gpu, { size: [SCENE_SIZE, SCENE_SIZE], format: "rgba8unorm" });
createScene(gpu).render(out);
const pixels = await out.read();
gpu.dispose();

const file = path.join("examples", "two-renderers", GOLDEN_FILE);
fs.writeFileSync(file, Buffer.from(pixels));
console.log(`wrote ${file}, ${pixels.length} bytes, from ${adapterName}`);
