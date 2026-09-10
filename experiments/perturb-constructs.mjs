// Which construct in film.wgsl turns a rounding difference into a visible one?
//
// Renders the scene on the pinned CPU renderer with one intermediate value
// nudged by a relative epsilon — a stand-in for "another conforming
// implementation rounded this differently" — and compares against the committed
// golden. Run from the repository root:
//
//   node experiments/perturb-constructs.mjs
//
// The `0.0` row is the control that matters: changing the source text could by
// itself make the compiler emit different code, in which case the numbers would
// measure the recompilation rather than the perturbation. It reports zero.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { effect, target } from "vgpu";
import { init } from "vgpu/node";

if (process.platform !== "linux") {
  throw new Error("The pinned software renderer only exists on Linux. Use CI or WSL.");
}

const SIZE = 512;
const DIR = path.join("examples", "two-renderers");
const SRC = fs.readFileSync(path.join(DIR, "film.wgsl"), "utf8");
const GOLDEN = new Uint8Array(fs.readFileSync(path.join(DIR, "golden@mesa-25.0.7.bin")));
const EPSILONS = ["0.0", "1e-7", "1e-6", "1e-5", "1e-4"];

const VARIANTS = {
  // The control path: cos_t feeds only fringe/pow/mix, nothing discontinuous.
  // Nudged downward, because nudging it up pushes cos_t past 1 and hands
  // pow(1.0 - cos_t, 3.2) a negative base — an artefact of the experiment, not
  // of the scene, which cannot happen for a sqrt of a value at most 1.
  "continuous (cos_t)": [
    "let cos_t = sqrt(max(1.0 - r * r * 0.93, 0.0));",
    "let cos_t = sqrt(max(1.0 - r * r * 0.93, 0.0)) * (1.0 - EPS);",
  ],
  // fract() at the end of the hash: a flip changes a whole value-noise cell.
  "fract (hash)": [
    "return fract((q.x + q.y) * q.z);",
    "return fract((q.x + q.y) * q.z * (1.0 + EPS));",
  ],
  // floor() for the terraces: a flip moves d by TERRACE * TERRACE_MIX = 52.25nm.
  "floor (terraces)": [
    "let stepped = floor(d / TERRACE) * TERRACE + TERRACE * 0.5;",
    "let stepped = floor(d / TERRACE * (1.0 + EPS)) * TERRACE + TERRACE * 0.5;",
  ],
};

/** Same rule the page and the golden test use, plus a count of the big ones. */
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

/** An amplified difference map, because the shape says more than the count. */
function writeMap(file, pixels) {
  const map = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    let d = 0;
    for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(pixels[i + k] - GOLDEN[i + k]));
    const t = Math.min(255, d * 12);
    map[i] = t;
    map[i + 1] = Math.round(((t * t) / 255) * 0.55);
    map[i + 3] = 255;
  }
  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    Buffer.from(map).copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    let c = 0xffffffff;
    for (const b of body) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const gpu = await init({ adapter: "software" });
console.log(`adapter: ${gpu.adapter.name} (${gpu.adapter.type})\n`);
console.log("epsilon   construct             differ        %      max   >4 steps");

for (const eps of EPSILONS) {
  for (const [name, [from, to]] of Object.entries(VARIANTS)) {
    const substituted = SRC.replace(from, to);
    if (substituted === SRC) throw new Error(`no substitution matched for ${name}`);
    const out = target(gpu, { size: [SIZE, SIZE], format: "rgba8unorm" });
    effect(gpu, `const EPS: f32 = ${eps};\n${substituted}`).draw(out);
    const pixels = await out.read();
    const s = stats(pixels, GOLDEN);
    console.log(
      `${eps.padEnd(9)} ${name.padEnd(21)} ${String(s.differing).padStart(6)} ` +
        `${s.percent.toFixed(2).padStart(7)}% ${String(s.max).padStart(6)} ` +
        `${String(s.structural).padStart(9)}`,
    );
    // One ULP is the interesting scale, so that is the map worth looking at.
    if (eps === "1e-7") writeMap(`map-${name.replace(/[^a-z]/gi, "-")}.png`, pixels);
  }
}

gpu.dispose();
