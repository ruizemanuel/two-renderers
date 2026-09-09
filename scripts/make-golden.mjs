// Writes the reference frame. Linux only, and only on the pinned CPU renderer.
//
// Run it with:  node scripts/make-golden.mjs
import { build } from "esbuild";
import { transformWgsl } from "@vgpu/wgsl/loader-vite";
import fs from "node:fs/promises";
import path from "node:path";

const wgsl = {
  name: "wgsl",
  setup(b) {
    b.onLoad({ filter: /\.wgsl$/ }, async (args) => {
      const { code } = await transformWgsl(await fs.readFile(args.path, "utf8"), args.path);
      return { contents: code, loader: "js" };
    });
  },
};

const entry = path.join("scripts", "make-golden-entry.ts");
await build({
  entryPoints: [entry],
  outfile: "dist/make-golden.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: ["vgpu", "vgpu/node", "@vgpu/*", "webgpu"],
  plugins: [wgsl],
});

await import(path.resolve("dist/make-golden.mjs"));
