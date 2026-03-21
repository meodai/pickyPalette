import { describe, expect, it } from "vitest";

import {
  getColorUV,
  getSliderValue,
  hexToRGB,
  isHueAxis,
  rgbToHex,
  setSliderAxis,
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
});
