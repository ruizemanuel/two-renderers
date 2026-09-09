/** What the page says out loud after rendering the same shader twice. */
export type Comparison = {
  /** Pixels compared. */
  readonly total: number;
  /** Pixels where any of the four channels differ. */
  readonly differing: number;
  /** `differing / total * 100`. */
  readonly percent: number;
  /** Largest absolute channel difference anywhere, 0..255. */
  readonly maxDelta: number;
};

/**
 * Compares two RGBA8 buffers pixel by pixel.
 *
 * A pixel counts as differing if any of its four channels differ — the same
 * rule a golden-image test uses, so the number on the page and the number a
 * test would produce mean the same thing.
 */
export function compare(a: Uint8Array, b: Uint8Array): Comparison {
  if (a.length !== b.length) {
    throw new RangeError(`compare: buffers differ in length, ${a.length} vs ${b.length}`);
  }
  let differing = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.length; i += 4) {
    let delta = 0;
    for (let k = 0; k < 4; k++) {
      const d = Math.abs(a[i + k] - b[i + k]);
      if (d > delta) delta = d;
    }
    if (delta > 0) differing++;
    if (delta > maxDelta) maxDelta = delta;
  }
  const total = a.length / 4;
  return { total, differing, percent: total === 0 ? 0 : (differing / total) * 100, maxDelta };
}
