import type { MarkerInfo } from "./viz";

export interface PointerLike {
  clientX: number;
  clientY: number;
}

export interface UVPosition {
  u: number;
  v: number;
  inBounds: boolean;
}

export interface InteractionGeometry {
  refreshRect(): DOMRect;
  getUV(pointer: PointerLike): UVPosition;
  hitTestMarker(clientX: number, clientY: number): MarkerInfo | null;
}

interface InteractionGeometryOptions {
  canvasWrap: HTMLElement;
  getShowMarkers: () => boolean;
  getMarkers: () => MarkerInfo[];
}

export function createInteractionGeometry(
  options: InteractionGeometryOptions,
): InteractionGeometry {
  const { canvasWrap, getShowMarkers, getMarkers } = options;
  let canvasRect = canvasWrap.getBoundingClientRect();

  function refreshRect(): DOMRect {
    canvasRect = canvasWrap.getBoundingClientRect();
    return canvasRect;
  }

  function getUV(pointer: PointerLike): UVPosition {
    const u = (pointer.clientX - canvasRect.left) / canvasRect.width;
    const v = 1 - (pointer.clientY - canvasRect.top) / canvasRect.height;
    return { u, v, inBounds: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
  }

  function hitTestMarker(clientX: number, clientY: number): MarkerInfo | null {
    if (!getShowMarkers()) return null;
    const cx = clientX - canvasRect.left;
    const cy = clientY - canvasRect.top;
    const hitPad = 4;
    for (const marker of getMarkers()) {
      const dx = cx - marker.cssX;
      const dy = cy - marker.cssY;
      if (
        dx * dx + dy * dy <=
        (marker.radius + hitPad) * (marker.radius + hitPad)
      ) {
        return marker;
      }
    }
    return null;
  }

  return {
    refreshRect,
    getUV,
    hitTestMarker,
  };
}
