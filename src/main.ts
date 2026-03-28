/**
 * PickyPalette — Interaction Model
 * =================================
 *
 * Adding colors
 * -------------
 * C                   → toggle pick mode (crosshair, next click adds)
 * Cmd/Ctrl + hover    → preview a new color (click to place)
 * Cmd/Ctrl + drag     → place previewed color and adjust it live
 * Double-click        → add a new color (hold to drag-adjust)
 * Long tap (touch)    → add a new color (hold to drag-adjust)
 * Empty canvas        → click/drag always adds
 *
 * Selecting & editing
 * -------------------
 * Click               → select the closest palette color under the cursor
 * Drag                → move the selected color (relative to its position)
 * 1 / 2 / 3           → switch axis (x / y / z)
 * Scroll              → adjust the position slider (3rd axis)
 *
 * Inspecting
 * ----------
 * P                    → toggle color position markers
 * Alt/Option           → reveal raw color space under the hovered region
 * Shift + Alt/Option   → isolate the hovered color (flat region stays,
 *                        rest shows raw color space)
 * Cmd/Ctrl + Alt       → preview color with raw color space reveal
 * Cmd/Ctrl + Alt+Shift → preview color with isolation mask
 *
 * Removing & undo
 * ---------------
 * Delete / Backspace  → remove hovered swatch, color under cursor, or selected
 * Cmd/Ctrl + Z        → undo
 * Cmd/Ctrl + I        → invert slider axis
 * Escape              → cancel drag or exit pick mode
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

import { interpolate, formatHex } from "culori";
import type { RGB, Axis } from "./types";
import { AXES } from "./types";
import {
  hexToRGB,
  rgbToHex,
  toVizPalette,
  AXIS_NAMES,
  isHueAxis,
  getSliderValue,
  setSliderAxis,
  SLIDER_CULORI_MODE,
  POLAR_MODELS,
} from "./color";
import { createControls } from "./controls";
import { createVizManager } from "./viz";
import { createSortManager } from "./sort";
import { createBeamManager } from "./beam";
import { encodeHash, decodeHash } from "./hash";
import { createInteractionGeometry } from "./interaction-geometry";
import { createPaletteActions } from "./palette-actions";
import { createProbeManager, type ProbeRenderData } from "./probe";
import { scheduleFaviconUpdate as _schedFavicon } from "./favicon";
import type { HashState } from "./types";

function dragInterpolate(
  from: string,
  to: string,
  t: number,
  colorModel: string,
): string | null {
  const mode = SLIDER_CULORI_MODE[colorModel] ?? "oklab";
  const fn = interpolate([from, to], mode as any);
  const c = fn(t);
  return c ? formatHex(c) : null;
}

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
let showMarkers = false;
let invertZ = false;
let hoveredMarkerIndex = -1;
let markerHoverTimer: ReturnType<typeof setTimeout> | null = null;

function clearMarkerHover(): void {
  if (markerHoverTimer !== null) {
    clearTimeout(markerHoverTimer);
    markerHoverTimer = null;
  }
  if (hoveredMarkerIndex >= 0) {
    hoveredMarkerIndex = -1;
    refreshMarkers();
  }
}
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
const geometry = createInteractionGeometry({
  canvasWrap: $canvasWrap,
  getShowMarkers: () => showMarkers,
  getMarkers: () => viz.getMarkers(),
});
const paletteActions = createPaletteActions({
  maxColors: MAX_COLORS,
  getPalette: () => palette,
  setPalette: (nextPalette) => {
    palette = nextPalette;
  },
  getSelectedIndex: () => selectedIndex,
  setSelectedIndex: (index) => {
    selectedIndex = index;
  },
  getSortedPalette: () => sortedPalette,
  setSortedPalette: (nextSortedPalette) => {
    sortedPalette = nextSortedPalette;
  },
  refresh,
  requestAutoSort,
  showHighlight,
  hideHighlight,
});
const probe = createProbeManager({ onHide: hideHighlight });

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

let highlightedHex: string | null = null;

function showHighlight(hex: string): void {
  if (highlightedHex === hex) return;
  viz.highlightRegion(hex);
  highlightedHex = hex;
}

function hideHighlight(): void {
  if (highlightedHex === null) return;
  viz.hideHighlight();
  highlightedHex = null;
}

function updateSwatchHover(): void {
  if (!hoveredSwatch || pointerState?.dragging || !viz.vizClosest) return;
  const { hex } = hoveredSwatch;
  if (modifierKeys.alt && modifierKeys.shift) {
    viz.compositeMask(hex, "closest", "raw");
  } else if (modifierKeys.alt) {
    viz.compositeMask(hex, "raw", "closest");
  } else {
    viz.hideMask();
    showHighlight(hex);
  }
}

function stateDidChange(): void {
  updateCanvasCursor();
  probe.requestRender(renderProbe);
  updateSwatchHover();
}

function refreshMarkers(): void {
  if (showMarkers || pickMode)
    viz.drawMarkers(palette, hoveredMarkerIndex, previewIndex);
}

function toggleInvertZ(force?: boolean): void {
  invertZ = force ?? !invertZ;
  controls.$invertZBtn.classList.toggle("is-active", invertZ);
  controls.$sliderInvertBtn.classList.toggle("is-active", invertZ);
  viz.setInvertZ(invertZ);
  refreshMarkers();
  scheduleHashUpdate();
}

function toggleMarkers(force?: boolean): void {
  showMarkers = force ?? !showMarkers;
  controls.$markersCheckbox.checked = showMarkers;
  viz.setMarkersVisible(showMarkers);
  refreshMarkers();
  scheduleHashUpdate();
}

function refreshView(): void {
  highlightedHex = null;
  syncView();
  refreshMarkers();
  scheduleHashUpdate();
  scheduleFaviconUpdate();
  stateDidChange();
}

function refresh(): void {
  highlightedHex = null;
  viz.syncPalette(vizPalette());
  renderSwatches();
  syncPasteField();
  syncView();
  refreshMarkers();
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
        gamut: controls.$gamutClipCheckbox.checked,
        autoSort: controls.$autoSortCheckbox.checked,
        markers: showMarkers,
        snapAxis: controls.$snapAxisCheckbox.checked,
        invertZ,
      }),
    );
  }, 400);
}

// ── Undo stack ───────────────────────────────────────────────────────────────

const { pushUndo, undo, addColor, removeColor, setColorAt, setPalette } =
  paletteActions;

// ── Preview color (Cmd/Ctrl hover) ──────────────────────────────────────────

let previewIndex = -1;

function showPreview(hex: string): void {
  if (palette.length >= MAX_COLORS) return;
  if (previewIndex >= 0) {
    // update existing preview
    liveUpdateColor(previewIndex, hex);
  } else {
    palette.push(hex);
    if (sortedPalette) sortedPalette = [...sortedPalette, hex];
    previewIndex = palette.length - 1;
    selectedIndex = previewIndex;
    viz.syncPalette(vizPalette());
    renderSwatches();
    syncView();
  }
  if (modifierKeys.alt) scheduleAltMask(previewIndex);
}

function commitPreview(): void {
  if (previewIndex < 0) return;
  const hex = palette[previewIndex];
  previewIndex = -1;
  // treat as a real add — push undo, refresh
  pushUndo();
  refresh();
  showHighlight(hex);
  requestAutoSort();
}

function cancelPreview(): void {
  if (previewIndex < 0) return;
  const idx = previewIndex;
  previewIndex = -1;
  cancelScheduledAltMask();
  if (sortedPalette) {
    const hex = palette[idx];
    const si = sortedPalette.indexOf(hex);
    if (si >= 0) sortedPalette.splice(si, 1);
  }
  palette.splice(idx, 1);
  if (selectedIndex >= palette.length) selectedIndex = palette.length - 1;
  if (palette.length === 0) selectedIndex = -1;
  viz.hideMask();
  altMaskActive = false;
  altMaskIndex = -1;
  altMaskShift = false;
  viz.syncPalette(vizPalette());
  renderSwatches();
  syncView();
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

    $s.addEventListener("click", () => {
      selectColor(srcIndex);
      const sliderVal = getSliderValue(
        hex,
        controls.$colorModel.value,
        controls.axis,
      );
      if (sliderVal !== null && sliderVal > 0.01 && sliderVal < 0.99) {
        controls.$posSlider.value = String(sliderVal);
        viz.setPosition(sliderVal);
        refreshView();
      }
    });
    $s.addEventListener("mouseenter", () => {
      hoveredSwatch = { hex, index: srcIndex };
      updateSwatchHover();
    });
    $s.addEventListener("mouseleave", () => {
      hoveredSwatch = null;
      viz.hideMask();
      hideHighlight();
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
  // Always show markers in pick mode, restore user setting when leaving
  if (active) {
    viz.setMarkersVisible(true);
    viz.drawMarkers(palette);
  } else {
    viz.setMarkersVisible(showMarkers);
    refreshMarkers();
  }
  clearMarkerHover();
  syncView();
  stateDidChange();
}

$addBtn.addEventListener("click", () => setPickMode(!pickMode));

// ── Canvas pointer interaction ───────────────────────────────────────────────

const DRAG_THRESHOLD = 5;
const LONG_PRESS_MS = 400;
let pointerState: {
  x: number;
  y: number;
  id: number;
  dragging: boolean;
  dragIndex: number;
  moving: boolean;
  /** Original 3rd-axis normalized value (0–1) of the color being moved */
  origSliderVal: number;
  /** Original hex of the color being moved */
  origHex: string;
} | null = null;
let dragMaskRAF: number | null = null;
let altMaskRAF: number | null = null;
let pendingAltMaskIndex: number | null = null;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;

