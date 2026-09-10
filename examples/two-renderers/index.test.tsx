// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Example } from "./index";
import { createProbe } from "./renderer";

// MAX_GAIN comes through unmocked: it is the one constant the page and the
// renderer have to agree on, so a test that invented its own would not be
// testing the page the visitor gets.
vi.mock("./renderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./renderer")>()),
  createProbe: vi.fn(),
}));

/** A reference small enough to be cheap and square enough to paint. */
const reference = () =>
  ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2 * 2 * 4) }) as Response;

/** A probe that has already measured, with a device loss the test controls. */
function fakeProbe(lost: Promise<void>) {
  return {
    comparison: { total: 4, differing: 1, percent: 25, maxDelta: 1 },
    adapterLabel: "test · arch-1",
    lost,
    setAmplification: vi.fn(),
    currentGain: () => 255,
    dispose: vi.fn(),
  };
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("the page", () => {
  it("still explains itself when the comparison cannot run", async () => {
    // Without WebGPU the second and third panels are impossible. The piece must
    // still say something rather than show an Error: on screen.
    vi.stubGlobal("fetch", vi.fn(async () => reference()));
    vi.mocked(createProbe).mockRejectedValue(new Error("no WebGPU in this environment"));

    render(<Example />);

    expect(await screen.findByText(/needs WebGPU/i)).toBeTruthy();
    expect(screen.queryByText(/^Error/)).toBeNull();
  });

  it("gives a dropped connection a second try before giving up", async () => {
    // A same-origin static asset mostly fails by losing the connection, not by
    // being absent. Retrying is cheaper than telling the visitor the page is
    // broken.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(reference());
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(createProbe).mockRejectedValue(new Error("no WebGPU"));

    render(<Example />);

    expect(await screen.findByText(/needs WebGPU/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/reference frame could not be loaded/i)).toBeNull();
  });

  it("says the reference is missing rather than blaming the browser", async () => {
    // The two causes send you to fix different things, so they cannot share one
    // message: WebGPU may be perfectly fine and the asset simply absent.
    // Two 404s, so the retry is exhausted rather than merely unlucky.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 }) as Response));

    render(<Example />);

    expect(await screen.findByText(/reference frame could not be loaded/i)).toBeTruthy();
    expect(screen.queryByText(/needs WebGPU/i)).toBeNull();
    expect(createProbe).not.toHaveBeenCalled();
  });

  it("freezes and says so when the device is lost", async () => {
    // Panels 1 and 2 are 2D bitmaps and survive; only the amplification control
    // needs the device. A button that silently stops working is the one failure
    // the rest of this page takes care to avoid.
    let lose: () => void = () => {};
    const lost = new Promise<void>((resolve) => {
      lose = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async () => reference()));
    vi.mocked(createProbe).mockResolvedValue(fakeProbe(lost));

    render(<Example />);

    const gain = () => screen.getByRole("button", { name: "×64" }) as HTMLButtonElement;
    await screen.findByRole("button", { name: "×64" });
    expect(gain().disabled).toBe(false);

    lose();

    expect(await screen.findByText(/device was lost/i)).toBeTruthy();
    expect(gain().disabled).toBe(true);
    // The measurement stands: it was taken before the device went away. Read
    // through the container, because the count itself sits in its own span.
    expect(screen.getByRole("main").textContent).toContain("1 of 4 pixels differ");
  });

  it("never promises a bound it only measured once", () => {
    // Δmax = 1 is measured on one GPU, not guaranteed by the spec.
    const source = Example.toString();
    expect(source).not.toMatch(/never more than|nunca más de|at most 1\/255/i);
  });
});
