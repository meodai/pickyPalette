/**
 * PickyPalette — Interaction Model
 * =================================
 *
 * Canvas interactions
 * -------------------
 * Click              → select the closest palette color under the cursor
 * Drag               → move the selected color (relative to its position)
 * Cmd/Ctrl + click   → add a new color
 * Cmd/Ctrl + drag    → add a new color and adjust it live
 * Double-click       → add a new color (hold to drag-adjust)
 * Empty canvas       → click/drag always adds
 * Scroll / 2-finger  → adjust the position slider (3rd axis)
 *
 * Modifiers (canvas & swatches)
 * -----------------------------
 * Alt/Option          → reveal raw color space under the hovered region
 * Shift + Alt/Option  → isolate the hovered color (flat region stays,
 *                       rest shows raw color space)
 *
 * Keyboard
 * --------
 * C                  → toggle pick mode (crosshair, next click adds)
 * Cmd/Ctrl + Z       → undo
 * Delete / Backspace → remove color under cursor (canvas) or selected color
 * Escape             → cancel drag or exit pick mode
 *
 * Cursors
 * -------
 * grab               → default (you can drag to move the selected color)
 * grabbing           → while dragging
 * crosshair          → Cmd/Ctrl held, pick mode, or empty canvas
 *
 * Visual feedback
 * ---------------
 * Highlight outline  → shown on hover (canvas regions & swatches),
 *                       uses drop-shadow with contrast-aware color
 *                       (black or white via wcagContrast)
 * Reveal mask        → Alt shows raw color space under a region
 * Isolation mask     → Shift+Alt isolates one color's territory
 * FLIP animation     → swatches animate to new positions on sort
 * Staggered panels   → settings/IO sections slide in with delay
 * Cursor probe       → tooltip follows cursor, shows palette color
 *                       when hovering, raw color during drag/pick
 *
 * Edge cases & design decisions
 * -----------------------------
 * - Drag uses relative offset: on pointerdown we scan the raw canvas
 *   to find where the selected color lives (findColorUV), then track
 *   the offset so the color doesn't snap to the cursor.
 * - Cursor can leave the canvas during move-drag: we allow out-of-bounds
 *   pointer events and clamp the UV so colors can reach the edges.
 * - Sort results are ignored while the pointer is down (pointerState
 *   not null) to avoid reordering the palette mid-drag.
 * - Removing colors delays re-sort by 1s (debounced) so rapid removals
 *   don't cause constant reshuffling. Timer is cleared if palette
 *   drops below 3 colors.
 * - Adding a color preserves the current sort order with the new color
 *   appended at the end, so it appears last then animates into place.
 * - The paste field is debounced (600ms) and only syncs back to the
 *   textarea when it's not focused, to avoid fighting the user's input.
 * - Modifier keys are tracked in a shared `modifierKeys` object updated
 *   on every keydown/keyup/pointermove. All state-dependent visuals
 *   (cursor, probe, highlight, swatch hover) flow through a single
 *   `stateDidChange()` so pressing/releasing a modifier while already
 *   hovering works without needing a new mouse event.
 * - `hoveredSwatch` tracks which swatch the cursor is over so that
 *   pressing Alt/Shift while hovering instantly updates the mask.
 * - probeEvent is nulled on pointerleave to prevent stale tooltip
 *   rendering when hovering swatches outside the canvas.
 * - vizClosest is created with 1+ colors (not 2+) so the flat-color
 *   region view appears right after the first color is added.
 * - The favicon updates from vizClosest when available, falling back
 *   to vizRaw, rendered via OffscreenCanvas with a "P" overlay.
 */

import type { RGB, Axis } from "./types";
import { AXES } from "./types";
import {
  hexToRGB,
  rgbToHex,
  toVizPalette,
  AXIS_NAMES,
  isHueAxis,
} from "./color";
import { createControls } from "./controls";
import { createVizManager } from "./viz";
import { createSortManager } from "./sort";
import { createBeamManager } from "./beam";
import { encodeHash, decodeHash } from "./hash";
import { scheduleFaviconUpdate as _schedFavicon } from "./favicon";
import type { HashState } from "./types";

// ── DOM refs ─────────────────────────────────────────────────────────────────

function $<T extends HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

