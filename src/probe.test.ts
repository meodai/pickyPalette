// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProbeManager } from "./probe";

describe("probe manager", () => {
  let rafQueue: FrameRequestCallback[];
  let nextRafId: number;
  let cancelSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = "";
    rafQueue = [];
    nextRafId = 1;
    cancelSpy = vi.fn();
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        rafQueue.push(cb);
        return nextRafId++;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", cancelSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function flushNextFrame(): void {
    const callback = rafQueue.shift();
    if (callback) callback(0);
  }

  it("stores the latest event and renders probe content on the next frame", () => {
    const manager = createProbeManager();
    const event = new PointerEvent("pointermove", { clientX: 12, clientY: 24 });

    manager.setEvent(event, () => ({
      hex: "#abcdef",
      hint: "Click to add",
      x: 20,
      y: 30,
    }));

    expect(manager.getEvent()).toBe(event);
    expect(
      document.querySelector(".cursor-probe")?.classList.contains("is-visible"),
    ).toBe(false);

    flushNextFrame();

    const probe = document.querySelector<HTMLElement>(".cursor-probe");
    expect(probe?.classList.contains("is-visible")).toBe(true);
    expect(probe?.style.left).toBe("20px");
    expect(probe?.style.top).toBe("30px");
    expect(document.querySelector(".cursor-probe__label")?.textContent).toBe(
      "#abcdef",
    );
    expect(document.querySelector(".cursor-probe__hint")?.textContent).toBe(
      "Click to add",
    );
  });

  it("does not schedule a second frame while one is already pending", () => {
    const manager = createProbeManager();
    const render = vi.fn(() => ({
      hex: "#111111",
      hint: "Hint",
      x: 1,
      y: 2,
    }));

    manager.setEvent(
      new PointerEvent("pointermove", { clientX: 1, clientY: 2 }),
      render,
    );
    manager.setEvent(
      new PointerEvent("pointermove", { clientX: 3, clientY: 4 }),
      render,
    );

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    flushNextFrame();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("requestRender rerenders when an event exists and no frame is pending", () => {
    const manager = createProbeManager();
    const firstRender = vi.fn(() => ({
      hex: "#111111",
      hint: "First",
      x: 1,
      y: 2,
    }));
    const secondRender = vi.fn(() => ({
      hex: "#222222",
      hint: "Second",
      x: 3,
      y: 4,
    }));

    manager.setEvent(
      new PointerEvent("pointermove", { clientX: 10, clientY: 20 }),
      firstRender,
    );
    flushNextFrame();

    manager.requestRender(secondRender);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

    flushNextFrame();

    expect(secondRender).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".cursor-probe__label")?.textContent).toBe(
      "#222222",
    );
  });

  it("clears pending frames, hides the probe, and forgets the event", () => {
    const onHide = vi.fn();
    const manager = createProbeManager({ onHide });
    manager.setEvent(
      new PointerEvent("pointermove", { clientX: 10, clientY: 20 }),
      () => ({
        hex: "#123456",
        hint: "Hint",
        x: 3,
        y: 4,
      }),
    );

    manager.clear();

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(manager.getEvent()).toBeNull();
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector(".cursor-probe")?.classList.contains("is-visible"),
    ).toBe(false);
  });

  it("hides the probe when the render callback returns null", () => {
    const onHide = vi.fn();
    const manager = createProbeManager({ onHide });

    manager.setEvent(
      new PointerEvent("pointermove", { clientX: 10, clientY: 20 }),
      () => null,
    );

    flushNextFrame();

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector(".cursor-probe")?.classList.contains("is-visible"),
    ).toBe(false);
  });
});
