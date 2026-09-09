export const meta = {
  slug: "two-renderers",
  title: "Two Renderers",
  description:
    "One WGSL scene drawn twice: by vgpu's pinned CPU renderer, which needs no graphics card, and by yours. A soap film's interference colours come out bit-identical on the pinned renderer and a few pixels apart on any real GPU — amplify the third panel to find them.",
  tags: ["headless", "testing", "rendering", "shader"],
  capabilities: [
    "webgpu",
    "fragment-shader",
    "headless-node",
    "software-renderer",
    "golden-image-test",
    "controls",
    "render-targets",
  ],
  // Two entries here break with the rest of the gallery on purpose.
  // `render-thumbnail.ts` and `golden.test.ts` are exactly what every other
  // example keeps unpublished, and they are what this example is for.
  files: [
    "index.tsx",
    "renderer.ts",
    "scene.ts",
    "compare.ts",
    "golden.ts",
    "render-thumbnail.ts",
    "golden.test.ts",
    "film.wgsl",
    "diff.wgsl",
  ],
} as const;