const $tools = $<HTMLDivElement>("[data-tools]");
const $swatches = $<HTMLDivElement>("[data-swatches]");
const $canvasWrap = $<HTMLDivElement>("[data-canvas-wrap]");
const $sliderWrap = $<HTMLDivElement>("[data-slider-wrap]");
const $addBtn = $<HTMLButtonElement>("[data-add]");
const $addIcon = $addBtn.querySelector(".picker__add-icon")!;
const $addLabel = $addBtn.querySelector(".picker__add-label")!;
const $paste = $<HTMLTextAreaElement>("[data-paste]");

// ── Settings toggle ──────────────────────────────────────────────────────────

const $settingsToggle = $<HTMLInputElement>("[data-settings-toggle]");
$settingsToggle.addEventListener("change", () => {
  $tools.classList.toggle("is-open", $settingsToggle.checked);
  if ($settingsToggle.checked) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

// ── Import / Export toggle ───────────────────────────────────────────────────

const $ioToggle = $<HTMLInputElement>("[data-io-toggle]");
const $ioBody = $<HTMLDivElement>("[data-io-body]");

$ioToggle.addEventListener("change", () => {
  $ioBody.classList.toggle("is-open", $ioToggle.checked);
});
function closeIO(): void {
  $ioToggle.checked = false;
  $ioBody.classList.remove("is-open");
}

// ── State ────────────────────────────────────────────────────────────────────

const MAX_COLORS = 128;
let palette: string[] = [];
let selectedIndex = -1;
let sortedPalette: string[] | null = null;
let pickMode = false;
const modifierKeys = { meta: false, ctrl: false, alt: false, shift: false };
let hoveredSwatch: { hex: string; index: number } | null = null;

function syncModifiers(e: {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): void {
  modifierKeys.meta = e.metaKey;
  modifierKeys.ctrl = e.ctrlKey;
  modifierKeys.alt = e.altKey;
  modifierKeys.shift = e.shiftKey;
}

function displayPalette(): string[] {
  return sortedPalette && sortedPalette.length === palette.length
    ? sortedPalette
    : palette;
}

function vizPalette(): RGB[] {
  return toVizPalette(displayPalette());
}

// ── Modules ──────────────────────────────────────────────────────────────────

const controls = createControls($tools, $sliderWrap);
const viz = createVizManager($canvasWrap);

function flipSwatches(updateFn: () => void): void {
  const oldRects = new Map<string, DOMRect>();
  $swatches.querySelectorAll<HTMLElement>(".picker__swatch").forEach(($s) => {
    const name = $s.style.viewTransitionName;
    if (name) oldRects.set(name, $s.getBoundingClientRect());
  });

  updateFn();

  $swatches
    .querySelectorAll<HTMLElement>(".picker__swatch")
    .forEach(($s, i) => {
      const name = $s.style.viewTransitionName;
      const oldRect = name ? oldRects.get(name) : undefined;
      if (!oldRect) return;
      const newRect = $s.getBoundingClientRect();
      const dx = oldRect.left - newRect.left;
      if (Math.abs(dx) < 1) return;
      $s.animate(
        [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
        {
          duration: 300,
          easing: "cubic-bezier(0.3, 0.7, 0, 1)",
          delay: i * Math.max(5, 150 / oldRects.size),
        },
      );
    });
}

const sort = createSortManager((sorted) => {
  if (pointerState) return;
  sortedPalette = sorted;

  flipSwatches(() => {
    viz.syncPalette(vizPalette());
    renderSwatches();
    syncPasteField();
    syncView();
    beam.sendPalette();
  });
});

const beam = createBeamManager(
  {
    $beamMode: $<HTMLSelectElement>("[data-beam-mode]"),
    $beamToken: $<HTMLInputElement>("[data-beam-token]"),
    $beamConnect: $<HTMLButtonElement>("[data-beam-connect]"),
    $beamCopy: $<HTMLButtonElement>("[data-beam-copy]"),
    $beamStatus: $<HTMLElement>("[data-beam-status]"),
    $ioLed: $<HTMLElement>("[data-io-led]"),
  },
  {
    getDisplayPalette: displayPalette,
    setPalette: (colors) => setPalette(colors),
    closeIO,
  },
);

function scheduleFaviconUpdate(): void {
  _schedFavicon(() =>
    palette.length >= 1 && viz.vizClosest ? viz.vizClosest! : viz.vizRaw,
  );
}

// ── View helpers ─────────────────────────────────────────────────────────────

function syncView(): void {
  viz.updateView(pickMode, palette.length > 0);
}

function updateSwatchHover(): void {
  if (!hoveredSwatch || pointerState?.dragging || !viz.vizClosest) return;
  const { hex, index } = hoveredSwatch;
  if (modifierKeys.alt && modifierKeys.shift) {
    viz.compositeMask(hex, "closest", "raw");
  } else if (modifierKeys.alt) {
    viz.compositeMask(hex, "raw", "closest");
  } else {
    viz.hideMask();
    viz.highlightRegion(hex);
  }
}

function stateDidChange(): void {
  updateCanvasCursor();
  updateProbe();
  updateSwatchHover();
}

function refreshView(): void {
  syncView();
  scheduleHashUpdate();
  scheduleFaviconUpdate();
  stateDidChange();
}

function refresh(): void {
  viz.syncPalette(vizPalette());
  renderSwatches();
  syncPasteField();
  syncView();
  scheduleHashUpdate();
  beam.sendPalette();
  scheduleFaviconUpdate();
  stateDidChange();
}

function requestAutoSort(): void {
  if (!controls.$autoSortCheckbox.checked || palette.length < 3) {
    sortedPalette = null;
    return;
  }
  sort.request([...palette]);
}

// ── Hash persistence ─────────────────────────────────────────────────────────

let _hashTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleHashUpdate(): void {
  if (_hashTimer !== null) clearTimeout(_hashTimer);
  _hashTimer = setTimeout(() => {
    history.replaceState(
      null,
      "",
      encodeHash({
        palette: displayPalette(),
        colorModel: controls.$colorModel.value,
        distanceMetric: controls.$distanceMetric.value,
        axis: controls.axis,
        pos: parseFloat(controls.$posSlider.value),
        outline: controls.$outlineCheckbox.checked,
        reveal: controls.$revealCheckbox.checked,
        gamut: controls.$gamutClipCheckbox.checked,
        autoSort: controls.$autoSortCheckbox.checked,
      }),
    );
  }, 400);
}

// ── Undo stack ───────────────────────────────────────────────────────────────

const undoStack: { palette: string[]; selectedIndex: number }[] = [];
const MAX_UNDO = 50;

function pushUndo(): void {
  undoStack.push({ palette: [...palette], selectedIndex });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function undo(): void {
  const state = undoStack.pop();
  if (!state) return;
  palette = state.palette;
  selectedIndex = state.selectedIndex;
  sortedPalette = null;
  refresh();
  requestAutoSort();
}

// ── Palette mutations ────────────────────────────────────────────────────────

function addColor(hex: string): void {
  if (palette.length >= MAX_COLORS) return;
  pushUndo();
  palette.push(hex);
  if (sortedPalette) sortedPalette = [...sortedPalette, hex];
  selectedIndex = palette.length - 1;
  refresh();
  viz.highlightRegion(hex);
  requestAutoSort();
}

let _removeSortTimer: ReturnType<typeof setTimeout> | null = null;

function removeColor(index: number): void {
  pushUndo();
  viz.hideHighlight();
  if (sortedPalette) {
    const hex = palette[index];
    const sortedIdx = sortedPalette.indexOf(hex);
    if (sortedIdx >= 0) sortedPalette.splice(sortedIdx, 1);
  }
  palette.splice(index, 1);
  if (selectedIndex >= palette.length) selectedIndex = palette.length - 1;
  if (palette.length === 0) selectedIndex = -1;
  refresh();
  if (_removeSortTimer !== null) {
    clearTimeout(_removeSortTimer);
    _removeSortTimer = null;
  }
  if (palette.length < 3) {
    sortedPalette = null;
    return;
  }
  _removeSortTimer = setTimeout(() => {
    _removeSortTimer = null;
    requestAutoSort();
  }, 1000);
}

function setColorAt(index: number, hex: string): void {
  palette[index] = hex;
  sortedPalette = null;
  refresh();
  requestAutoSort();
}

function selectColor(index: number): void {
  selectedIndex = index;
  $swatches.querySelectorAll(".picker__swatch").forEach((el) => {
    el.classList.toggle(
      "is-selected",
      (el as HTMLElement).dataset.index === String(index),
    );
  });
  syncView();
  stateDidChange();
}

function setPalette(colors: string[]): void {
  pushUndo();
  palette = colors.slice(0, MAX_COLORS);
  selectedIndex = palette.length > 0 ? 0 : -1;
  sortedPalette = null;
  refresh();
  requestAutoSort();
}

// ── Render swatch grid ───────────────────────────────────────────────────────

function renderSwatches(): void {
  while ($swatches.firstChild !== $addBtn) $swatches.firstChild!.remove();
  $canvasWrap.classList.toggle("is-empty", palette.length === 0);

  const dp = displayPalette();
  const usedSrcIndices = new Set<number>();

  dp.forEach((hex, displayIdx) => {
    let srcIndex = -1;
    for (let j = 0; j < palette.length; j++) {
      if (palette[j] === hex && !usedSrcIndices.has(j)) {
        srcIndex = j;
        break;
      }
    }
    if (srcIndex >= 0) usedSrcIndices.add(srcIndex);

    const $s = document.createElement("span");
    $s.className = "picker__swatch";
    $s.style.background = hex;
    $s.style.viewTransitionName = `swatch-${hex.replace("#", "")}`;
    $s.dataset.index = String(srcIndex);
    if (srcIndex === selectedIndex) $s.classList.add("is-selected");

    const $rm = document.createElement("button");
    $rm.className = "picker__swatch__remove";
    $rm.addEventListener("click", (e) => {
      e.stopPropagation();
      removeColor(srcIndex);
    });
    $s.appendChild($rm);

    $s.addEventListener("click", () => selectColor(srcIndex));
    $s.addEventListener("mouseenter", () => {
      hoveredSwatch = { hex, index: srcIndex };
      updateSwatchHover();
    });
    $s.addEventListener("mouseleave", () => {
      hoveredSwatch = null;
      viz.hideMask();
      viz.hideHighlight();
    });
    $swatches.insertBefore($s, $addBtn);
  });

  $addBtn.classList.toggle("is-compact", palette.length > 0);
}

// ── Paste field ──────────────────────────────────────────────────────────────

let pasteIsSync = false;

let _pasteTimer: ReturnType<typeof setTimeout> | null = null;

$paste.addEventListener("input", () => {
  if (pasteIsSync) return;
  if (_pasteTimer !== null) clearTimeout(_pasteTimer);
  _pasteTimer = setTimeout(() => {
    _pasteTimer = null;
    const colors = $paste.value
      .split(/[\s,]+/)
      .map((s) => s.trim().replace(/^#?/, "#"))
      .filter((s) => /^#([0-9a-f]{3}){1,2}$/i.test(s));
    setPalette(colors);
  }, 600);
});

function syncPasteField(): void {
  if (document.activeElement === $paste) return;
  pasteIsSync = true;
  $paste.value = displayPalette().join(", ");
  pasteIsSync = false;
}

// ── Pick mode ────────────────────────────────────────────────────────────────

function setPickMode(active: boolean): void {
  pickMode = active;
  $addBtn.classList.toggle("is-picking", active);
  $addIcon.textContent = active ? "\u00d7" : "+";
  $addLabel.innerHTML = active
    ? "<kbd>C</kbd> Cancel pick"
    : "<kbd>C</kbd> Add color";
  syncView();
  stateDidChange();
}

$addBtn.addEventListener("click", () => setPickMode(!pickMode));

// ── Canvas pointer interaction ───────────────────────────────────────────────

const DRAG_THRESHOLD = 5;
let pointerState: {
  x: number;
  y: number;
  id: number;
  dragging: boolean;
  dragIndex: number;
  moving: boolean;
  offsetU: number;
  offsetV: number;
} | null = null;
let dragMaskRAF: number | null = null;

function findColorUV(
  hex: string,
  nearU: number,
  nearV: number,
): [number, number] {
  const canvas = viz.vizRaw.canvas;
  const gl = canvas.getContext("webgl2")!;
  const w = canvas.width,
    h = canvas.height;
  const px = new Uint8Array(w * h * 4);
  viz.getRawColorAtUV(0.5, 0.5);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);

  const target = hexToRGB(hex);
  const tr = Math.round(target[0] * 255);
  const tg = Math.round(target[1] * 255);
  const tb = Math.round(target[2] * 255);

  let bestU = nearU,
    bestV = nearV,
    bestDist = Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = px[i] - tr,
        dg = px[i + 1] - tg,
        db = px[i + 2] - tb;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        bestU = x / w;
        bestV = y / h;
      }
    }
  }
  return [bestU, bestV];
}

function getUV(e: { clientX: number; clientY: number }): {
  u: number;
  v: number;
  inBounds: boolean;
} {
  const rect = $canvasWrap.getBoundingClientRect();
  const u = (e.clientX - rect.left) / rect.width;
  const v = 1 - (e.clientY - rect.top) / rect.height;
  return { u, v, inBounds: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
}

function getRawHexAtUV(u: number, v: number): string {
  return rgbToHex(viz.getRawColorAtUV(u, v));
}

function clampUV(u: number, v: number): [number, number] {
  return [Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v))];
}

function paletteIndexAtCursor(e: { clientX: number; clientY: number }): number {
  const { u, v, inBounds } = getUV(e);
  if (!inBounds || !viz.vizClosest) return -1;
  const cc = viz.getClosestColorAtUV(u, v);
  if (!cc) return -1;
  return findPaletteIndex(cc);
}

function liveUpdateColor(index: number, hex: string): void {
  const oldHex = palette[index];
  palette[index] = hex;
  const dp = displayPalette();
  let displayIdx = dp.indexOf(oldHex);
  if (displayIdx < 0) displayIdx = index;
  if (sortedPalette) {
    const si = sortedPalette.indexOf(oldHex);
    if (si >= 0) sortedPalette[si] = hex;
  }
  viz.setColor(hexToRGB(hex), displayIdx);
  const $s = $swatches.querySelector<HTMLElement>(`[data-index="${index}"]`);
  if ($s) $s.style.background = hex;
}

function cancelDrag(): void {
  if (!pointerState || !pointerState.dragging) return;
  const idx = pointerState.dragIndex;
  const wasMoving = pointerState.moving;
  pointerState = null;
  if (dragMaskRAF !== null) {
    cancelAnimationFrame(dragMaskRAF);
    dragMaskRAF = null;
  }
  viz.hideMask();
  if (wasMoving) {
    undo();
  } else if (idx >= 0) {
    removeColor(idx);
  }
  if (pickMode) setPickMode(false);
}

function buildMask(colorIndex: number): void {
  if (!controls.$revealCheckbox.checked) return;
  if (colorIndex < 0 || colorIndex >= palette.length) return;
  viz.compositeMask(palette[colorIndex], "raw", "closest");
}

let altMaskActive = false;
let altMaskIndex = -1;
let altMaskShift = false;

function updateAltMask(): void {
  if (modifierKeys.alt) {
    if (pointerState?.dragging && pointerState.dragIndex >= 0) {
      buildMask(pointerState.dragIndex);
      altMaskIndex = pointerState.dragIndex;
      altMaskActive = true;
      return;
    }
    if (probeEvent) {
      const idx = paletteIndexAtCursor(probeEvent);
      if (
        idx >= 0 &&
        (idx !== altMaskIndex || modifierKeys.shift !== altMaskShift)
      ) {
        if (modifierKeys.shift) {
          viz.compositeMask(palette[idx], "closest", "raw");
        } else {
          buildMask(idx);
        }
        altMaskIndex = idx;
        altMaskShift = modifierKeys.shift;
      }
      if (idx >= 0) {
        altMaskActive = true;
        return;
      }
    }
  }
  if (!modifierKeys.alt && altMaskActive) {
    viz.hideMask();
    altMaskActive = false;
    altMaskIndex = -1;
    altMaskShift = false;
  }
}

function findPaletteIndex(rgb: RGB): number {
  const tol = 4 / 255;
  for (let i = 0; i < palette.length; i++) {
    const c = hexToRGB(palette[i]);
    if (
      Math.abs(rgb[0] - c[0]) < tol &&
      Math.abs(rgb[1] - c[1]) < tol &&
      Math.abs(rgb[2] - c[2]) < tol
    )
      return i;
  }
  return -1;
}

let lastClickTime = 0;
let lastClickX = 0;
let lastClickY = 0;
const DBLCLICK_MS = 400;
const DBLCLICK_DIST = 10;

$canvasWrap.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const now = performance.now();
  const isDblClick =
    now - lastClickTime < DBLCLICK_MS &&
    Math.hypot(e.clientX - lastClickX, e.clientY - lastClickY) < DBLCLICK_DIST;
  lastClickTime = now;
  lastClickX = e.clientX;
  lastClickY = e.clientY;

  const adding =
    isDblClick || e.metaKey || e.ctrlKey || pickMode || palette.length === 0;

  if (isDblClick) {
    const { u, v, inBounds } = getUV(e);
    if (inBounds) addColor(getRawHexAtUV(u, v));
  }

  // Select the color under the cursor before setting up the drag
  if (!adding && !isDblClick) {
    const idx = paletteIndexAtCursor(e);
    if (idx >= 0) selectColor(idx);
  }

  // Compute offset for relative dragging
  let offsetU = 0,
    offsetV = 0;
  const isMoving = !adding && selectedIndex >= 0;
  if (isMoving && !isDblClick) {
    const { u: clickU, v: clickV } = getUV(e);
    const [colorU, colorV] = findColorUV(
      palette[selectedIndex],
      clickU,
      clickV,
    );
    offsetU = clickU - colorU;
    offsetV = clickV - colorV;
  }

  pointerState = {
    x: e.clientX,
    y: e.clientY,
    id: e.pointerId,
    dragging: isDblClick,
    dragIndex: isDblClick ? palette.length - 1 : adding ? -1 : selectedIndex,
    moving: isDblClick || isMoving,
    offsetU,
    offsetV,
  };
  $canvasWrap.setPointerCapture(e.pointerId);
});

function updateCanvasCursor(): void {
  const adding =
    modifierKeys.meta || modifierKeys.ctrl || pickMode || palette.length === 0;
  const grabbing = pointerState?.dragging ?? false;
  $canvasWrap.classList.toggle("is-crosshair", adding && !grabbing);
  $canvasWrap.classList.toggle("is-grabbing", grabbing);
}

$canvasWrap.addEventListener("pointermove", (e) => {
  probeEvent = e;
  syncModifiers(e);
  updateCanvasCursor();
  if (probeRAF === null) probeRAF = requestAnimationFrame(updateProbe);
  updateAltMask();

  if (!pointerState || pointerState.id !== e.pointerId) return;
  const dx = e.clientX - pointerState.x;
  const dy = e.clientY - pointerState.y;

  if (!pointerState.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    pointerState.dragging = true;
    stateDidChange();

    if (pointerState.moving && pointerState.dragIndex >= 0) {
      pushUndo();
    } else {
      const { u, v, inBounds } = getUV(e);
      if (inBounds) {
        addColor(getRawHexAtUV(u, v));
        pointerState.dragIndex = palette.length - 1;
        buildMask(pointerState.dragIndex);
      }
    }
  }

  if (pointerState.dragging && pointerState.dragIndex >= 0) {
    const { u, v, inBounds } = getUV(e);
    const [lu, lv] = clampUV(
      pointerState.moving ? u - pointerState.offsetU : u,
      pointerState.moving ? v - pointerState.offsetV : v,
    );
    if (inBounds || pointerState.moving) {
      liveUpdateColor(pointerState.dragIndex, getRawHexAtUV(lu, lv));
      if (!pointerState.moving && dragMaskRAF === null) {
        const idx = pointerState.dragIndex;
        dragMaskRAF = requestAnimationFrame(() => {
          dragMaskRAF = null;
          buildMask(idx);
        });
      }
    }
  }
});

$canvasWrap.addEventListener("pointerup", (e) => {
  if (!pointerState || pointerState.id !== e.pointerId) return;
  const wasDragging = pointerState.dragging;
  const dragIndex = pointerState.dragIndex;
  const wasMoving = pointerState.moving;
  const oU = pointerState.offsetU;
  const oV = pointerState.offsetV;
  pointerState = null;
  if (dragMaskRAF !== null) {
    cancelAnimationFrame(dragMaskRAF);
    dragMaskRAF = null;
  }

  if (wasDragging) {
    viz.hideMask();
    const { u, v, inBounds } = getUV(e);
    const [fu, fv] = clampUV(wasMoving ? u - oU : u, wasMoving ? v - oV : v);
    if ((inBounds || wasMoving) && dragIndex >= 0)
      setColorAt(dragIndex, getRawHexAtUV(fu, fv));
    if (pickMode) setPickMode(false);
    altMaskIndex = -1;
    updateAltMask();
    stateDidChange();
    return;
  }

  const { u, v, inBounds } = getUV(e);
  if (!inBounds) return;

  if (pickMode || !wasMoving) {
    addColor(getRawHexAtUV(u, v));
    if (pickMode) setPickMode(false);
    return;
  }

  // Click without cmd: select the color under cursor
  const idx = paletteIndexAtCursor(e);
  if (idx >= 0) selectColor(idx);
});

$canvasWrap.addEventListener("pointercancel", () => {
  pointerState = null;
  stateDidChange();
  if (dragMaskRAF !== null) {
    cancelAnimationFrame(dragMaskRAF);
    dragMaskRAF = null;
  }
  viz.hideMask();
});

$canvasWrap.addEventListener("pointerleave", () => {
  probeEvent = null;
  hideProbe();
});

// ── Scroll / touch → adjust position ─────────────────────────────────────────

function adjustPosition(delta: number): void {
  let v = parseFloat(controls.$posSlider.value) - delta;
  if (isHueAxis(controls.$colorModel.value, controls.axis)) {
    v = v - Math.floor(v);
  } else {
    v = Math.max(0, Math.min(1, v));
  }
  controls.$posSlider.value = String(v);
  viz.setPosition(v);
  refreshView();
}

$canvasWrap.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const delta = (e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY) * 0.001;
    adjustPosition(delta);
  },
  { passive: false },
);

