import type { PaletteViz } from 'palette-shader';

const SIZE = 64;
const RADIUS = 12;
const DEBOUNCE_MS = 300;

const $link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!;
const canvas = new OffscreenCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d')!;
let timer: ReturnType<typeof setTimeout> | null = null;

function roundRectClip(): void {
  ctx.beginPath();
  ctx.roundRect(0, 0, SIZE, SIZE, RADIUS);
  ctx.clip();
}

function render(source: PaletteViz): void {
  // Force a synchronous render so the WebGL buffer has pixels
  source.getColorAtUV(0.5, 0.5);

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.save();
  roundRectClip();
  // WebGL y-flip
  ctx.translate(0, SIZE);
  ctx.scale(1, -1);
  ctx.drawImage(source.canvas, 0, 0, SIZE, SIZE);
  ctx.restore();

  // "P" overlay
  ctx.font = `bold ${SIZE * 0.65}px Iosevka Web, Iosevka, ui-monospace, SF Mono, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.fillText('P', SIZE / 2, SIZE / 2 + 3);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Async PNG encoding
  canvas.convertToBlob({ type: 'image/png' })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const prev = $link.href;
      $link.href = url;
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
    })
    .catch(() => { /* favicon is non-critical */ });
}

export function scheduleFaviconUpdate(getSource: () => PaletteViz): void {
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    render(getSource());
  }, DEBOUNCE_MS);
}
