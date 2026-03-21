/// <reference types="vite/client" />

declare module "colorsort-js" {
  interface SortResult {
    sorted: string[];
    metrics?: unknown;
    mid?: string;
  }
  export function multiAuto(hexes: string[], data: unknown): SortResult[];
}

declare module "colorsort-js/trained.json" {
  const data: unknown;
  export default data;
}

declare module "palette-shader" {
  export interface PaletteVizOptions {
    width: number;
    height: number;
    pixelRatio: number;
    axis: string;
    position: number;
    colorModel: string;
    distanceMetric: string;
    palette: [number, number, number][];
    showRaw: boolean;
    container: HTMLElement;
    outlineWidth?: number;
    gamutClip?: boolean;
    invertAxes?: string[];
  }

  export class PaletteViz {
    constructor(options: PaletteVizOptions);
    canvas: HTMLCanvasElement;
    axis: string;
    position: number;
    colorModel: string;
    distanceMetric: string;
    outlineWidth: number;
    gamutClip: boolean;
    invertAxes: string[];
    palette: [number, number, number][];
    showRaw: boolean;
    getColorAtUV(u: number, v: number): [number, number, number];
    setColor(rgb: [number, number, number], index: number): void;
    resize(width: number, height: number): void;
    destroy(): void;
  }
}

declare module "token-beam" {
  interface SessionEvents {
    paired: (data: { sessionToken?: string }) => void;
    "peer-connected": () => void;
    "peer-disconnected": () => void;
    sync: (data: { payload: unknown }) => void;
    error: (data: { message: string }) => void;
    disconnected: () => void;
  }

  export class SourceSession {
    constructor(options: {
      serverUrl: string;
      clientType: string;
      origin: string;
      icon: { type: string; value: string };
    });
    on<K extends keyof SessionEvents>(
      event: K,
      handler: SessionEvents[K],
    ): void;
    connect(): Promise<void>;
    disconnect(): void;
    hasPeers(): boolean;
    sync(data: unknown): void;
    getState(): string;
  }

  export class TargetSession {
    constructor(options: {
      serverUrl: string;
      clientType: string;
      sessionToken: string;
    });
    on<K extends keyof SessionEvents>(
      event: K,
      handler: SessionEvents[K],
    ): void;
    connect(): Promise<void>;
    disconnect(): void;
    getState(): string;
  }

  export function extractColorTokens(payload: unknown): { hex: string }[];
  export function createCollection(
    name: string,
    tokens: Record<string, string>,
  ): unknown;
}
