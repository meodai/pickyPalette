import { converter, type Color } from "culori";
import type { RGB, Axis } from "./types";
import { AXES } from "./types";

const toSRGB = converter("rgb");

export function hexToRGB(hex: string): RGB {
  const c = toSRGB(hex);
  if (!c) return [0, 0, 0];
  return [c.r, c.g, c.b];
}

const toHexByte = (v: number): string =>
  Math.min(255, Math.max(0, Math.round(v * 255)))
    .toString(16)
    .padStart(2, "0");

export function rgbToHex(rgb: RGB): string {
  return `#${toHexByte(rgb[0])}${toHexByte(rgb[1])}${toHexByte(rgb[2])}`;
}

export function toVizPalette(p: string[]): RGB[] {
  return p.map(hexToRGB);
}

export const AXIS_NAMES: Record<string, [string, string, string]> = {
  rgb: ["R", "G", "B"],
  rgb6bit: ["R", "G", "B"],
  rgb8bit: ["R", "G", "B"],
  rgb12bit: ["R", "G", "B"],
  rgb15bit: ["R", "G", "B"],
  rgb18bit: ["R", "G", "B"],
  oklab: ["a", "b", "L"],
  okhsv: ["H", "S", "V"],
  okhsvPolar: ["H", "S", "V"],
  okhsl: ["H", "S", "L"],
  okhslPolar: ["H", "S", "L"],
  oklch: ["H", "C", "L"],
  oklchPolar: ["H", "C", "L"],
  oklrab: ["a", "b", "Lr"],
  oklrch: ["H", "C", "Lr"],
  oklrchPolar: ["H", "C", "Lr"],
  oklchDiag: ["H", "C\u2194", "L"],
  oklrchDiag: ["H", "C\u2194", "Lr"],
  hsv: ["H", "S", "V"],
  hsvPolar: ["H", "S", "V"],
  hsl: ["H", "S", "L"],
  hslPolar: ["H", "S", "L"],
  hwb: ["H", "W", "B"],
  hwbPolar: ["H", "W", "B"],
  cielab: ["a*", "b*", "L*"],
  cielch: ["H", "C", "L*"],
  cielchPolar: ["H", "C", "L*"],
  cielabD50: ["a*", "b*", "L*"],
  cielchD50: ["H", "C", "L*"],
  cielchD50Polar: ["H", "C", "L*"],
  cam16ucsD65: ["a'", "b'", "J'"],
  cam16ucsD65Polar: ["H", "M'", "J'"],
  spectrum: ["\u03BB", "L", "C"],
};

const SLIDER_CULORI_MODE: Record<string, string> = {
  okhsl: "okhsl",
  okhslPolar: "okhsl",
  okhsv: "okhsv",
  okhsvPolar: "okhsv",
  oklch: "oklch",
  oklchPolar: "oklch",
  oklchDiag: "oklch",
  oklrab: "oklch",
  oklrch: "oklch",
  oklrchPolar: "oklch",
  oklrchDiag: "oklch",
  oklab: "oklab",
  hsl: "hsl",
  hslPolar: "hsl",
  hsv: "hsv",
  hsvPolar: "hsv",
  hwb: "hwb",
  hwbPolar: "hwb",
  rgb: "rgb",
  rgb6bit: "rgb",
  rgb8bit: "rgb",
  rgb12bit: "rgb",
  rgb15bit: "rgb",
  rgb18bit: "rgb",
  cielab: "lab65",
  cielch: "lch65",
  cielchPolar: "lch65",
  cielabD50: "lab",
  cielchD50: "lch",
  cielchD50Polar: "lch",
};

const SLIDER_COMPONENTS: Record<string, string[]> = {
  okhsl: ["h", "s", "l"],
  okhsv: ["h", "s", "v"],
  oklch: ["h", "c", "l"],
  oklab: ["a", "b", "l"],
  hsl: ["h", "s", "l"],
  hsv: ["h", "s", "v"],
  hwb: ["h", "w", "b"],
  rgb: ["r", "g", "b"],
  lab65: ["a", "b", "l"],
  lch65: ["h", "c", "l"],
  lab: ["a", "b", "l"],
  lch: ["h", "c", "l"],
};

