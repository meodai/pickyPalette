export type RGB = [number, number, number];
export type Axis = "x" | "y" | "z";
export const AXES: readonly Axis[] = ["x", "y", "z"] as const;

export interface HashState {
  colors: string[];
  colorModel: string;
  distanceMetric: string;
  axis: Axis;
  pos: number;
  outline: boolean;
  gamut: boolean;
  autoSort: boolean;
  markers: boolean;
  snapAxis: boolean;
  invertZ: boolean;
}
