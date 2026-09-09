import { describe, expect, it } from "vitest";
import { compare } from "./compare";

const px = (...bytes: number[]) => Uint8Array.from(bytes);

describe("compare", () => {
  it("reports nothing when the two renders are identical", () => {
    const a = px(10, 20, 30, 255, 40, 50, 60, 255);
    expect(compare(a, a)).toEqual({ total: 2, differing: 0, percent: 0, maxDelta: 0 });
  });

  it("counts a pixel once however many of its channels differ", () => {
    // One pixel, three channels off. It is one differing pixel, not three:
    // the page's number has to mean "pixels you could point at".
    const a = px(10, 20, 30, 255);
    const b = px(11, 22, 33, 255);
    const r = compare(a, b);
    expect(r.differing).toBe(1);
    expect(r.maxDelta).toBe(3);
  });

  it("takes the largest channel difference across the whole image", () => {
    const a = px(0, 0, 0, 255, 0, 0, 0, 255);
    const b = px(1, 0, 0, 255, 0, 0, 9, 255);
    expect(compare(a, b).maxDelta).toBe(9);
  });

  it("gives the percentage against the pixel count, not the byte count", () => {
    const a = new Uint8Array(4 * 4);            // 4 pixels
    const b = new Uint8Array(4 * 4);
    b[0] = 1;
    expect(compare(a, b).percent).toBeCloseTo(25, 6);
  });

  it("refuses buffers of different lengths instead of comparing a prefix", () => {
    // Silently comparing the shorter prefix would report a flattering number
    // for a render at the wrong size.
    expect(() => compare(new Uint8Array(8), new Uint8Array(12))).toThrow(RangeError);
  });
});
