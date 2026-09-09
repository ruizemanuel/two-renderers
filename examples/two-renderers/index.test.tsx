// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Example } from "./index";
import { createProbe } from "./renderer";

vi.mock("./renderer", () => ({ createProbe: vi.fn() }));

/** A reference small enough to be cheap and square enough to paint. */
const reference = () =>
  ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2 * 2 * 4) }) as Response;

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

  it("never promises a bound it only measured once", () => {
    // Δmax = 1 is measured on one GPU, not guaranteed by the spec.
    const source = Example.toString();
    expect(source).not.toMatch(/never more than|nunca más de|at most 1\/255/i);
  });
});
