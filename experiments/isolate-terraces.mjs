// Is the fract() in hash() the amplifier, or only the trigger for the terraces?
//
// Applies the same one-ULP nudge to the hash twice: once with the terraces in
// place and once with them switched off. Run from the repository root:
//
//   node experiments/isolate-terraces.mjs
//
// Each render is compared against its own unperturbed baseline, so switching the
// terraces off does not itself register as a difference.
import fs from "node:fs";
import path from "node:path";
import { effect, target } from "vgpu";
import { init } from "vgpu/node";

if (process.platform !== "linux") {
  throw new Error("The pinned software renderer only exists on Linux. Use CI or WSL.");
}

const SIZE = 512;
const SRC = fs.readFileSync(path.join("examples", "two-renderers", "film.wgsl"), "utf8");
const NUDGE = [
  "return fract((q.x + q.y) * q.z);",
  "return fract((q.x + q.y) * q.z * (1.0 + EPS));",
];
const NO_TERRACES = ["const TERRACE_MIX: f32 = 0.55;", "const TERRACE_MIX: f32 = 0.0;"];

const gpu = await init({ adapter: "software" });

async function render(source) {
  const out = target(gpu, { size: [SIZE, SIZE], format: "rgba8unorm" });
  effect(gpu, source).draw(out);
  return await out.read();
}

function stats(a, b) {
  let differing = 0;
  let max = 0;
  let structural = 0;
  for (let i = 0; i < a.length; i += 4) {
    let d = 0;
    for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a[i + k] - b[i + k]));
    if (d > 0) differing++;
    if (d > 4) structural++;
    if (d > max) max = d;
  }
  return { differing, percent: (differing / (a.length / 4)) * 100, max, structural };
}

console.log(`adapter: ${gpu.adapter.name} (${gpu.adapter.type})\n`);
console.log("terraces   differ        %      max   >4 steps");

for (const [label, off] of [["on ", false], ["off", true]]) {
  const base = off ? SRC.replace(...NO_TERRACES) : SRC;
  const nudged = `const EPS: f32 = 1e-7;\n${base.replace(...NUDGE)}`;
  const s = stats(await render(nudged), await render(base));
  console.log(
    `${label}     ${String(s.differing).padStart(6)} ${s.percent.toFixed(2).padStart(7)}% ` +
      `${String(s.max).padStart(6)} ${String(s.structural).padStart(9)}`,
  );
}

gpu.dispose();
