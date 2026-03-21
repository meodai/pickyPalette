// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { createInteractionGeometry } from "./interaction-geometry";
import type { MarkerInfo } from "./viz";

describe("interaction geometry", () => {
  let canvasWrap: HTMLDivElement;
  let showMarkers: boolean;
  let markers: MarkerInfo[];

  beforeEach(() => {
    document.body.innerHTML = "";
    canvasWrap = document.createElement("div");
    document.body.appendChild(canvasWrap);
    showMarkers = true;
    markers = [];
    canvasWrap.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        width: 200,
        height: 100,
        right: 210,
        bottom: 120,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;
  });

  it("normalizes pointer coordinates into UV space", () => {
    const geometry = createInteractionGeometry({
      canvasWrap,
      getShowMarkers: () => showMarkers,
      getMarkers: () => markers,
    });

    expect(geometry.getUV({ clientX: 110, clientY: 70 })).toEqual({
      u: 0.5,
      v: 0.5,
      inBounds: true,
    });
  });

  it("reports out-of-bounds coordinates", () => {
    const geometry = createInteractionGeometry({
      canvasWrap,
      getShowMarkers: () => showMarkers,
      getMarkers: () => markers,
    });

    const uv = geometry.getUV({ clientX: 5, clientY: 130 });

    expect(uv.u).toBeLessThan(0);
    expect(uv.v).toBeLessThan(0);
    expect(uv.inBounds).toBe(false);
  });

  it("uses refreshed canvas rects for subsequent calculations", () => {
    const geometry = createInteractionGeometry({
      canvasWrap,
      getShowMarkers: () => showMarkers,
      getMarkers: () => markers,
    });

    canvasWrap.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 400,
        right: 400,
        bottom: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    geometry.refreshRect();

    expect(geometry.getUV({ clientX: 200, clientY: 200 })).toEqual({
      u: 0.5,
      v: 0.5,
      inBounds: true,
    });
  });

  it("hit-tests markers with padding", () => {
    markers = [
      {
        hex: "#ff0000",
        paletteIndex: 3,
        px: 0,
        py: 0,
        cssX: 40,
        cssY: 30,
        radius: 5,
      },
    ];

    const geometry = createInteractionGeometry({
      canvasWrap,
      getShowMarkers: () => showMarkers,
      getMarkers: () => markers,
    });

    expect(geometry.hitTestMarker(58, 50)?.paletteIndex).toBe(3);
    expect(geometry.hitTestMarker(70, 50)).toBeNull();
  });

  it("returns null when markers are hidden", () => {
    markers = [
      {
        hex: "#ff0000",
        paletteIndex: 1,
        px: 0,
        py: 0,
        cssX: 20,
        cssY: 20,
        radius: 6,
      },
    ];
    showMarkers = false;

    const geometry = createInteractionGeometry({
      canvasWrap,
      getShowMarkers: () => showMarkers,
      getMarkers: () => markers,
    });

    expect(geometry.hitTestMarker(30, 40)).toBeNull();
  });
});
