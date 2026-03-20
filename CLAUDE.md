# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start Vite dev server (with `--host` for network access)
- `npm run build` — Production build via Vite
- `npm run preview` — Preview production build

No tests or linter configured.

## Architecture

Single-page vanilla JS application — one `main.js` file (~600 lines), one `index.html`, one `style.css`. No framework, no build-time transforms beyond Vite bundling.

### Core concept

PickyPalette is a color picker that visualizes Voronoi-like regions on a color space canvas. Each palette color "claims" territory based on perceptual distance — colors far from neighbors get large regions, close colors get squeezed.

### Key dependencies

- **palette-shader** (`PaletteViz`) — WebGL shader that renders the color space canvas and closest-color regions. Two instances: `vizRaw` (always shows the raw color space) and `vizClosest` (shows palette regions, created lazily when ≥2 colors exist)
- **culori** — Color conversion (hex ↔ RGB, used via `converter('rgb')`)
- **token-beam** — Real-time sync protocol for design tokens (send/receive palettes to external tools like Figma)

### State & rendering

All state lives in module-level variables in `main.js`: `palette` (hex strings array), `selectedIndex`, `currentAxis`, plus DOM-created controls. The URL hash is the persistence layer — entire palette + all settings serialize to/from the hash.

Canvas interaction uses a mask overlay (2D canvas composited over WebGL) for features like "reveal color space while picking" and shift-hover isolation. The mask reads pixels from both WebGL canvases and composites them based on which pixels match the selected color.

### Controls

Settings controls (color model, distance metric, outline, gamut clip, reveal) are built programmatically in JS and appended to `[data-tools]`. The position slider controls the third dimension of whichever color space axis is selected.

### CSS

Uses `light-dark()` for automatic dark/light mode via `color-scheme: light dark`. Monospace Iosevka font loaded from CDN. All layout is flexbox-based.
