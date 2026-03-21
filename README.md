# PickyPalette

A research project exploring the interaction design of a palette-aware color picker — what happens when the tool itself shows you how your colors relate to each other?

The canvas maps a color space onto a plane — as you add colors, it splits into regions showing which color is closest at every point. A color that's far from all others claims a large region; one that's close to a neighbor gets squeezed into a sliver. There's no predetermined weight factor — it emerges naturally from how your colors are distributed, measured by a perceptual distance metric (like OKLab or ΔE2000) from color science.

**[pickypalette.color.pizza](https://pickypalette.color.pizza/)**

## Interaction

| Input                                                 | Action                                            |
| ----------------------------------------------------- | ------------------------------------------------- |
| Click                                                 | Select the closest color under cursor             |
| Drag                                                  | Move the selected color                           |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + hover              | Preview a new color (click to place)              |
| Double-click                                          | Add a new color (hold to drag-adjust)             |
| <kbd>C</kbd>                                          | Toggle pick mode (next click adds)                |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>Z</kbd>       | Undo                                              |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd>              | Remove color under cursor or selected color       |
| <kbd>Esc</kbd>                                        | Cancel drag or exit pick mode                     |
| <kbd>Alt</kbd> / <kbd>Option</kbd>                    | Reveal raw color space under hovered region       |
| <kbd>Shift</kbd> + <kbd>Alt</kbd> / <kbd>Option</kbd> | Isolate color (flat region stays, rest shows raw) |
| Scroll                                                | Adjust position slider (3rd axis)                 |
| Long tap (touch)                                      | Add a new color (hold to drag-adjust)             |

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

| Setting                          | Description                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| Color model                      | Color space used to render the canvas (OKHsl, OKLab, HSL, etc.)       |
| Distance metric                  | How "closeness" between colors is measured (OKLab, ΔE2000, RGB, etc.) |
| Outline                          | Draws borders between palette regions                                 |
| Reveal Color Space While Picking | Shows raw color space in the new color's region during Cmd+drag       |
| Clip to sRGB                     | Hides out-of-gamut colors (only affects wide-gamut models)            |
| Auto-Sort Color Swatches         | ML-trained sorting of swatches by visual similarity                   |

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

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for non-commercial use. For commercial licensing, contact [money@elastiq.ch](mailto:money@elastiq.ch).
