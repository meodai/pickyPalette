import { describe, expect, it } from "vitest";

import { decodeHash, encodeHash } from "./hash";

describe("hash", () => {
  it("round-trips a populated state", () => {
    const encoded = encodeHash({
      palette: ["#112233", "#abcdef"],
      colorModel: "okhslPolar",
      distanceMetric: "deltaE2000",
      axis: "z",
      pos: 0.3751,
      gamut: true,
      autoSort: false,
      markers: true,
      snapAxis: false,
      invertZ: true,
    });

    const decoded = decodeHash(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded?.colors).toEqual(["#112233", "#abcdef"]);
    expect(decoded?.colorModel).toBe("okhslPolar");
    expect(decoded?.distanceMetric).toBe("deltaE2000");
    expect(decoded?.axis).toBe("z");
    expect(decoded?.pos).toBeCloseTo(0.3751, 4);
    expect(decoded?.gamut).toBe(true);
    expect(decoded?.autoSort).toBe(false);
    expect(decoded?.markers).toBe(true);
    expect(decoded?.snapAxis).toBe(false);
    expect(decoded?.invertZ).toBe(true);
  });

  it("filters invalid colors and falls back for invalid axis", () => {
    const decoded = decodeHash(
      "#colors/ff0000-not-a-color-00ff00?axis=nope&model=rgb&metric=rgb&pos=0.25",
    );

    expect(decoded).not.toBeNull();
    expect(decoded?.colors).toEqual(["#ff0000", "#00ff00"]);
    expect(decoded?.axis).toBe("y");
    expect(decoded?.pos).toBe(0.25);
  });

  it("encodes and decodes empty palettes", () => {
    const encoded = encodeHash({
      palette: [],
      colorModel: "rgb",
      distanceMetric: "oklab",
      axis: "x",
      pos: 0.5,
      gamut: false,
      autoSort: true,
      markers: false,
      snapAxis: true,
      invertZ: false,
    });

    expect(encoded.startsWith("#?")).toBe(true);

    const decoded = decodeHash(encoded);
    expect(decoded?.colors).toEqual([]);
    expect(decoded?.colorModel).toBe("rgb");
    expect(decoded?.axis).toBe("x");
  });

  it("returns null for unsupported hash formats", () => {
    expect(decodeHash("#totally-different")).toBeNull();
  });
});
