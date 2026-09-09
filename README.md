# Two renderers

One WGSL scene, drawn twice: once by vgpu's pinned CPU renderer — a computer
with no graphics card — and once by yours. The third panel is where they
disagree.

## The one sentence allowed about the renderer

This example never says "deterministic" flatly, because between different GPUs
it is not. The permitted phrasing is:

> **"bit-identical on the pinned CPU renderer"**

Two renders from the pinned renderer are the same bytes. The same shader on a
real GPU is a few percent of pixels away, each of them by a step or so. The page
measures that live, on your machine, and shows what it measured — it does not
promise a bound, because there isn't one in the specification.

## What is worth copying out of here

`scene.ts`. It takes a `Gpu` and a `Target` and nothing else — no canvas, no
DOM, no clock of its own — which is the whole reason the same module runs in the
browser, in headless Node, and inside a test. Everything else follows from that
one boundary.

## Running it

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

The pure tests run anywhere. The suites that need the pinned CPU renderer
(`describe.skipIf(!SOFTWARE)`) only run on Linux: on Windows the full suite is a
**PASS with tests skipped and zero failed**. A single `failed` is a regression; a
`skipped` on Windows is not.

CI runs the whole suite on `ubuntu-latest`, which is the point: that is where the
golden test runs instead of skipping. A golden test that only runs when someone
remembers to open a Linux box is a note to self, not a test.

## Regenerating the golden

Linux only, and only on the pinned renderer:

```bash
npx vgpu install-software-renderer
node scripts/make-golden.mjs
```

The file carries the Mesa version in its name. If vgpu changes renderers the
test fails on a missing file rather than on a pixel difference, which is a much
easier failure to read. Look at the image before committing it.

The page fetches the golden from `public/`, which `predev` and `prebuild` copy
from the example directory. The copy is generated, never committed: two
committed copies drift, and the stale one is the one that gets served.

## Where this departs from the rest of the gallery

`meta.files` publishes `render-thumbnail.ts` and `golden.test.ts`. Every other
example keeps both unpublished, so a visitor never sees the headless path or a
test — which is precisely the gap this example exists to fill. The ordinary
`vi.mock("vgpu")` unit tests stay unpublished, because they add volume rather
than argument.
