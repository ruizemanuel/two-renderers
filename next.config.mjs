/** @type {import("next").NextConfig} */
export default {
  // Turbopack is the default bundler; the webpack block is the fallback for any
  // path that still reaches webpack, which would otherwise have no .wgsl loader.
  turbopack: {
    rules: { "*.wgsl": { loaders: ["@vgpu/wgsl/loader-webpack"], as: "*.js" } },
  },
  webpack(config) {
    config.module.rules.push({ test: /\.wgsl$/, use: "@vgpu/wgsl/loader-webpack" });
    return config;
  },
};
