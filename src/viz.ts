import { PaletteViz } from "palette-shader";
import { wcagContrast } from "culori";
import type { RGB, Axis } from "./types";
import { hexToRGB, getColorUV } from "./color";

const DUMMY_PALETTE: RGB[] = [[0.5, 0.5, 0.5]];

export interface MarkerInfo {
  hex: string;
  paletteIndex: number;
  /** Canvas pixel X (top-left origin) */
  px: number;
  /** Canvas pixel Y (top-left origin) */
  py: number;
  /** CSS pixel X relative to canvas-wrap */
  cssX: number;
  /** CSS pixel Y relative to canvas-wrap */
  cssY: number;
  radius: number;
}

export interface VizManager {
  readonly vizRaw: PaletteViz;
  vizClosest: PaletteViz | null;
  readonly maskCanvas: HTMLCanvasElement;

  syncPalette(vizPalette: RGB[]): void;
  ensureVizClosest(vizPalette: RGB[]): PaletteViz | null;
  updateView(pickMode: boolean, hasColors: boolean): void;

  compositeMask(
    hex: string,
    matchSource: "raw" | "closest",
    otherSource: "raw" | "closest",
  ): void;
  showMask(): void;
  hideMask(): void;

  highlightRegion(hex: string): void;
  hideHighlight(): void;

  drawMarkers(
    palette: string[],
    hoveredIndex?: number,
    skipIndex?: number,
  ): void;
  setMarkersVisible(visible: boolean): void;
  getMarkers(): MarkerInfo[];

  setAxis(axis: Axis): void;
  setPosition(pos: number): void;
  setColorModel(model: string): void;
  setDistanceMetric(metric: string): void;
  setOutlineWidth(w: number): void;
  setGamutClip(clip: boolean): void;
  setInvertZ(invert: boolean): void;
  setColor(rgb: RGB, index: number): void;

  getRawColorAtUV(u: number, v: number): RGB;
  getClosestColorAtUV(u: number, v: number): RGB | null;

  resize(w: number): void;
  destroy(): void;
}

