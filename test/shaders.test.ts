import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// `vgpu check` resolves the module graph and validates WGSL without ever
// requesting an adapter, so this runs on every platform. Every test that
// actually renders is Linux-only; on a developer machine this is the only thing
// standing between a typo in a shader and a red CI run.
const CLI = path.join("node_modules", "vgpu", "bin", "vgpu.js");

const shaders = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? shaders(p) : p.endsWith(".wgsl") ? [p] : [];
  });

describe("wgsl validation", () => {
  const files = shaders(path.join("examples", "two-renderers"));

  it("finds shaders to validate", () => {
    // Without this, a broken glob turns the suite into zero tests that pass.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} validates`, () => {
      execFileSync(process.execPath, [CLI, "check", file, "--require-validation"], {
        stdio: "pipe",
      });
    }, 30_000);
  }
});
