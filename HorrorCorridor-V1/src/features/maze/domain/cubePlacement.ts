import type {
  MazeCoordinate,
  MazeCube,
  MazeCubeCandidate,
  MazeCubeColor,
  MazeCubeSpawnPoint,
  MazeCubeSpawnSelectionInput,
  MazeGrid,
  MazeRng,
  MazeTargetSequence,
  MazeTargetSequenceInput,
  MazeCubeBuildInput,
} from "./mazeTypes";
import { CELL_SIZE } from "@/lib/constants";
import { CUBE_COLORS } from "@/lib/colors";

// Cube placement scaffold.
// Candidate discovery and spawn selection live here; cube creation comes later.

export type CubePlacementPlaceholder = Readonly<{
  readonly stage: "cube-placement-scaffold";
}>;

export type CubeCandidateSelectionInput = Readonly<{
  grid: MazeGrid;
  start: MazeCoordinate;
  end: MazeCoordinate;
}>;

const toSpawnPoint = (candidate: MazeCubeCandidate): MazeCubeSpawnPoint => ({
  x: candidate.x,
  y: candidate.y,
});

const manhattanDistance = (
  a: MazeCubeSpawnPoint,
  b: MazeCubeSpawnPoint,
): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const resolveRng = (rng?: MazeRng): MazeRng => rng ?? Math.random;

const resolveColors = (
  colors?: readonly MazeCubeColor[],
): readonly MazeCubeColor[] => colors ?? CUBE_COLORS;

const shuffleColors = (
  colors: readonly MazeCubeColor[],
  rng: MazeRng,
): MazeCubeColor[] => {
  const next = [...colors];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const temp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = temp;
  }

  return next;
};

export const selectCubeCandidates = (
  input: CubeCandidateSelectionInput,
): readonly MazeCubeCandidate[] => {
  const { grid, start, end } = input;
  const size = grid.length;
  const candidates: MazeCubeCandidate[] = [];

  for (let py = 1; py < size - 1; py += 1) {
    for (let px = 1; px < size - 1; px += 1) {
      if (grid[py][px] === 1) {
        let walls = 0;

        if (grid[py - 1][px] === 0) walls += 1;
        if (grid[py + 1][px] === 0) walls += 1;
        if (grid[py][px - 1] === 0) walls += 1;
        if (grid[py][px + 1] === 0) walls += 1;

        const distStart = Math.abs(px - start.x) + Math.abs(py - start.y);
        const distEnd = Math.abs(px - end.x) + Math.abs(py - end.y);

        if (distStart > 10 && distEnd > 10) {
          candidates.push({ x: px, y: py, isDeadEnd: walls === 3 });
        }
      }
    }
  }

  return candidates;
};

export const selectCubeSpawns = (
  input: MazeCubeSpawnSelectionInput,
): readonly MazeCubeSpawnPoint[] => {
  const rng = resolveRng(input.rng);
  const deadEndPool = input.candidates.filter((candidate) => candidate.isDeadEnd);
  const primeSpots =
    deadEndPool.length < 3 ? input.candidates.map(toSpawnPoint) : deadEndPool.map(toSpawnPoint);

  const cubeSpawns: MazeCubeSpawnPoint[] = [];

  if (primeSpots.length > 0) {
    const idx = Math.floor(rng() * primeSpots.length);
    cubeSpawns.push(primeSpots[idx]);
    primeSpots.splice(idx, 1);
  }

  if (primeSpots.length > 0) {
    primeSpots.sort((a, b) => {
      const distA = manhattanDistance(a, cubeSpawns[0]);
      const distB = manhattanDistance(b, cubeSpawns[0]);
      return distB - distA;
    });
    cubeSpawns.push(primeSpots[0]);
    primeSpots.splice(0, 1);
  }

  if (primeSpots.length > 0) {
    primeSpots.sort((a, b) => {
      const minDistA = Math.min(
        manhattanDistance(a, cubeSpawns[0]),
        manhattanDistance(a, cubeSpawns[1]),
      );
      const minDistB = Math.min(
        manhattanDistance(b, cubeSpawns[0]),
        manhattanDistance(b, cubeSpawns[1]),
      );
      return minDistB - minDistA;
    });
    cubeSpawns.push(primeSpots[0]);
  }

  return cubeSpawns;
};

export const createTargetSequence = (
  input: MazeTargetSequenceInput = {},
): MazeTargetSequence => {
  const rng = resolveRng(input.rng);
  const colors = resolveColors(input.colors);

  return shuffleColors(colors, rng).map((color) => color.name);
};

export const buildCubeSpawns = (
  input: MazeCubeBuildInput,
): readonly MazeCube[] => {
  const colors = resolveColors(input.colors);
  const cellSize = Number.isFinite(input.cellSize ?? CELL_SIZE)
    ? (input.cellSize ?? CELL_SIZE)
    : CELL_SIZE;

  return input.cubeSpawns.slice(0, colors.length).map((pos, index) => {
    const color = colors[index];

    return {
      id: `cube_${color.name}`,
      colorName: color.name,
      colorHex: color.hex,
      x: pos.x * cellSize + cellSize / 2,
      z: pos.y * cellSize + cellSize / 2,
      state: "ground",
      ownerId: null,
    };
  });
};