let touchState: { y: number } | null = null;

$canvasWrap.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      touchState = { y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
    }
  },
  { passive: false },
);

$canvasWrap.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length === 2 && touchState) {
      e.preventDefault();
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const delta = (touchState.y - y) * -0.003;
      touchState.y = y;
      adjustPosition(delta);
    }
  },
  { passive: false },
);

$canvasWrap.addEventListener("touchend", () => {
  touchState = null;
});
$canvasWrap.addEventListener("touchcancel", () => {
  touchState = null;
});

// ── Cursor probe ─────────────────────────────────────────────────────────────

const $probe = document.createElement("div");
$probe.className = "cursor-probe";
$probe.innerHTML =
  '<span class="cursor-probe__dot"></span><span class="cursor-probe__label"></span><span class="cursor-probe__hint"></span>';
const $probeDot = $probe.querySelector<HTMLElement>(".cursor-probe__dot")!;
const $probeLabel = $probe.querySelector<HTMLElement>(".cursor-probe__label")!;
const $probeHint = $probe.querySelector<HTMLElement>(".cursor-probe__hint")!;
document.body.appendChild($probe);

let probeRAF: number | null = null;
let probeEvent: PointerEvent | null = null;

function hideProbe(): void {
  $probe.classList.remove("is-visible");
  viz.hideHighlight();
}

