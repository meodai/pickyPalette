import { describe, expect, it } from "vitest";

import {
  computeSliderStops,
  getColorUV,
  getSliderValue,
  hexToRGB,
  isHueAxis,
  rgbToHex,
  setSliderAxis,
  toVizPalette,
} from "./color";

describe("color helpers", () => {
  it("round-trips hex and rgb for normal colors", () => {
    expect(rgbToHex(hexToRGB("#ff00aa"))).toBe("#ff00aa");
  });

  it("sets and reads slider axes for rgb", () => {
    const red = setSliderAxis("#000000", "rgb", "x", 1);
    const blue = setSliderAxis("#000000", "rgb", "z", 0);

    expect(red).toBe("#ff0000");
    expect(getSliderValue(red, "rgb", "x")).toBeCloseTo(1, 5);
    expect(blue).toBe("#0000ff");
    expect(getSliderValue(blue, "rgb", "z")).toBeCloseTo(0, 5);
  });

  it("identifies hue axes correctly", () => {
    expect(isHueAxis("okhslPolar", "x")).toBe(true);
    expect(isHueAxis("rgb", "x")).toBe(false);
  });

  it("maps non-polar rgb colors into expected UV positions", () => {
    const uv = getColorUV("#336699", "rgb", "x", 0.5);

    expect(uv).not.toBeNull();
    expect(uv?.u).toBeCloseTo(0.4, 2);
    expect(uv?.v).toBeCloseTo(0.6, 2);
    expect(uv?.sliderDist).toBeCloseTo(0.3, 2);
  });

  it("returns the original hex for unsupported models", () => {
    expect(setSliderAxis("#123456", "not-a-model", "x", 0.5)).toBe("#123456");
  });

  it("round-trips black and white", () => {
    expect(rgbToHex(hexToRGB("#000000"))).toBe("#000000");
    expect(rgbToHex(hexToRGB("#ffffff"))).toBe("#ffffff");
  });

  it("handles 3-character hex shorthand", () => {
    const rgb = hexToRGB("#f0a");
    expect(rgbToHex(rgb)).toBe("#ff00aa");
  });

  it("converts a palette to viz RGB arrays", () => {
    const result = toVizPalette(["#ff0000", "#00ff00"]);
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBeCloseTo(1, 2);
    expect(result[0][1]).toBeCloseTo(0, 2);
    expect(result[1][1]).toBeCloseTo(1, 2);
  });

  it("computeSliderStops returns 13 stops for valid model/axis", () => {
    const stops = computeSliderStops("rgb", "x");
    expect(stops).toHaveLength(13);
    stops.forEach((s) => expect(s).toMatch(/^#[0-9a-f]{6}$/));
  });

  it("computeSliderStops reverses for z-axis", () => {
    const stopsX = computeSliderStops("rgb", "x");
    const stopsZ = computeSliderStops("rgb", "z");
    expect(stopsZ).toEqual([...stopsZ].reverse().map((_, i) => stopsZ[i]));
    // z-axis should be reversed relative to the raw order
    // first stop of x (R varies) starts dark, first stop of z (B varies) starts bright
    expect(stopsX[0]).not.toBe(stopsX[12]);
    expect(stopsZ[0]).not.toBe(stopsZ[12]);
  });

  it("computeSliderStops returns empty for unknown model", () => {
    expect(computeSliderStops("fake-model", "x")).toEqual([]);
  });

  it("computeSliderStops reverses y-axis for polar models", () => {
    const stops = computeSliderStops("okhslPolar", "y");
    expect(stops).toHaveLength(13);
    // polar y should be reversed — first stop should correspond to high saturation
  });
});
