import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPaletteActions } from "./palette-actions";

function createHarness(options?: {
  palette?: string[];
  selectedIndex?: number;
  sortedPalette?: string[] | null;
  maxColors?: number;
}) {
  let palette = [...(options?.palette ?? [])];
  let selectedIndex = options?.selectedIndex ?? (palette.length > 0 ? 0 : -1);
  let sortedPalette = options?.sortedPalette
    ? [...options.sortedPalette]
    : null;

  const refresh = vi.fn();
  const requestAutoSort = vi.fn();
  const showHighlight = vi.fn();
  const hideHighlight = vi.fn();

  const actions = createPaletteActions({
    maxColors: options?.maxColors ?? 4,
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

  return {
    actions,
    refresh,
    requestAutoSort,
    showHighlight,
    hideHighlight,
    get palette() {
      return palette;
    },
    get selectedIndex() {
      return selectedIndex;
    },
    get sortedPalette() {
      return sortedPalette;
    },
  };
}

describe("palette actions", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("adds a unique color and updates selection", () => {
    const harness = createHarness({
      palette: ["#111111"],
      selectedIndex: 0,
      sortedPalette: ["#111111"],
    });

    harness.actions.addColor("#222222");

    expect(harness.palette).toEqual(["#111111", "#222222"]);
    expect(harness.selectedIndex).toBe(1);
    expect(harness.sortedPalette).toEqual(["#111111", "#222222"]);
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(harness.showHighlight).toHaveBeenCalledWith("#222222");
    expect(harness.requestAutoSort).toHaveBeenCalledTimes(1);
  });

  it("ignores duplicate colors", () => {
    const harness = createHarness({ palette: ["#111111"], selectedIndex: 0 });

    harness.actions.addColor("#111111");

    expect(harness.palette).toEqual(["#111111"]);
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.requestAutoSort).not.toHaveBeenCalled();
  });

  it("undo restores palette and selected index", () => {
    const harness = createHarness({ palette: ["#111111"], selectedIndex: 0 });

    harness.actions.addColor("#222222");
    harness.refresh.mockClear();
    harness.requestAutoSort.mockClear();

    harness.actions.undo();

    expect(harness.palette).toEqual(["#111111"]);
    expect(harness.selectedIndex).toBe(0);
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(harness.requestAutoSort).toHaveBeenCalledTimes(1);
  });

  it("removes a color and schedules a re-sort when 3+ colors remain", () => {
    vi.useFakeTimers();
    const harness = createHarness({
      palette: ["#111111", "#222222", "#333333", "#444444"],
      selectedIndex: 3,
      sortedPalette: ["#111111", "#222222", "#333333", "#444444"],
    });

    harness.actions.removeColor(1);

    expect(harness.palette).toEqual(["#111111", "#333333", "#444444"]);
    expect(harness.selectedIndex).toBe(2);
    expect(harness.sortedPalette).toEqual(["#111111", "#333333", "#444444"]);
    expect(harness.hideHighlight).toHaveBeenCalledTimes(1);
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(harness.requestAutoSort).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(harness.requestAutoSort).toHaveBeenCalledTimes(1);
  });

  it("clears sorting immediately when fewer than 3 colors remain after removal", () => {
    const harness = createHarness({
      palette: ["#111111", "#222222", "#333333"],
      selectedIndex: 2,
      sortedPalette: ["#111111", "#222222", "#333333"],
    });

    harness.actions.removeColor(2);

    expect(harness.palette).toEqual(["#111111", "#222222"]);
    expect(harness.selectedIndex).toBe(1);
    expect(harness.sortedPalette).toBeNull();
    expect(harness.requestAutoSort).not.toHaveBeenCalled();
  });

  it("truncates full palette replacement to max colors", () => {
    const harness = createHarness({ maxColors: 2 });

    harness.actions.setPalette(["#111111", "#222222", "#333333"]);

    expect(harness.palette).toEqual(["#111111", "#222222"]);
    expect(harness.selectedIndex).toBe(0);
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(harness.requestAutoSort).toHaveBeenCalledTimes(1);
  });

  it("setColorAt updates the color and clears sorted palette", () => {
    const harness = createHarness({
      palette: ["#111111", "#222222", "#333333"],
      selectedIndex: 0,
      sortedPalette: ["#111111", "#222222", "#333333"],
    });

    harness.actions.setColorAt(1, "#aaaaaa");

    expect(harness.palette).toEqual(["#111111", "#aaaaaa", "#333333"]);
    expect(harness.sortedPalette).toBeNull();
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(harness.requestAutoSort).toHaveBeenCalledTimes(1);
  });

  it("setColorAt skips update when color is unchanged", () => {
    const harness = createHarness({
      palette: ["#111111", "#222222"],
      selectedIndex: 0,
    });

    harness.actions.setColorAt(0, "#111111");

    expect(harness.refresh).not.toHaveBeenCalled();
  });

  it("pushUndo captures current state for later undo", () => {
    const harness = createHarness({
      palette: ["#111111"],
      selectedIndex: 0,
    });

    harness.actions.pushUndo();
    // Mutate state directly via setPalette
    harness.actions.setPalette(["#aaaaaa", "#bbbbbb"]);
    harness.refresh.mockClear();
    harness.requestAutoSort.mockClear();

    harness.actions.undo();

    expect(harness.palette).toEqual(["#111111"]);
    expect(harness.selectedIndex).toBe(0);
  });
});