function updateProbe(): void {
  probeRAF = null;
  if (!probeEvent) return;
  const { u, v, inBounds } = getUV(probeEvent);
  if (!inBounds) {
    hideProbe();
    return;
  }

  const showRaw = pickMode || (pointerState?.dragging ?? false);
  const closestColor = !showRaw ? viz.getClosestColorAtUV(u, v) : null;
  const color = closestColor ?? viz.getRawColorAtUV(u, v);
  const hex = rgbToHex(color);
  $probeDot.style.background = hex;
  $probeLabel.textContent = hex;
  $probeHint.textContent =
    palette.length === 0
      ? "Click to add"
      : palette.length === 1
        ? "Double click to add"
        : "";
  $probe.style.left = `${probeEvent.clientX + 14}px`;
  $probe.style.top = `${probeEvent.clientY + 14}px`;
  $probe.classList.add("is-visible");

  const isAdding = modifierKeys.meta || modifierKeys.ctrl || pickMode;
  if (!showRaw && !isAdding && closestColor) {
    const idx = findPaletteIndex(closestColor);
    if (idx >= 0) {
      viz.highlightRegion(palette[idx]);
    } else {
      viz.hideHighlight();
    }
  } else {
    viz.hideHighlight();
  }
}

// ── Keyboard shortcuts ───────────────────────────────────────────────────────

