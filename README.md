# PickyPalette

A color picker where you sculpt a palette directly on a color model. Colors claim territory based on perceptual distance, so every move reshapes the whole palette. Drag to tweak, hold Cmd to preview — the canvas is the instrument.

**[pickypalette.color.pizza](https://pickypalette.color.pizza/)**

## Interaction

| Input                                                 | Action                                            |
| ----------------------------------------------------- | ------------------------------------------------- |
| <kbd>C</kbd>                                          | Toggle pick mode (next click adds)                |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + hover              | Preview a new color (click to place)              |
| Double-click                                          | Add a new color (hold to drag-adjust)             |
| Long tap (touch)                                      | Add a new color (hold to drag-adjust)             |
| Click                                                 | Select the closest color under cursor             |
| Drag                                                  | Move the selected color                           |
| <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd>            | Switch axis (x / y / z)                           |
| Scroll                                                | Adjust position slider (3rd axis)                 |
| <kbd>P</kbd>                                          | Toggle color position markers                     |
| <kbd>Alt</kbd> / <kbd>Option</kbd>                    | Reveal raw color space under hovered region       |
| <kbd>Shift</kbd> + <kbd>Alt</kbd> / <kbd>Option</kbd> | Isolate color (flat region stays, rest shows raw) |
| <kbd>Cmd</kbd> + <kbd>Alt</kbd>                       | Preview color with raw color space reveal         |
| <kbd>Cmd</kbd> + <kbd>Alt</kbd> + <kbd>Shift</kbd>    | Preview color with isolation mask                 |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd>              | Remove hovered swatch, cursor color, or selected  |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>Z</kbd>       | Undo                                              |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>I</kbd>       | Invert slider axis                                |
| <kbd>Esc</kbd>                                        | Cancel drag or exit pick mode                     |

- Dragging moves the color relative to its position (no snapping to cursor).
- An empty canvas treats any click/drag as adding a color.
- Modifier keys work on both canvas regions and swatches.

## Usage

**Pasting colors** — Type or paste hex values into the import/export field (comma or space separated). The palette updates with all valid colors; clearing the field removes all colors.

**Position slider & axis** — The slider controls the third dimension of the color space. Click the axis label to cycle through axes. Scroll on the canvas to adjust.

**Auto-sort** — Swatches are automatically sorted using ML-trained color sorting (via [colorsort-js](https://github.com/darosh/colorsort-js)) when you have more than 2 colors. Toggle this in settings.

**Sharing** — Your entire palette and all settings are stored in the URL. Bookmark it or share the link.

**Token Beam** — Beam your palette directly into tools like Figma, Aseprite, or Blender using [Token Beam](https://tokenbeam.dev).

## Settings

| Setting                       | Description                                                           |
| ----------------------------- | --------------------------------------------------------------------- |
| Color model                   | Color space used to render the canvas (OKHsl, OKLab, HSL, etc.)       |
| Distance metric               | How "closeness" between colors is measured (OKLab, ΔE2000, RGB, etc.) |
| Clip to sRGB                  | Hides out-of-gamut colors (only affects wide-gamut models)            |
| Auto-Sort Color Swatches      | ML-trained sorting of swatches by visual similarity                   |
| Show Color Markers (P)        | Dots showing where each color sits on the canvas, sized by proximity  |
| Ease to Current Slice on Drag | Gradually blends a dragged color's 3rd axis toward the current slice  |
| Invert Slider Axis (Cmd+I)    | Flips the slider axis direction (e.g. white↔black center in HSL)      |

## Development

```bash
npm install
npm run dev      # dev server at localhost with --host
npm run build    # production build to dist/
npm run preview  # preview production build
npm run format   # format with prettier
npx tsc --noEmit # type check (strict mode)
```

## Built with

- [palette-shader](https://github.com/meodai/color-palette-shader) — WebGL color space visualization and Voronoi-like region rendering
- [culori](https://culorijs.org) — Color conversion and color space math
- [colorsort-js](https://github.com/darosh/colorsort-js) — ML-trained color sorting algorithms
- [token-beam](https://tokenbeam.dev) — Real-time design token sync protocol
- [Vite](https://vitejs.dev) — Build tooling

## Roadmap

- [ ] Wide-gamut color support — use `getColorAtUV_float()` (palette-shader 0.18.0) for unclamped linear RGB, enabling out-of-sRGB colors
- [ ] Better swatch management — list view, auto-sort and sort options in the swatch panel
- [x] Color position markers — overlay canvas showing dots where palette colors sit, with contrast-aware color (black/white)

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for non-commercial use. For commercial licensing, contact [money@elastiq.ch](mailto:money@elastiq.ch).