function clearLongPress(): void {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function getUV(e: { clientX: number; clientY: number }): {
  u: number;
  v: number;
  inBounds: boolean;
} {
  return geometry.getUV(e);
}

function getRawHexAtUV(u: number, v: number): string {
  return rgbToHex(viz.getRawColorAtUV(u, v));
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
  cancelScheduledAltMask();
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
  if (colorIndex < 0 || colorIndex >= palette.length) return;
  viz.compositeMask(palette[colorIndex], "raw", "closest");
}

function cancelScheduledAltMask(): void {
  if (altMaskRAF !== null) {
    cancelAnimationFrame(altMaskRAF);
    altMaskRAF = null;
  }
  pendingAltMaskIndex = null;
}

function scheduleAltMask(colorIndex: number): void {
  if (colorIndex < 0 || colorIndex >= palette.length) return;
  pendingAltMaskIndex = colorIndex;
  if (altMaskRAF !== null) return;
  altMaskRAF = requestAnimationFrame(() => {
    altMaskRAF = null;
    const idx = pendingAltMaskIndex;
    pendingAltMaskIndex = null;
    if (idx === null || idx < 0 || idx >= palette.length || !modifierKeys.alt) {
      return;
    }
    if (modifierKeys.shift) {
      viz.compositeMask(palette[idx], "closest", "raw");
    } else {
      buildMask(idx);
    }
    altMaskIndex = idx;
    altMaskShift = modifierKeys.shift;
    altMaskActive = true;
  });
}

let altMaskActive = false;
let altMaskIndex = -1;
let altMaskShift = false;

function updateAltMask(): void {
  if (modifierKeys.alt) {
    if (pointerState?.dragging && pointerState.dragIndex >= 0) {
      scheduleAltMask(pointerState.dragIndex);
      return;
    }
    // Preview color always gets a fresh mask rebuild since it moves
    if (previewIndex >= 0) {
      scheduleAltMask(previewIndex);
      return;
    }
    const probeEvent = probe.getEvent();
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
  if (!modifierKeys.alt) {
    cancelScheduledAltMask();
    if (altMaskActive) {
      viz.hideMask();
      altMaskActive = false;
      altMaskIndex = -1;
      altMaskShift = false;
    }
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
  geometry.refreshRect();

  // Track double-click timing early so marker taps don't break it
  const now = performance.now();
  const isDblClick =
    now - lastClickTime < DBLCLICK_MS &&
    Math.hypot(e.clientX - lastClickX, e.clientY - lastClickY) < DBLCLICK_DIST;
  lastClickTime = now;
  lastClickX = e.clientX;
  lastClickY = e.clientY;

  // Tap on a marker (touch): jump slider to that color's slice
  const touchMarker =
    e.pointerType === "touch" && showMarkers && !pickMode
      ? geometry.hitTestMarker(e.clientX, e.clientY)
      : null;

  // Click on a hovered marker (mouse) or tapped marker (touch)
  // Skip if double-click — let double-click add a new color instead
  const markerIdx = touchMarker ? touchMarker.paletteIndex : hoveredMarkerIndex;
  if (markerIdx >= 0 && !pickMode && !isDblClick) {
    const idx = markerIdx;
    const hex = palette[idx];
    const sliderVal = getSliderValue(
      hex,
      controls.$colorModel.value,
      controls.axis,
    );
    if (sliderVal !== null) {
      controls.$posSlider.value = String(sliderVal);
      viz.setPosition(sliderVal);
    }
    selectColor(idx);
    clearMarkerHover();
    refreshView();
    // Set up drag so the user can immediately move the color
    pointerState = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      dragging: false,
      dragIndex: idx,
      moving: true,
      origSliderVal: parseFloat(controls.$posSlider.value),
      origHex: palette[idx],
    };
    $canvasWrap.setPointerCapture(e.pointerId);
    return;
  }

  // Commit preview on click
  if (previewIndex >= 0) {
    commitPreview();
    // Set up drag so user can adjust the just-committed color
    pointerState = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      dragging: false,
      dragIndex: palette.length - 1,
      moving: true,
      origSliderVal: parseFloat(controls.$posSlider.value),
      origHex: palette[palette.length - 1],
    };
    $canvasWrap.setPointerCapture(e.pointerId);
    return;
  }

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

  const isMoving = !adding && selectedIndex >= 0;
  const dragIdx = isDblClick ? palette.length - 1 : adding ? -1 : selectedIndex;

  // For move-drags, record the color's actual 3rd-axis position
  const curSliderPos = parseFloat(controls.$posSlider.value);
  let origSV = curSliderPos;
  if (isMoving && dragIdx >= 0) {
    const sv = getSliderValue(
      palette[dragIdx],
      controls.$colorModel.value,
      controls.axis,
    );
    if (sv !== null) origSV = sv;
  }

  pointerState = {
    x: e.clientX,
    y: e.clientY,
    id: e.pointerId,
    dragging: isDblClick,
    dragIndex: dragIdx,
    moving: isDblClick || isMoving,
    origSliderVal: origSV,
    origHex: dragIdx >= 0 ? palette[dragIdx] : "",
  };
  $canvasWrap.setPointerCapture(e.pointerId);

  // Long-press to add on touch (only when not already adding)
  if (e.pointerType === "touch" && !adding && !isDblClick) {
    clearLongPress();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (!pointerState || pointerState.dragging) return;
      const { u, v, inBounds } = getUV(e);
      if (!inBounds) return;
      addColor(getRawHexAtUV(u, v));
      pointerState.dragging = true;
      pointerState.dragIndex = palette.length - 1;
      pointerState.moving = false;
      if (modifierKeys.alt) {
        scheduleAltMask(pointerState.dragIndex);
      } else {
        buildMask(pointerState.dragIndex);
      }
      stateDidChange();
    }, LONG_PRESS_MS);
  }
});