function isTextInput(e: KeyboardEvent): boolean {
  const t = e.target;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)
    return true;
  if (
    t instanceof HTMLInputElement &&
    t.type !== "range" &&
    t.type !== "checkbox"
  )
    return true;
  return false;
}

document.addEventListener("keydown", (e) => {
  syncModifiers(e);
  stateDidChange();
  if (e.key === "Alt" || (e.key === "Shift" && modifierKeys.alt)) {
    updateAltMask();
    return;
  }
  if (isTextInput(e)) return;
  if ((e.metaKey || e.ctrlKey) && e.key === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (e.key === "c" || e.key === "C") {
    e.preventDefault();
    setPickMode(!pickMode);
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (probeEvent) {
      const idx = paletteIndexAtCursor(probeEvent);
      if (idx >= 0) {
        e.preventDefault();
        removeColor(idx);
        return;
      }
    }
    if (selectedIndex >= 0 && selectedIndex < palette.length) {
      e.preventDefault();
      removeColor(selectedIndex);
    }
  }
  if (e.key === "Escape") {
    if (pointerState?.dragging) {
      e.preventDefault();
      cancelDrag();
    } else if (pickMode) setPickMode(false);
  }
});

document.addEventListener("keyup", (e) => {
  syncModifiers(e);
  stateDidChange();
  if (e.key === "Alt" || (e.key === "Shift" && modifierKeys.alt))
    updateAltMask();
});

// ── Control event wiring ─────────────────────────────────────────────────────

controls.onAxisChange = (axis: Axis) => {
  viz.setAxis(axis);
  refreshView();
};

controls.$colorModel.addEventListener("change", () => {
  viz.setColorModel(controls.$colorModel.value);
  refreshView();
});

controls.$distanceMetric.addEventListener("change", () => {
  viz.setDistanceMetric(controls.$distanceMetric.value);
  refreshView();
});

controls.$posSlider.addEventListener("input", () => {
  viz.setPosition(parseFloat(controls.$posSlider.value));
  refreshView();
});

controls.$outlineCheckbox.addEventListener("change", () => {
  viz.setOutlineWidth(controls.$outlineCheckbox.checked ? 2 : 0);
  scheduleHashUpdate();
});

controls.$revealCheckbox.addEventListener("change", () => scheduleHashUpdate());

controls.$gamutClipCheckbox.addEventListener("change", () => {
  viz.setGamutClip(controls.$gamutClipCheckbox.checked);
  scheduleHashUpdate();
});

controls.$autoSortCheckbox.addEventListener("change", () => {
  if (controls.$autoSortCheckbox.checked) {
    requestAutoSort();
  } else {
    sortedPalette = null;
    renderSwatches();
    syncPasteField();
  }
  scheduleHashUpdate();
});

// ── Resize ───────────────────────────────────────────────────────────────────

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const w = Math.round(entry.contentRect.width);
    if (w > 0) {
      viz.resize(w);
      syncView();
    }
  }
});
resizeObserver.observe($canvasWrap);

