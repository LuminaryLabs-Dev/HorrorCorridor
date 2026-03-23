export const CUBE_COLORS = [
  { name: "RED", hex: 0xff2222 },
  { name: "GREEN", hex: 0x22ff22 },
  { name: "BLUE", hex: 0x2222ff },
] as const;

export type CubeColor = (typeof CUBE_COLORS)[number];
export type CubeColorKey = CubeColor["name"];
export type CubeColorName = CubeColor["name"];
export type CubeColorHex = CubeColor["hex"];
export type CubePalette = readonly CubeColor[];
