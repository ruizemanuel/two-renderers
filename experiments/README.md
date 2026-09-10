# Experiments

Not part of the example. These are the measurements behind the claim the example
makes about *why* two renderers disagree, kept so the numbers can be reproduced
rather than believed.

Linux only: they render on the pinned CPU renderer, which is the fixed point
everything else is measured against.

```bash
node experiments/perturb-constructs.mjs
node experiments/isolate-terraces.mjs
```

## What they found

A visitor on an Apple GPU reported **5,873 of 262,144 pixels differing (2.24%),
largest difference 44 of 255**, against **9,179 (3.50%) with a largest difference
of 1** on an AMD GCN4. Fewer differing pixels and a far larger maximum is the
signature of a discontinuity, not of worse arithmetic.

`perturb-constructs.mjs` nudges one intermediate value by a relative epsilon and
compares against the golden. The continuous path holds at a largest difference of
**1 across four orders of magnitude** of perturbation — the count grows, the
maximum never moves, which is what a continuous function quantised to 8 bits
does. One ULP through the `fract()` in the hash gives **49**.

`isolate-terraces.mjs` then splits the cause. The same one-ULP nudge to the hash
gives a largest difference of **49 with the terraces in place and 7 without
them**. So `fract()` is the trigger and `floor()` is the amplifier: a flipped
hash changes a whole value-noise cell, that moves the film thickness by a few
nanometres, and wherever the moved thickness crosses a terrace boundary the pixel
jumps 52.25 nm at once — about 23% of an interference cycle.

Fewer pixels differ with the terraces on, because quantising the thickness hides
the small changes and concentrates the error into the jumps.