// ── Apply hash state ─────────────────────────────────────────────────────────

function applyHashState(state: HashState): void {
  controls.$colorModel.value = state.colorModel;
  controls.$distanceMetric.value = state.distanceMetric;
  controls.$posSlider.value = String(state.pos);
  controls.$outlineCheckbox.checked = state.outline;
  controls.$revealCheckbox.checked = state.reveal;
  controls.$gamutClipCheckbox.checked = state.gamut;
  controls.$autoSortCheckbox.checked = state.autoSort;

  viz.setColorModel(state.colorModel);
  viz.setDistanceMetric(state.distanceMetric);
  viz.setPosition(state.pos);
  viz.setOutlineWidth(state.outline ? 2 : 0);
  viz.setGamutClip(state.gamut);

  palette = state.colors.slice(0, MAX_COLORS);
  selectedIndex = palette.length > 0 ? 0 : -1;
  sortedPalette = null;
  viz.syncPalette(vizPalette());

  controls.setAxis(state.axis);
  controls.updateLabels();
  renderSwatches();
  syncView();
  requestAutoSort();
}

// ── Init ─────────────────────────────────────────────────────────────────────

renderSwatches();
syncView();

requestAnimationFrame(() => {
  setTimeout(() => {
    const state = decodeHash(location.hash);
    if (state) applyHashState(state);
  }, 0);
});

window.addEventListener("beforeunload", () => beam.destroy());
