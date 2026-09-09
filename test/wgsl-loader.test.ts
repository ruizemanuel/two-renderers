import { describe, expect, it } from "vitest";
import probe from "../examples/two-renderers/probe.wgsl";

describe("wgsl loader", () => {
  it("hands a resolved shader module to TypeScript, not raw bytes", () => {
    // The loader has to resolve the module graph, not just read the file: a raw
    // text loader would hand over a string and any `import` inside the shader
    // would survive into the source vgpu compiles. `functionExports` exists
    // only because the module was parsed, so it is the part worth asserting.
    expect(probe.version).toBe(1);
    expect(typeof probe.wgsl).toBe("string");
    expect(probe.wgsl).toContain("fs_main");
    expect(probe.functionExports).toEqual([]);
  });
});