export function createVizManager($canvasWrap: HTMLElement): VizManager {
  const pixelRatio = Math.min(devicePixelRatio, 2);
  let currentAxis: Axis = "y";
  let currentPosition = 0.5;
  let currentColorModel = "okhslPolar";
  let currentDistanceMetric = "oklab";
  let currentOutlineWidth = 0;
  let currentGamutClip = false;
  let currentInvertZ = false;

  const vizRaw = new PaletteViz({
    width: 500,
    height: 500,
    pixelRatio,
    axis: currentAxis,
    position: currentPosition,
    colorModel: currentColorModel,
    distanceMetric: currentDistanceMetric,
    palette: DUMMY_PALETTE,
    showRaw: true,
    container: $canvasWrap,
  });

  let vizClosest: PaletteViz | null = null;

  // Mask overlay
  const maskCanvas = document.createElement("canvas");
  maskCanvas.className = "mask-canvas";
  maskCanvas.style.display = "none";
  const maskCtx = maskCanvas.getContext("2d")!;
  $canvasWrap.appendChild(maskCanvas);

  // Highlight overlay for swatch hover
  const highlightCanvas = document.createElement("canvas");
  highlightCanvas.className = "highlight-canvas";
  highlightCanvas.style.display = "none";
  const highlightCtx = highlightCanvas.getContext("2d")!;
  $canvasWrap.appendChild(highlightCanvas);

  // Markers overlay for color position dots
  const markersCanvas = document.createElement("canvas");
  markersCanvas.className = "markers-canvas";
  markersCanvas.style.display = "none";
  const markersCtx = markersCanvas.getContext("2d")!;
  $canvasWrap.appendChild(markersCanvas);
  let markersVisible = false;

  function ensureVizClosest(vizPalette: RGB[]): PaletteViz | null {
    if (vizClosest) return vizClosest;
    if (vizPalette.length < 1) return null;
    const w = Math.round($canvasWrap.clientWidth) || 500;
    vizClosest = new PaletteViz({
      width: w,
      height: w,
      pixelRatio,
      palette: vizPalette,
      showRaw: false,
      container: $canvasWrap,
      colorModel: currentColorModel,
      distanceMetric: currentDistanceMetric,
      axis: currentAxis,
      position: currentPosition,
      outlineWidth: currentOutlineWidth,
      gamutClip: currentGamutClip,
    });
    $canvasWrap.appendChild(maskCanvas);
    return vizClosest;
  }

  function syncPalette(vizPalette: RGB[]): void {
    vizRaw.palette = vizPalette.length > 0 ? vizPalette : DUMMY_PALETTE;
    if (vizPalette.length >= 1) {
      ensureVizClosest(vizPalette);
      if (vizClosest) vizClosest.palette = vizPalette;
    } else if (vizClosest) {
      vizClosest.destroy();
      vizClosest = null;
    }
  }

  function compositeMask(
    hex: string,
    matchSource: "raw" | "closest",
    otherSource: "raw" | "closest",
  ): void {
    if (!vizClosest) return;

    // Force synchronous render so we can read fresh pixels
    vizClosest.getColorAtUV(0.5, 0.5);
    vizRaw.getColorAtUV(0.5, 0.5);

    const w = vizClosest.canvas.width;
    const h = vizClosest.canvas.height;

    const glClosest = vizClosest.canvas.getContext("webgl2")!;
    const closestPx = new Uint8Array(w * h * 4);
    glClosest.bindFramebuffer(glClosest.FRAMEBUFFER, null);
    glClosest.readPixels(
      0,
      0,
      w,
      h,
      glClosest.RGBA,
      glClosest.UNSIGNED_BYTE,
      closestPx,
    );

    const glRaw = vizRaw.canvas.getContext("webgl2")!;
    const rawPx = new Uint8Array(w * h * 4);
    glRaw.bindFramebuffer(glRaw.FRAMEBUFFER, null);
    glRaw.readPixels(0, 0, w, h, glRaw.RGBA, glRaw.UNSIGNED_BYTE, rawPx);

    const sel = hexToRGB(hex);
    const sr = Math.round(sel[0] * 255);
    const sg = Math.round(sel[1] * 255);
    const sb = Math.round(sel[2] * 255);
    const tol = 3;

    if (maskCanvas.width !== w || maskCanvas.height !== h) {
      maskCanvas.width = w;
      maskCanvas.height = h;
    }

    const sources = { closest: closestPx, raw: rawPx };
    const matchPx = sources[matchSource];
    const otherPx = sources[otherSource];

    const imageData = maskCtx.createImageData(w, h);
    const out = imageData.data;

    for (let row = 0; row < h; row++) {
      const srcRow = (h - 1 - row) * w * 4;
      const dstRow = row * w * 4;
      for (let col = 0; col < w; col++) {
        const si = srcRow + col * 4;
        const di = dstRow + col * 4;
        const isMatch =
          Math.abs(closestPx[si] - sr) <= tol &&
          Math.abs(closestPx[si + 1] - sg) <= tol &&
          Math.abs(closestPx[si + 2] - sb) <= tol;
        const src = isMatch ? matchPx : otherPx;
        out[di] = src[si];
        out[di + 1] = src[si + 1];
        out[di + 2] = src[si + 2];
        out[di + 3] = src[si + 3];
      }
    }

    maskCtx.putImageData(imageData, 0, 0);
    maskCanvas.style.display = "";
    vizClosest.canvas.style.display = "none";
    vizRaw.canvas.style.display = "none";
  }

  function showMask(): void {
    maskCanvas.style.display = "";
  }

  function hideMask(): void {
    maskCanvas.style.display = "none";
    vizRaw.canvas.style.display = "";
    manager.updateView(false, true);
  }

  function highlightRegion(hex: string): void {
    if (!vizClosest) return;
    vizClosest.getColorAtUV(0.5, 0.5); // force render

    const w = vizClosest.canvas.width;
    const h = vizClosest.canvas.height;

    const gl = vizClosest.canvas.getContext("webgl2")!;
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);

    const sel = hexToRGB(hex);
    const sr = Math.round(sel[0] * 255);
    const sg = Math.round(sel[1] * 255);
    const sb = Math.round(sel[2] * 255);
    const tol = 3;

    if (highlightCanvas.width !== w || highlightCanvas.height !== h) {
      highlightCanvas.width = w;
      highlightCanvas.height = h;
    }

    // Draw matched region as solid black (flipped Y), then use drop-shadow for outline
    const imageData = highlightCtx.createImageData(w, h);
    const out = imageData.data;
    for (let row = 0; row < h; row++) {
      const srcRow = (h - 1 - row) * w * 4;
      const dstRow = row * w * 4;
      for (let col = 0; col < w; col++) {
        const si = srcRow + col * 4;
        const di = dstRow + col * 4;
        if (
          Math.abs(px[si] - sr) <= tol &&
          Math.abs(px[si + 1] - sg) <= tol &&
          Math.abs(px[si + 2] - sb) <= tol
        ) {
          out[di + 3] = 255; // opaque black
        }
      }
    }
    highlightCtx.putImageData(imageData, 0, 0);

    // Composite: draw drop-shadow outlines, then clear the filled region
    const s =
      wcagContrast(hex, "white") > wcagContrast(hex, "black")
        ? "white"
        : "black";
    const d = 2;
    highlightCtx.filter =
      `drop-shadow(${d}px 0 0 ${s}) drop-shadow(-${d}px 0 0 ${s}) ` +
      `drop-shadow(0 ${d}px 0 ${s}) drop-shadow(0 -${d}px 0 ${s})`;
    highlightCtx.drawImage(highlightCanvas, 0, 0);
    highlightCtx.filter = "none";

    // Erase the interior so only the outline remains.
    // putImageData ignores compositing, so draw via a temp canvas.
    const tmp = new OffscreenCanvas(w, h);
    const tmpCtx = tmp.getContext("2d")!;
    tmpCtx.putImageData(imageData, 0, 0);
    highlightCtx.globalCompositeOperation = "destination-out";
    highlightCtx.drawImage(tmp, 0, 0);
    highlightCtx.globalCompositeOperation = "source-over";

    highlightCanvas.style.display = "";
  }

  function hideHighlight(): void {
    highlightCanvas.style.display = "none";
  }

  let currentMarkers: MarkerInfo[] = [];

  function drawMarkers(
    palette: string[],
    hoveredIndex = -1,
    skipIndex = -1,
  ): void {
    const w = vizRaw.canvas.width;
    const h = vizRaw.canvas.height;
    markersCanvas.width = w;
    markersCanvas.height = h;
    markersCtx.clearRect(0, 0, w, h);
    currentMarkers = [];

    if (!markersVisible || palette.length === 0) {
      markersCanvas.style.display = "none";
      return;
    }

    const minR = 3 * pixelRatio;
    const maxR = 6 * pixelRatio;
    const hoverGrow = 6 * pixelRatio;

    for (let i = 0; i < palette.length; i++) {
      if (i === skipIndex) continue;
      const hex = palette[i];
      const pos = getColorUV(
        hex,
        currentColorModel,
        currentAxis,
        currentPosition,
        currentInvertZ,
      );
      if (!pos) continue;

      const proximity = 1 - Math.min(1, pos.sliderDist * 2);
      let r = minR + proximity * (maxR - minR);
      if (i === hoveredIndex) r += hoverGrow;

      const px = pos.u * w;
      const py = (1 - pos.v) * h;

      currentMarkers.push({
        hex,
        paletteIndex: i,
        px,
        py,
        cssX: px / pixelRatio,
        cssY: py / pixelRatio,
        radius: r / pixelRatio,
      });

      const stroke =
        wcagContrast(hex, "white") > wcagContrast(hex, "black")
          ? "white"
          : "black";

      markersCtx.beginPath();
      markersCtx.arc(px, py, r, 0, Math.PI * 2);
      markersCtx.fillStyle = hex;
      markersCtx.fill();
      markersCtx.lineWidth = 0.75 * pixelRatio;
      markersCtx.strokeStyle = stroke;
      markersCtx.stroke();
    }
    markersCanvas.style.display = "";
  }

  function setMarkersVisible(visible: boolean): void {
    markersVisible = visible;
    if (!visible) markersCanvas.style.display = "none";
  }

  function updateView(pickMode: boolean, hasColors: boolean): void {
    if (pickMode) {
      vizRaw.canvas.style.zIndex = "2";
      if (vizClosest) vizClosest.canvas.style.display = "none";
      return;
    }
    vizRaw.canvas.style.zIndex = "";
    if (!hasColors || !vizClosest) {
      if (vizClosest) vizClosest.canvas.style.display = "none";
      return;
    }
    vizClosest.canvas.style.display = "";
  }

  const manager: VizManager = {
    get vizRaw() {
      return vizRaw;
    },
    get vizClosest() {
      return vizClosest;
    },
    set vizClosest(v) {
      vizClosest = v;
    },
    maskCanvas,

    syncPalette,
    ensureVizClosest,
    updateView,
    compositeMask,
    showMask,
    hideMask,
    highlightRegion,
    hideHighlight,

    drawMarkers,
    setMarkersVisible,
    getMarkers() {
      return currentMarkers;
    },

    setAxis(axis: Axis) {
      currentAxis = axis;
      vizRaw.axis = axis;
      if (vizClosest) vizClosest.axis = axis;
    },
    setPosition(pos: number) {
      currentPosition = pos;
      vizRaw.position = pos;
      if (vizClosest) vizClosest.position = pos;
    },
    setColorModel(model: string) {
      currentColorModel = model;
      vizRaw.colorModel = model;
      if (vizClosest) vizClosest.colorModel = model;
    },
    setDistanceMetric(metric: string) {
      currentDistanceMetric = metric;
      vizRaw.distanceMetric = metric;
      if (vizClosest) vizClosest.distanceMetric = metric;
    },
    setOutlineWidth(w: number) {
      currentOutlineWidth = w;
      vizRaw.outlineWidth = w;
      if (vizClosest) vizClosest.outlineWidth = w;
    },
    setGamutClip(clip: boolean) {
      currentGamutClip = clip;
      vizRaw.gamutClip = clip;
      if (vizClosest) vizClosest.gamutClip = clip;
    },
    setInvertZ(invert: boolean) {
      currentInvertZ = invert;
      const axes = invert ? ["z"] : [];
      vizRaw.invertAxes = axes;
      if (vizClosest) vizClosest.invertAxes = axes;
    },
    setColor(rgb: RGB, index: number) {
      vizRaw.setColor(rgb, index);
      if (vizClosest) vizClosest.setColor(rgb, index);
    },

    getRawColorAtUV(u: number, v: number): RGB {
      return vizRaw.getColorAtUV(u, v);
    },
    getClosestColorAtUV(u: number, v: number): RGB | null {
      return vizClosest ? vizClosest.getColorAtUV(u, v) : null;
    },

    resize(w: number) {
      vizRaw.resize(w, w);
      if (vizClosest) vizClosest.resize(w, w);
    },
    destroy() {
      vizRaw.destroy();
      if (vizClosest) vizClosest.destroy();
    },
  };

  return manager;
}
