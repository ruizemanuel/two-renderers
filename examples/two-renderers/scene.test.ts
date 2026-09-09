import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ effect: vi.fn() }));
vi.mock("vgpu", () => mocks);

import { SCENE_SIZE, createScene } from "./scene";

function fakeEffect() {
  const fx = { draw: vi.fn(() => fx), set: vi.fn(() => fx), destroy: vi.fn() };
  return fx;
}

afterEach(() => vi.resetAllMocks());

describe("scene", () => {
  it("is 512 square, which is what the golden was rendered at", () => {
    expect(SCENE_SIZE).toBe(512);
  });

  it("builds one effect and draws it into whatever target it is handed", () => {
    const fx = fakeEffect();
    mocks.effect.mockReturnValue(fx);
    const gpu = {} as never;
    const target = { size: [512, 512] } as never;

    const scene = createScene(gpu);
    scene.render(target);

    expect(mocks.effect).toHaveBeenCalledTimes(1);
    expect(fx.draw).toHaveBeenCalledWith(target);
  });

  it("reuses the pipeline across renders instead of rebuilding it", () => {
    // Rebuilding per frame would pay a shader compile every time, which on the
    // pinned CPU renderer is seconds, not milliseconds.
    const fx = fakeEffect();
    mocks.effect.mockReturnValue(fx);
    const scene = createScene({} as never);
    scene.render({} as never);
    scene.render({} as never);
    expect(mocks.effect).toHaveBeenCalledTimes(1);
    expect(fx.draw).toHaveBeenCalledTimes(2);
  });

  it("touches no DOM and no clock", () => {
    // The whole example rests on this: the same module runs in a browser, in
    // headless Node and in this test, and none of them agree about globals.
    const source = createScene.toString();
    expect(source).not.toMatch(/document|window|performance|Date\./);
  });
});