const SLIDER_RANGES: Record<string, Record<string, [number, number]>> = {
  okhsl: { h: [0, 360], s: [0, 1], l: [0, 1] },
  okhsv: { h: [0, 360], s: [0, 1], v: [0, 1] },
  oklch: { h: [0, 360], c: [0, 0.4], l: [0, 1] },
  oklab: { l: [0, 1], a: [-0.4, 0.4], b: [-0.4, 0.4] },
  hsl: { h: [0, 360], s: [0, 1], l: [0, 1] },
  hsv: { h: [0, 360], s: [0, 1], v: [0, 1] },
  hwb: { h: [0, 360], w: [0, 1], b: [0, 1] },
  rgb: { r: [0, 1], g: [0, 1], b: [0, 1] },
  lab65: { l: [0, 100], a: [-128, 128], b: [-128, 128] },
  lch65: { h: [0, 360], c: [0, 150], l: [0, 100] },
  lab: { l: [0, 100], a: [-128, 128], b: [-128, 128] },
  lch: { h: [0, 360], c: [0, 150], l: [0, 100] },
};

const SLIDER_CENTERS: Record<string, Record<string, number>> = {
  okhsl: { h: 10, s: 0.5, l: 0.5 },
  okhsv: { h: 10, s: 0.5, v: 0.5 },
  oklch: { h: 25, c: 0.15, l: 0.5 },
  oklab: { l: 0.5, a: 0.1, b: 0.05 },
  hsl: { h: 10, s: 0.5, l: 0.5 },
  hsv: { h: 10, s: 0.5, v: 0.5 },
  hwb: { h: 10, w: 0.25, b: 0.25 },
  rgb: { r: 0.5, g: 0.5, b: 0.5 },
  lab65: { l: 50, a: 40, b: 20 },
  lch65: { h: 30, c: 50, l: 50 },
  lab: { l: 50, a: 40, b: 20 },
  lch: { h: 30, c: 50, l: 50 },
};

export function computeSliderStops(colorModel: string, axis: Axis): string[] {
  const culoriMode = SLIDER_CULORI_MODE[colorModel];
  if (!culoriMode) return [];

  const comps = SLIDER_COMPONENTS[culoriMode];
  const ranges = SLIDER_RANGES[culoriMode];
  const centers = SLIDER_CENTERS[culoriMode];
  if (!comps || !ranges || !centers) return [];

  const axisIdx = AXES.indexOf(axis);
  const varyComp = comps[axisIdx];
  const range = ranges[varyComp];
  if (!range) return [];
  const [min, max] = range;

  const STEPS = 12;
  const stops: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const val = min + t * (max - min);
    const color: Record<string, number | string> = { mode: culoriMode };
    comps.forEach((c) => {
      color[c] = c === varyComp ? val : centers[c];
    });
    const rgb = toSRGB(color as unknown as Color);
    if (!rgb) {
      stops.push("#000000");
      continue;
    }
    const r = rgb.r ?? 0,
      g = rgb.g ?? 0,
      b = rgb.b ?? 0;
    stops.push(
      rgbToHex([
        Math.max(0, Math.min(1, isNaN(r) ? 0 : r)),
        Math.max(0, Math.min(1, isNaN(g) ? 0 : g)),
        Math.max(0, Math.min(1, isNaN(b) ? 0 : b)),
      ]),
    );
  }

  // Shader inverts z-axis: colorCoords.z = 1 - progress
  if (axis === "z") stops.reverse();
  return stops;
}

export function isHueAxis(colorModel: string, axis: Axis): boolean {
  const names = AXIS_NAMES[colorModel] || ["X", "Y", "Z"];
  const axisIdx = AXES.indexOf(axis);
  return names[axisIdx] === "H";
}
