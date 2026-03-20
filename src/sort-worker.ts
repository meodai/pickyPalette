import { multiAuto } from 'colorsort-js';
import DATA from 'colorsort-js/trained.json' with { type: 'json' };

self.onmessage = (event: MessageEvent<{ hexes: string[]; requestId: number }>) => {
  const { hexes, requestId } = event.data;
  try {
    const multiAutoSorted = multiAuto(hexes, DATA);
    const sorted: string[] = Array.isArray(hexes) ? multiAutoSorted[0]?.sorted ?? [] : [];
    self.postMessage({ type: 'sorted', payload: { sorted, requestId } });
  } catch (error) {
    self.postMessage({
      type: 'error',
      payload: { message: error instanceof Error ? error.message : String(error), requestId },
    });
  }
};
