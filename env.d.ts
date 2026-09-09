// Ambient declarations this project needs to type-check.
//
// `next dev` generates next-env.d.ts, which is where Next's own types — the ones
// that declare stylesheet imports — normally come from. That file is generated
// and git-ignored, and it imports route types out of `.next/`, so it cannot just
// be committed. Referencing Next here instead keeps `npm run typecheck` working
// on a checkout that has never run the dev server, which is every CI run.
/// <reference types="next" />
/// <reference types="@vgpu/wgsl/wgsl-types" />
