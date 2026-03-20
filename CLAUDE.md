# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start Vite dev server (with `--host` for network access)
- `npm run build` — Production build via Vite
- `npm run preview` — Preview production build
- `npx tsc --noEmit` — TypeScript strict mode check (no output = success)

No tests or linter configured.

## Architecture

Single-page vanilla TypeScript application built with Vite. No framework. TypeScript strict mode enabled.

### Module structure (`src/`)

- **main.ts** — App state (`palette`, `selectedIndex`, `sortedPalette`), palette mutations, swatch rendering, pointer/keyboard/scroll interaction, pick mode, paste field, control wiring, and init. The central `refresh()` function consolidates the repeated update chain (sync viz → render swatches → sync paste → update view → schedule hash → beam send).
- **viz.ts** — `createVizManager()` factory wrapping two `PaletteViz` instances (`vizRaw` + lazily-created `vizClosest`) and the mask overlay canvas for compositing.
- **controls.ts** — `createControls()` factory that builds all settings UI (dropdowns, checkboxes, slider, axis buttons) and exposes element refs + internal update methods. Uses `onAxisChange` callback for external wiring.
- **beam.ts** — `createBeamManager()` for Token Beam send/receive sessions.
- **sort.ts** — `createSortManager()` communicating with the sort web worker.
- **sort-worker.ts** — Web worker using `colorsort-js` `multiAuto` with trained ML data.
- **hash.ts** — Pure `encodeHash`/`decodeHash` functions for URL hash state persistence.
- **color.ts** — Hex↔RGB conversion, `AXIS_NAMES` and slider constant tables, `computeSliderStops()`, `isHueAxis()`.
- **types.ts** — Shared types (`RGB`, `Axis`, `HashState`).
- **env.d.ts** — Module declarations for untyped deps (`palette-shader`, `token-beam`, `colorsort-js`).

### Core concept

PickyPalette is a color picker that visualizes Voronoi-like regions on a color space canvas. Each palette color "claims" territory based on perceptual distance — colors far from neighbors get large regions, close colors get squeezed.

### Key dependencies

- **palette-shader** (`PaletteViz`) — WebGL shader rendering the color space canvas and closest-color regions
- **culori** — Color conversion (hex ↔ RGB via `converter('rgb')`) and slider gradient computation
- **colorsort-js** — ML-trained color sorting (runs in a web worker via `multiAuto`)
- **token-beam** — Real-time design token sync protocol (send/receive palettes to Figma, etc.)

### State & rendering

App state lives in `main.ts` module-level variables. The URL hash is the persistence layer — entire palette + all settings serialize to/from the hash. Auto-sort is on by default and only activates with >2 colors.

Canvas interaction uses a mask overlay (2D canvas composited over WebGL) for "reveal color space while picking" and shift-hover isolation.

### CSS

Uses `light-dark()` for automatic dark/light mode via `color-scheme: light dark`. Monospace Iosevka font loaded from CDN. All layout is flexbox-based.
