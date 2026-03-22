import type { Axis, HashState } from "./types";
import { DEFAULT_COLOR_MODEL, DEFAULT_DISTANCE_METRIC, DEFAULT_AXIS, DEFAULT_POSITION } from "./defaults";

export interface HashInput {
  palette: string[];
  colorModel: string;
  distanceMetric: string;
  axis: Axis;
  pos: number;
  gamut: boolean;
  autoSort: boolean;
  markers: boolean;
  snapAxis: boolean;
  invertZ: boolean;
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
    ...(s.gamut && { gamut: "1" }),
    ...(!s.autoSort && { sort: "0" }),
    ...(s.markers && { markers: "1" }),
    ...(!s.snapAxis && { snap: "0" }),
    ...(s.invertZ && { invertZ: "1" }),
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
    colorModel: params.get("model") || DEFAULT_COLOR_MODEL,
    distanceMetric: params.get("metric") || DEFAULT_DISTANCE_METRIC,
    axis: (axis === "x" || axis === "y" || axis === "z" ? axis : DEFAULT_AXIS) as Axis,
    pos: parseFloat(params.get("pos") ?? String(DEFAULT_POSITION)),
    gamut: params.get("gamut") === "1",
    autoSort: params.get("sort") !== "0",
    markers: params.get("markers") === "1",
    snapAxis: params.get("snap") !== "0",
    invertZ: params.get("invertZ") === "1",
  };
}
