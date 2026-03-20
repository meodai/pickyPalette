# PickyPalette

A color picker that shows how much visual weight each color claims in your palette. The canvas maps a color space onto a plane — as you add colors, it splits into regions showing which color is closest at every point. A color that's far from all others claims a large region; one that's close to a neighbor gets squeezed into a sliver. There's no predetermined weight factor — it emerges naturally from how your colors are distributed, measured by a perceptual distance metric (like OKLab or ΔE2000) from color science.

**[pickypalette.color.pizza](https://pickypalette.color.pizza/)**

## Usage

**Adding colors** — Click the canvas or press <kbd>C</kbd> to enter pick mode, then click to place a color. You can also drag directly on the canvas to add a color and adjust it in one motion.

**Removing colors** — Hover a swatch and click the × button, or select a swatch and press <kbd>Delete</kbd> / <kbd>Backspace</kbd>.

**Inspecting a color** — Hold <kbd>Shift</kbd> and hover a swatch to isolate it on the canvas — only that color's region is shown, the rest reveals the raw color space.

**Pasting colors** — Type or paste hex values into the import/export field (comma or space separated). The entire palette will be replaced.

**Position slider & axis** — The slider controls the third dimension of the color space. Click the axis label to cycle through axes. Scroll or two-finger swipe on the canvas to adjust.

**Auto-sort** — Swatches are automatically sorted using ML-trained color sorting (via [colorsort-js](https://github.com/darosh/colorsort-js)) when you have more than 2 colors. Toggle this in settings.

**Sharing** — Your entire palette and all settings are stored in the URL. Bookmark it or share the link.

**Token Beam** — Beam your palette directly into tools like Figma, Aseprite, or Blender using [Token Beam](https://tokenbeam.dev).

## Settings

| Setting                          | Description                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| Color model                      | Color space used to render the canvas (OKHsl, OKLab, HSL, etc.)       |
| Distance metric                  | How "closeness" between colors is measured (OKLab, ΔE2000, RGB, etc.) |
| Outline                          | Draws borders between palette regions                                 |
| Reveal Color Space While Picking | Shows raw color space in the selected region during drag              |
| Clip to sRGB                     | Hides out-of-gamut colors (only affects wide-gamut models)            |
| Auto-Sort Color Swatches         | ML-trained sorting of swatches by visual similarity                   |

## Development

```bash
npm install
npm run dev      # dev server at localhost with --host
npm run build    # production build to dist/
npm run preview  # preview production build
npx tsc --noEmit # type check (strict mode)
```

## Built with

- [palette-shader](https://github.com/meodai/color-palette-shader) — WebGL color space visualization and Voronoi-like region rendering
- [culori](https://culorijs.org) — Color conversion and color space math
- [colorsort-js](https://github.com/darosh/colorsort-js) — ML-trained color sorting algorithms
- [token-beam](https://tokenbeam.dev) — Real-time design token sync protocol
- [Vite](https://vitejs.dev) — Build tooling

## License

MIT
