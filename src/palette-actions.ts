export interface PaletteActions {
  pushUndo(): void;
  undo(): void;
  addColor(hex: string): void;
  removeColor(index: number): void;
  setColorAt(index: number, hex: string): void;
  setPalette(colors: string[]): void;
}

interface PaletteActionsOptions {
  maxColors: number;
  getPalette: () => string[];
  setPalette: (palette: string[]) => void;
  getSelectedIndex: () => number;
  setSelectedIndex: (index: number) => void;
  getSortedPalette: () => string[] | null;
  setSortedPalette: (sortedPalette: string[] | null) => void;
  refresh: () => void;
  requestAutoSort: () => void;
  showHighlight: (hex: string) => void;
  hideHighlight: () => void;
}

interface UndoState {
  palette: string[];
  selectedIndex: number;
}

export function createPaletteActions(
  options: PaletteActionsOptions,
): PaletteActions {
  const {
    maxColors,
    getPalette,
    setPalette,
    getSelectedIndex,
    setSelectedIndex,
    getSortedPalette,
    setSortedPalette,
    refresh,
    requestAutoSort,
    showHighlight,
    hideHighlight,
  } = options;

  const undoStack: UndoState[] = [];
  const MAX_UNDO = 50;
  let removeSortTimer: ReturnType<typeof setTimeout> | null = null;

  function pushUndo(): void {
    undoStack.push({
      palette: [...getPalette()],
      selectedIndex: getSelectedIndex(),
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function undo(): void {
    const state = undoStack.pop();
    if (!state) return;
    setPalette(state.palette);
    setSelectedIndex(state.selectedIndex);
    setSortedPalette(null);
    refresh();
    requestAutoSort();
  }

  function addColor(hex: string): void {
    const palette = getPalette();
    if (palette.length >= maxColors) return;
    if (palette.includes(hex)) return;
    pushUndo();
    setPalette([...palette, hex]);
    const sortedPalette = getSortedPalette();
    if (sortedPalette) setSortedPalette([...sortedPalette, hex]);
    setSelectedIndex(palette.length);
    refresh();
    showHighlight(hex);
    requestAutoSort();
  }

  function removeColor(index: number): void {
    const palette = getPalette();
    if (index < 0 || index >= palette.length) return;
    pushUndo();
    hideHighlight();

    const sortedPalette = getSortedPalette();
    if (sortedPalette) {
      const nextSortedPalette = [...sortedPalette];
      const sortedIdx = nextSortedPalette.indexOf(palette[index]);
      if (sortedIdx >= 0) nextSortedPalette.splice(sortedIdx, 1);
      setSortedPalette(nextSortedPalette);
    }

    const nextPalette = [...palette];
    nextPalette.splice(index, 1);
    setPalette(nextPalette);
    setSelectedIndex(
      nextPalette.length > 0
        ? Math.min(getSelectedIndex(), nextPalette.length - 1)
        : -1,
    );
    refresh();

    if (removeSortTimer !== null) {
      clearTimeout(removeSortTimer);
      removeSortTimer = null;
    }
    if (nextPalette.length < 3) {
      setSortedPalette(null);
      return;
    }
    removeSortTimer = setTimeout(() => {
      removeSortTimer = null;
      requestAutoSort();
    }, 1000);
  }

  function setColorAt(index: number, hex: string): void {
    const palette = getPalette();
    if (palette[index] === hex) return;
    const nextPalette = [...palette];
    nextPalette[index] = hex;
    setPalette(nextPalette);
    setSortedPalette(null);
    refresh();
    requestAutoSort();
  }

  function setFullPalette(colors: string[]): void {
    pushUndo();
    const nextPalette = colors.slice(0, maxColors);
    setPalette(nextPalette);
    setSelectedIndex(nextPalette.length > 0 ? 0 : -1);
    setSortedPalette(null);
    refresh();
    requestAutoSort();
  }

  return {
    pushUndo,
    undo,
    addColor,
    removeColor,
    setColorAt,
    setPalette: setFullPalette,
  };
}
