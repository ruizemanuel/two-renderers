import { defineConfig } from "vitest/config";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

export default defineConfig({
  plugins: [wgslVitePlugin()],
  test: {
    // Node by default. The two suites that need a DOM say so with a
    // `@vitest-environment jsdom` docblock, so the cost lands only on them.
    environment: "node",
    // Tests sit next to the code they cover, which is what the gallery does and
    // the only layout where meta.files can publish one. `test/` keeps what is
    // about the project rather than about the example.
    include: ["test/**/*.test.{ts,tsx}", "examples/**/*.test.{ts,tsx}"],
    // Required by @testing-library/react's automatic cleanup().
    globals: true,
  },
  oxc: { jsx: { runtime: "automatic" } },
});
