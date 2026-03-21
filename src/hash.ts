import type { Axis, HashState } from "./types";

export interface HashInput {
  palette: string[];
  colorModel: string;
  distanceMetric: string;
  axis: Axis;
  pos: number;
  outline: boolean;
  reveal: boolean;
  gamut: boolean;
  autoSort: boolean;
  markers: boolean;
}

export function encodeHash(s: HashInput): string {
  const colorStr =
    s.palette.length > 0
      ? s.palette.map((c) => c.replace("#", "")).join("-")
      : "";
  const params = new URLSearchParams({
    model: s.colorModel,
    metric: s.distanceMetric,
    axis: s.axis,
    pos: s.pos.toFixed(4),
    ...(s.outline && { outline: "1" }),
    ...(!s.reveal && { reveal: "0" }),
    ...(s.gamut && { gamut: "1" }),
    ...(!s.autoSort && { sort: "0" }),
    ...(s.markers && { markers: "1" }),
  });
  return colorStr ? `#colors/${colorStr}?${params}` : `#?${params}`;
}

export function decodeHash(hash: string): HashState | null {
  if (!hash || hash === "#") return null;
  let colorPart = "",
    queryPart = "";
  if (hash.startsWith("#colors/")) {
    const rest = hash.slice("#colors/".length);
    const qIdx = rest.indexOf("?");
    if (qIdx >= 0) {
      colorPart = rest.slice(0, qIdx);
      queryPart = rest.slice(qIdx + 1);
    } else {
      colorPart = rest;
    }
  } else if (hash.startsWith("#?")) {
    queryPart = hash.slice(2);
  } else {
    return null;
  }
  const colors = colorPart
    ? colorPart
        .split("-")
        .map((h) => `#${h}`)
        .filter((c) => /^#([0-9a-f]{3}){1,2}$/i.test(c))
    : [];
  const params = new URLSearchParams(queryPart || "");
  const axis = params.get("axis") || "y";
  return {
    colors,
    colorModel: params.get("model") || "okhsl",
    distanceMetric: params.get("metric") || "oklab",
    axis: (axis === "x" || axis === "y" || axis === "z" ? axis : "y") as Axis,
    pos: parseFloat(params.get("pos") ?? "0.5"),
    outline: params.get("outline") === "1",
    reveal: params.get("reveal") !== "0",
    gamut: params.get("gamut") === "1",
    autoSort: params.get("sort") !== "0",
    markers: params.get("markers") === "1",
  };
}
