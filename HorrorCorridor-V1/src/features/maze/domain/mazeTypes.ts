// Shared maze type definitions.
// These types mirror the prototype maze snapshot shape and stay framework-free.

import type {
  CubeColor,
  CubeColorHex,
  CubeColorName,
  CubePalette,
} from "@/lib/colors";

export type MazeTypesPlaceholder = Readonly<{
  readonly stage: "maze-types-scaffold";
}>;

export type MazeCellId = string;

export type MazeCellValue = 0 | 1 | 2 | 3 | 4;

export type MazeGridValue = MazeCellValue;

export type MazeGridRow = readonly MazeGridValue[];

export type MazeGrid = readonly MazeGridRow[];

export type MazeCoordinate = Readonly<{
  x: number;
  y: number;
}>;

export type MazeStartCoordinate = MazeCoordinate;

export type MazeEndCoordinate = MazeCoordinate;

export type MazePathNode = MazeCoordinate;

export type MazeDirection = {
  dx: number;
  dy: number;
};

export type MazeSeed = string | number;

export type MazeRng = () => number;

export type MazeBranchSeed = Readonly<{
  x: number;
  y: number;
  gen: number;
  life: number;
}>;

export type MazeCubeCandidate = Readonly<{
  x: number;
  y: number;
  isDeadEnd: boolean;
}>;

export type MazeCubeSpawnPoint = MazeCoordinate;

export type MazeCubeSpawnSelectionInput = Readonly<{
  candidates: readonly MazeCubeCandidate[];
  rng?: MazeRng;
}>;

export type MazeTargetSequenceInput = Readonly<{
  colors?: CubePalette;
  rng?: MazeRng;
}>;

export type MazeCubeBuildInput = Readonly<{
  cubeSpawns: readonly MazeCubeSpawnPoint[];
  colors?: CubePalette;
  cellSize?: number;
}>;

export type MazeGenerationOptions = Readonly<{
  size?: number;
  seed?: MazeSeed;
  rng?: MazeRng;
}>;

export type MazeMainCorridorResult = Readonly<{
  grid: MazeGrid;
  start: MazeStartCoordinate;
  end: MazeEndCoordinate;
  branches: readonly MazeBranchSeed[];
  cubeCandidates: readonly MazeCubeCandidate[];
}>;

export type MazeCubeId = string;

export type MazeCubeColorName = CubeColorName;

export type MazeCubeColorHex = CubeColorHex;

export type MazeCubeColor = CubeColor;

export type MazeCubeState = "ground";

export type MazeCube = Readonly<{
  id: MazeCubeId;
  colorName: MazeCubeColorName;
  colorHex: MazeCubeColorHex;
  x: number;
  z: number;
  state: MazeCubeState;
  ownerId: null;
}>;

export type MazeTargetSequence = readonly MazeCubeColorName[];

export type MazePathMap = Readonly<Record<MazeCubeId, readonly MazePathNode[]>>;

export type MazePathingInput = Readonly<{
  grid: MazeGrid;
  end: MazeEndCoordinate;
  cubes: readonly MazeCube[];
  cellSize?: number;
}>;

export type MazePathingResult = MazePathMap;

export type MazeResult = Readonly<{
  grid: MazeGrid;
  start: MazeStartCoordinate;
  end: MazeEndCoordinate;
  cubes: readonly MazeCube[];
  targetSequence: MazeTargetSequence;
  paths: MazePathMap;
}>;

export type MazePrototypeSnapshot = MazeResult;