function updateCanvasCursor(): void {
  const adding =
    modifierKeys.meta || modifierKeys.ctrl || pickMode || palette.length === 0;
  const grabbing = pointerState?.dragging ?? false;
  $canvasWrap.classList.toggle("is-crosshair", adding && !grabbing);
  $canvasWrap.classList.toggle("is-grabbing", grabbing);
}

$canvasWrap.addEventListener("pointermove", (e) => {
  geometry.refreshRect();
  // Update preview color while Cmd/Ctrl hovering
  if (!pointerState && (e.metaKey || e.ctrlKey) && e.pointerType !== "touch") {
    const { u, v, inBounds } = getUV(e);
    if (inBounds) {
      showPreview(getRawHexAtUV(u, v));
    } else {
      cancelPreview();
    }
  }

  if (e.pointerType === "touch") {
    probe.clear();
  } else {
    probe.setEvent(e, renderProbe);
  }
  syncModifiers(e);
  updateCanvasCursor();
  updateAltMask();

  // Marker hover detection (disabled in pick mode — markers are display-only)
  if (!pointerState && !pickMode && showMarkers && e.pointerType !== "touch") {
    const hit = geometry.hitTestMarker(e.clientX, e.clientY);
    const hitIdx = hit ? hit.paletteIndex : -1;
    if (hitIdx !== hoveredMarkerIndex) {
      if (markerHoverTimer !== null) {
        clearTimeout(markerHoverTimer);
        markerHoverTimer = null;
      }
      if (hitIdx >= 0) {
        markerHoverTimer = setTimeout(() => {
          markerHoverTimer = null;
          hoveredMarkerIndex = hitIdx;
          refreshMarkers();
        }, 500);
      } else {
        hoveredMarkerIndex = -1;
        refreshMarkers();
      }
    }
  }

  if (!pointerState || pointerState.id !== e.pointerId) return;
  const dx = e.clientX - pointerState.x;
  const dy = e.clientY - pointerState.y;

  if (!pointerState.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    clearLongPress();
    pointerState.dragging = true;
    stateDidChange();

    if (pointerState.moving && pointerState.dragIndex >= 0) {
      pushUndo();
    } else {
      const { u, v, inBounds } = getUV(e);
      if (inBounds) {
        addColor(getRawHexAtUV(u, v));
        pointerState.dragIndex = palette.length - 1;
        if (modifierKeys.alt) {
          scheduleAltMask(pointerState.dragIndex);
        } else {
          buildMask(pointerState.dragIndex);
        }
      }
    }
  }

  if (pointerState.dragging && pointerState.dragIndex >= 0) {
    const { u, v, inBounds } = getUV(e);
    if (inBounds || pointerState.moving) {
      let cu: number, cv: number;
      if (POLAR_MODELS.has(controls.$colorModel.value)) {
        // Clamp to unit disc centered at (0.5, 0.5)
        const dx = u - 0.5;
        const dy = v - 0.5;
        const len = Math.hypot(dx, dy);
        const maxR = 0.498; // slightly inside to avoid edge jitter
        if (len > maxR) {
          const scale = maxR / len;
          cu = 0.5 + dx * scale;
          cv = 0.5 + dy * scale;
        } else {
          cu = u;
          cv = v;
        }
      } else {
        cu = Math.max(0, Math.min(1, u));
        cv = Math.max(0, Math.min(1, v));
      }
      // When gamut clip is on, pull inward if the color is out of gamut (black)
      if (controls.$gamutClipCheckbox.checked) {
        const testRGB = viz.getRawColorAtUV(cu, cv);
        if (testRGB[0] + testRGB[1] + testRGB[2] < 0.01) {
          let lo = 0,
            hi = 1;
          const cx = 0.5,
            cy = 0.5;
          for (let i = 0; i < 8; i++) {
            const mid = (lo + hi) / 2;
            const mu = cx + (cu - cx) * mid;
            const mv = cy + (cv - cy) * mid;
            const rgb = viz.getRawColorAtUV(mu, mv);
            if (rgb[0] + rgb[1] + rgb[2] < 0.01) {
              hi = mid;
            } else {
              lo = mid;
            }
          }
          cu = cx + (cu - cx) * lo;
          cv = cy + (cv - cy) * lo;
        }
      }
      const sliceHex = getRawHexAtUV(cu, cv);
      let hex: string;
      if (pointerState.moving && controls.$snapAxisCheckbox.checked) {
        const dist = Math.hypot(
          e.clientX - pointerState.x,
          e.clientY - pointerState.y,
        );
        const canvasSize = $canvasWrap.getBoundingClientRect().width;
        const radius = canvasSize * 0.25;
        const t = Math.min(1, dist / radius);
        const blended = dragInterpolate(
          pointerState.origHex,
          sliceHex,
          t,
          controls.$colorModel.value,
        );
        hex = blended ?? sliceHex;
      } else {
        hex = sliceHex;
      }
      liveUpdateColor(pointerState.dragIndex, hex);
      refreshMarkers();
      if (modifierKeys.alt) {
        scheduleAltMask(pointerState.dragIndex);
      } else if (!pointerState.moving && dragMaskRAF === null) {
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
  clearLongPress();
  geometry.refreshRect();
  if (!pointerState || pointerState.id !== e.pointerId) return;
  const wasDragging = pointerState.dragging;
  const dragIndex = pointerState.dragIndex;
  const wasMoving = pointerState.moving;
  pointerState = null;
  cancelScheduledAltMask();
  if (dragMaskRAF !== null) {
    cancelAnimationFrame(dragMaskRAF);
    dragMaskRAF = null;
  }

  if (wasDragging) {
    viz.hideMask();
    if (wasMoving && controls.$snapAxisCheckbox.checked) {
      // Easing mode: keep the blended color from the last pointermove
      if (dragIndex >= 0) setColorAt(dragIndex, palette[dragIndex]);
    } else {
      const { u, v, inBounds } = getUV(e);
      if (inBounds && dragIndex >= 0)
        setColorAt(dragIndex, getRawHexAtUV(u, v));
    }
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
    lastClickTime = 0; // prevent next click from being detected as double-click
    if (pickMode) setPickMode(false);
    return;
  }

  // Click without cmd: select the color under cursor
  const idx = paletteIndexAtCursor(e);
  if (idx >= 0) selectColor(idx);
});

$canvasWrap.addEventListener("pointercancel", () => {
  clearLongPress();
  pointerState = null;
  stateDidChange();
  cancelScheduledAltMask();
  if (dragMaskRAF !== null) {
    cancelAnimationFrame(dragMaskRAF);
    dragMaskRAF = null;
  }
  viz.hideMask();
});

$canvasWrap.addEventListener("pointerleave", () => {
  probe.clear();
  cancelPreview();
  clearMarkerHover();
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

// ── Cursor probe ─────────────────────────────────────────────────────────────

function renderProbe(event: PointerEvent): ProbeRenderData | null {
  const { u, v, inBounds } = getUV(event);
  if (!inBounds) {
    hideHighlight();
    return null;
  }

  const isDragging = pointerState?.dragging ?? false;
  const showRaw = pickMode || isDragging;

  const closestColor = !showRaw ? viz.getClosestColorAtUV(u, v) : null;
  let hex: string;
  if (isDragging && pointerState!.dragIndex >= 0) {
    hex = palette[pointerState!.dragIndex];
  } else {
    const color = closestColor ?? viz.getRawColorAtUV(u, v);
    hex = rgbToHex(color);
  }
  const hint =
    palette.length === 0
      ? "Click to add"
      : palette.length === 1
        ? "Double click to add"
        : palette.length === 2
          ? "Drag to change"
          : "";

  const isAdding = modifierKeys.meta || modifierKeys.ctrl || pickMode;
  if (!showRaw && !isAdding && !modifierKeys.alt && closestColor) {
    const idx = findPaletteIndex(closestColor);
    if (idx >= 0) {
      showHighlight(palette[idx]);
    } else {
      hideHighlight();
    }
  } else {
    hideHighlight();
  }

  return {
    hex,
    hint,
    x: event.clientX + 14,
    y: event.clientY + 14,
  };
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
  // Start preview if Cmd/Ctrl pressed while cursor is already on canvas
  if (
    (e.key === "Meta" || e.key === "Control") &&
    probe.getEvent() &&
    !pointerState &&
    previewIndex < 0
  ) {
    const probeEvent = probe.getEvent()!;
    const { u, v, inBounds } = getUV(probeEvent);
    if (inBounds) showPreview(getRawHexAtUV(u, v));
  }
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
  if ((e.metaKey || e.ctrlKey) && e.key === "i") {
    e.preventDefault();
    toggleInvertZ();
    return;
  }
  // Don't intercept browser shortcuts (Cmd/Ctrl + key)
  if (e.metaKey || e.ctrlKey) return;
  if (e.key === "1") {
    controls.setAxis("x");
  }
  if (e.key === "2") {
    controls.setAxis("y");
  }
  if (e.key === "3") {
    controls.setAxis("z");
  }
  if (e.key === "c" || e.key === "C") {
    e.preventDefault();
    setPickMode(!pickMode);
  }
  if (e.key === "p" || e.key === "P") {
    e.preventDefault();
    toggleMarkers();
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (hoveredSwatch) {
      e.preventDefault();
      removeColor(hoveredSwatch.index);
      return;
    }
    const probeEvent = probe.getEvent();
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
  if (
    (e.key === "Meta" || e.key === "Control") &&
    !modifierKeys.meta &&
    !modifierKeys.ctrl
  ) {
    cancelPreview();
  }
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

controls.$markersCheckbox.addEventListener("change", () => {
  toggleMarkers(controls.$markersCheckbox.checked);
});

controls.$snapAxisCheckbox.addEventListener("change", () => {
  scheduleHashUpdate();
});

controls.$invertZBtn.addEventListener("click", () => toggleInvertZ());

// ── Resize ───────────────────────────────────────────────────────────────────

function syncOverlayStateAfterResize(): void {
  highlightedHex = null;
  if (dragMaskRAF !== null) {
    cancelAnimationFrame(dragMaskRAF);
    dragMaskRAF = null;
  }
  cancelScheduledAltMask();
  viz.hideMask();
  altMaskActive = false;
  altMaskIndex = -1;
  altMaskShift = false;
  refreshMarkers();
  stateDidChange();

  if (
    pointerState?.dragging &&
    pointerState.dragIndex >= 0 &&
    !pointerState.moving
  ) {
    if (modifierKeys.alt) {
      scheduleAltMask(pointerState.dragIndex);
    } else {
      buildMask(pointerState.dragIndex);
    }
    return;
  }

  if (!hoveredSwatch && modifierKeys.alt) {
    updateAltMask();
  }
  probe.requestRender(renderProbe);
}

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const w = Math.round(entry.contentRect.width);
    if (w > 0) {
      geometry.refreshRect();
      viz.resize(w);
      syncView();
      syncOverlayStateAfterResize();
    }
  }
});
resizeObserver.observe($canvasWrap);

window.addEventListener("scroll", () => geometry.refreshRect(), {
  capture: true,
  passive: true,
});

// ── Apply hash state ─────────────────────────────────────────────────────────

function applyHashState(state: HashState): void {
  controls.$colorModel.value = state.colorModel;
  controls.$distanceMetric.value = state.distanceMetric;
  controls.$posSlider.value = String(state.pos);
  controls.$gamutClipCheckbox.checked = state.gamut;
  controls.$autoSortCheckbox.checked = state.autoSort;

  viz.setColorModel(state.colorModel);
  viz.setDistanceMetric(state.distanceMetric);
  viz.setPosition(state.pos);
  viz.setGamutClip(state.gamut);

  palette = state.colors.slice(0, MAX_COLORS);
  selectedIndex = palette.length > 0 ? 0 : -1;
  sortedPalette = null;
  viz.syncPalette(vizPalette());

  controls.setAxis(state.axis);
  controls.updateLabels();
  toggleMarkers(state.markers);
  controls.$snapAxisCheckbox.checked = state.snapAxis;
  toggleInvertZ(state.invertZ);
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
