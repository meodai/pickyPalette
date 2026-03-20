import SortWorker from "./sort-worker?worker";

export interface SortManager {
  request(hexes: string[]): void;
  destroy(): void;
}

export function createSortManager(
  onSorted: (sorted: string[]) => void,
): SortManager {
  const worker = new SortWorker();
  let requestId = 0;

  worker.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;
    if (type === "sorted" && payload.requestId === requestId) {
      onSorted(payload.sorted);
    }
  };

  return {
    request(hexes: string[]) {
      requestId++;
      worker.postMessage({ hexes, requestId });
    },
    destroy() {
      worker.terminate();
    },
  };
}
