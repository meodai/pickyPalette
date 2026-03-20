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
  // FLIP: record old positions keyed by hex
  const oldRects = new Map<string, DOMRect>();
  $swatches.querySelectorAll<HTMLElement>(".picker__swatch").forEach(($s) => {
    const name = $s.style.viewTransitionName;
    if (name) oldRects.set(name, $s.getBoundingClientRect());
  });

  updateFn();

  // FLIP: record new positions and animate
  $swatches.querySelectorAll<HTMLElement>(".picker__swatch").forEach(($s, i) => {
    const name = $s.style.viewTransitionName;
    const oldRect = name ? oldRects.get(name) : undefined;
    if (!oldRect) return;
    const newRect = $s.getBoundingClientRect();
    const dx = oldRect.left - newRect.left;
    if (Math.abs(dx) < 1) return;
    $s.animate(
      [
        { transform: `translateX(${dx}px)` },
        { transform: "translateX(0)" },
      ],
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
    viz.updateView(pickMode, palette.length > 0);
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
    palette.length >= 2 && viz.vizClosest ? viz.vizClosest! : viz.vizRaw,
  );
}

// ── Refresh helpers ──────────────────────────────────────────────────────────

function refresh(): void {
  viz.syncPalette(vizPalette());
  renderSwatches();
  syncPasteField();
  viz.updateView(pickMode, palette.length > 0);
  scheduleHashUpdate();
  beam.sendPalette();
  scheduleFaviconUpdate();
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
  // Keep previous sort order with the new color appended at the end,
  // so it appears at the end first, then animates into place via view transition.
  if (sortedPalette) sortedPalette = [...sortedPalette, hex];
  selectedIndex = palette.length - 1;
  refresh();
  requestAutoSort();
}

let _removeSortTimer: ReturnType<typeof setTimeout> | null = null;

function removeColor(index: number): void {
  pushUndo();
  viz.hideHighlight();
  // Remove from sorted palette too so the swatch disappears in place
  if (sortedPalette) {
    const hex = palette[index];
    const sortedIdx = sortedPalette.indexOf(hex);
    if (sortedIdx >= 0) sortedPalette.splice(sortedIdx, 1);
  }
  palette.splice(index, 1);
  if (selectedIndex >= palette.length) selectedIndex = palette.length - 1;
  if (palette.length === 0) selectedIndex = -1;
  refresh();
  // Cancel any pending re-sort
  if (_removeSortTimer !== null) {
    clearTimeout(_removeSortTimer);
    _removeSortTimer = null;
  }
  // No need to sort if fewer than 3 colors remain
  if (palette.length < 3) {
    sortedPalette = null;
    return;
  }
  // Delay re-sort so rapid removals don't cause constant reshuffling
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
  // Just toggle the class — no need to rebuild the DOM
  $swatches.querySelectorAll(".picker__swatch").forEach((el) => {
    el.classList.toggle(
      "is-selected",
      (el as HTMLElement).dataset.index === String(index),
    );
  });
  viz.updateView(pickMode, palette.length > 0);
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
    $s.addEventListener("mouseenter", (e) => {
      if (pointerState?.dragging || !viz.vizClosest) return;
      if (e.shiftKey) {
        viz.compositeMask(hex, "closest", "raw");
      } else {
        viz.highlightRegion(hex);
      }
    });
    $s.addEventListener("mouseleave", () => {
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
  // Don't overwrite while the user is actively editing
  if (document.activeElement === $paste) return;
  pasteIsSync = true;
  $paste.value = displayPalette().join(", ");
  pasteIsSync = false;
}

// ── Pick mode ────────────────────────────────────────────────────────────────

function enterPickMode(): void {
  pickMode = true;
  $addBtn.classList.add("is-picking");
  $addIcon.textContent = "\u00d7";
  $addLabel.innerHTML = "<kbd>C</kbd> Cancel pick";
  viz.updateView(pickMode, palette.length > 0);
}

function exitPickMode(): void {
  pickMode = false;
  $addBtn.classList.remove("is-picking");
  $addIcon.textContent = "+";
  $addLabel.innerHTML = "<kbd>C</kbd> Add color";
  viz.updateView(pickMode, palette.length > 0);
}

function togglePickMode(): void {
  if (pickMode) exitPickMode();
  else enterPickMode();
}

$addBtn.addEventListener("click", togglePickMode);

// ── Canvas pointer interaction ───────────────────────────────────────────────

const DRAG_THRESHOLD = 5;
let pointerState: {
  x: number;
  y: number;
  id: number;
  dragging: boolean;
  dragIndex: number;
  moving: boolean;
} | null = null;
let dragMaskRAF: number | null = null;

function getUV(e: PointerEvent | MouseEvent): {
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

function liveUpdateColor(index: number, hex: string): void {
  const oldHex = palette[index];
  palette[index] = hex;
  // Find the display slot — the shader palette uses displayPalette() order
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
    // Restore original color from undo stack
    undo();
  } else if (idx >= 0) {
    removeColor(idx);
  }
  if (pickMode) exitPickMode();
}

function buildMask(colorIndex: number): void {
  if (!controls.$revealCheckbox.checked) return;
  if (colorIndex < 0 || colorIndex >= palette.length) return;
  viz.compositeMask(palette[colorIndex], "raw", "closest");
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

$canvasWrap.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const moving = e.shiftKey && palette.length > 0 && !pickMode;
  let moveIndex = -1;
  if (moving && viz.vizClosest) {
    const { u, v, inBounds } = getUV(e);
    if (inBounds) {
      const closestColor = viz.getClosestColorAtUV(u, v);
      if (closestColor) moveIndex = findPaletteIndex(closestColor);
    }
  }
  pointerState = {
    x: e.clientX,
    y: e.clientY,
    id: e.pointerId,
    dragging: false,
    dragIndex: moveIndex,
    moving,
  };
  $canvasWrap.setPointerCapture(e.pointerId);
});

$canvasWrap.addEventListener("pointermove", (e) => {
  probeEvent = e;
  if (probeRAF === null) probeRAF = requestAnimationFrame(updateProbe);

  if (!pointerState || pointerState.id !== e.pointerId) return;
  const dx = e.clientX - pointerState.x;
  const dy = e.clientY - pointerState.y;

  if (!pointerState.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    pointerState.dragging = true;

    if (pointerState.moving && pointerState.dragIndex >= 0) {
      // Shift+drag: move existing color — show live viz, no mask
      pushUndo();
      selectColor(pointerState.dragIndex);
      viz.updateView(false, true);
    } else {
      // Normal drag: add a new color
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
    if (inBounds) {
      liveUpdateColor(pointerState.dragIndex, getRawHexAtUV(u, v));
      // When moving (shift+drag), skip the mask — vizClosest updates live.
      // When adding (normal drag), rebuild the reveal mask.
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
  const wasMoving = pointerState.moving;
  const dragIndex = pointerState.dragIndex;
  pointerState = null;
  if (dragMaskRAF !== null) {
    cancelAnimationFrame(dragMaskRAF);
    dragMaskRAF = null;
  }

  if (wasDragging) {
    viz.hideMask();
    const { u, v, inBounds } = getUV(e);
    if (inBounds && dragIndex >= 0) setColorAt(dragIndex, getRawHexAtUV(u, v));
    if (pickMode) exitPickMode();
    return;
  }

  // Shift+click (no drag): select the color under cursor
  if (wasMoving && dragIndex >= 0) {
    selectColor(dragIndex);
    return;
  }

  const { u, v, inBounds } = getUV(e);
  if (!inBounds) return;

  if (pickMode) {
    addColor(getRawHexAtUV(u, v));
    exitPickMode();
    return;
  }
  if (palette.length === 0 || !viz.vizClosest) {
    addColor(getRawHexAtUV(u, v));
    return;
  }

  const closestColor = viz.getClosestColorAtUV(u, v);
  if (closestColor) {
    const matchIndex = findPaletteIndex(closestColor);
    if (matchIndex >= 0) selectColor(matchIndex);
  }
});

$canvasWrap.addEventListener("pointercancel", () => {
  pointerState = null;
  if (dragMaskRAF !== null) {
    cancelAnimationFrame(dragMaskRAF);
    dragMaskRAF = null;
  }
  viz.hideMask();
});

$canvasWrap.addEventListener("pointerleave", () => hideProbe());

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
  viz.updateView(pickMode, palette.length > 0);
  scheduleHashUpdate();
  scheduleFaviconUpdate();
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
  '<span class="cursor-probe__dot"></span><span class="cursor-probe__label"></span>';
const $probeDot = $probe.querySelector<HTMLElement>(".cursor-probe__dot")!;
const $probeLabel = $probe.querySelector<HTMLElement>(".cursor-probe__label")!;
document.body.appendChild($probe);

let probeRAF: number | null = null;
let probeEvent: PointerEvent | null = null;

function hideProbe(): void {
  $probe.classList.remove("is-visible");
}

function updateProbe(): void {
  probeRAF = null;
  if (!probeEvent) return;
  const rect = $canvasWrap.getBoundingClientRect();
  const u = (probeEvent.clientX - rect.left) / rect.width;
  const v = 1 - (probeEvent.clientY - rect.top) / rect.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) {
    hideProbe();
    return;
  }

  const showRaw = pickMode || (pointerState?.dragging ?? false);
  const closestColor = !showRaw ? viz.getClosestColorAtUV(u, v) : null;
  const color = closestColor ?? viz.getRawColorAtUV(u, v);
  const hex = rgbToHex(color);
  $probeDot.style.background = hex;
  $probeLabel.textContent = hex;
  $probe.style.left = `${probeEvent.clientX + 14}px`;
  $probe.style.top = `${probeEvent.clientY + 14}px`;
  $probe.classList.add("is-visible");
}

// ── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  if (
    t instanceof HTMLInputElement &&
    t.type !== "range" &&
    t.type !== "checkbox"
  )
    return;
  if ((e.metaKey || e.ctrlKey) && e.key === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (e.key === "c" || e.key === "C") {
    e.preventDefault();
    togglePickMode();
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedIndex >= 0 && selectedIndex < palette.length) {
      e.preventDefault();
      removeColor(selectedIndex);
    }
  }
  if (e.key === "Escape") {
    if (pointerState?.dragging) {
      e.preventDefault();
      cancelDrag();
    } else if (pickMode) exitPickMode();
  }
});

// ── Control event wiring ─────────────────────────────────────────────────────

controls.onAxisChange = (axis: Axis) => {
  viz.setAxis(axis);
  viz.updateView(pickMode, palette.length > 0);
  scheduleHashUpdate();
  scheduleFaviconUpdate();
};

controls.$colorModel.addEventListener("change", () => {
  viz.setColorModel(controls.$colorModel.value);
  viz.updateView(pickMode, palette.length > 0);
  scheduleHashUpdate();
  scheduleFaviconUpdate();
});

controls.$distanceMetric.addEventListener("change", () => {
  viz.setDistanceMetric(controls.$distanceMetric.value);
  viz.updateView(pickMode, palette.length > 0);
  scheduleHashUpdate();
  scheduleFaviconUpdate();
});

controls.$posSlider.addEventListener("input", () => {
  viz.setPosition(parseFloat(controls.$posSlider.value));
  viz.updateView(pickMode, palette.length > 0);
  scheduleHashUpdate();
  scheduleFaviconUpdate();
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
      viz.updateView(pickMode, palette.length > 0);
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
  viz.updateView(pickMode, palette.length > 0);
  requestAutoSort();
}

// ── Init ─────────────────────────────────────────────────────────────────────

renderSwatches();
viz.updateView(pickMode, palette.length > 0);

requestAnimationFrame(() => {
  setTimeout(() => {
    const state = decodeHash(location.hash);
    if (state) applyHashState(state);
  }, 0);
});

window.addEventListener("beforeunload", () => beam.destroy());
