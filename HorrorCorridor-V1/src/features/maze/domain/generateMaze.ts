import type {
  MazeBranchSeed,
  MazeDirection,
  MazeGenerationOptions,
  MazeGridValue,
  MazeResult,
  MazeRng,
  MazeSeed,
} from "./mazeTypes";
import {
  buildCubeSpawns,
  createTargetSequence,
  selectCubeCandidates,
  selectCubeSpawns,
} from "./cubePlacement";
import { buildPathsFromEndToCubeSpawns } from "./mazePathing";
import { CELL_SIZE } from "@/lib/constants";

const DEFAULT_GRID_SIZE = 150;
const TARGET_PATH_LENGTH = 200;
const BRANCH_INTERVAL = 60;
const BRANCH_GENERATION = 2;
const BRANCH_LIFE_MIN = 60;
const BRANCH_LIFE_RANGE = 60;
const TURN_CHANCE = 0.15;
const EDGE_MARGIN = 4;

const toGridSize = (size?: number): number => {
  if (typeof size !== "number" || !Number.isFinite(size)) {
    return DEFAULT_GRID_SIZE;
  }

  return Math.max(1, Math.floor(size));
};

const createEmptyGrid = (size: number): MazeGridValue[][] =>
  Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0 as MazeGridValue),
  );

const carveMainCorridorCell = (
  grid: MazeGridValue[][],
  size: number,
  x: number,
  y: number,
): void => {
  for (let cy = y - 1; cy <= y + 1; cy += 1) {
    for (let cx = x - 1; cx <= x + 1; cx += 1) {
      if (cy > 0 && cy < size - 1 && cx > 0 && cx < size - 1) {
        grid[cy][cx] = 2;
      }
    }
  }
};

const carveBranchCell = (
  grid: MazeGridValue[][],
  size: number,
  x: number,
  y: number,
): void => {
  if (x > 0 && x < size - 1 && y > 0 && y < size - 1 && grid[y][x] === 0) {
    grid[y][x] = 1;
  }
};

const turnDirection = (direction: MazeDirection, rng: MazeRng): void => {
  if (rng() >= TURN_CHANCE) {
    return;
  }

  if (rng() < 0.5) {
    const temp = direction.dx;
    direction.dx = direction.dy;
    direction.dy = -temp;
    return;
  }

  const temp = direction.dx;
  direction.dx = -direction.dy;
  direction.dy = temp;
};

const hashSeed = (seed: MazeSeed): number => {
  const text = typeof seed === "number" ? `${seed}` : seed;
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export const createSeededMazeRng = (seed: MazeSeed = 0): MazeRng => {
  let state = hashSeed(seed) || 1;

  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    state >>>= 0;
    return state / 0x100000000;
  };
};

const resolveMazeRng = (options: MazeGenerationOptions): MazeRng => {
  if (typeof options.rng === "function") {
    return options.rng;
  }

  return createSeededMazeRng(options.seed ?? 0);
};

const createBranchDirection = (rng: MazeRng): MazeDirection => {
  let direction: MazeDirection = { dx: rng() < 0.5 ? 1 : -1, dy: 0 };

  if (rng() < 0.5) {
    direction = { dx: 0, dy: rng() < 0.5 ? 1 : -1 };
  }

  return direction;
};

const turnBranchDirection = (
  direction: MazeDirection,
  rng: MazeRng,
): void => {
  if (rng() >= 0.2) {
    return;
  }

  if (rng() < 0.5) {
    const temp = direction.dx;
    direction.dx = direction.dy;
    direction.dy = -temp;
    return;
  }

  const temp = direction.dx;
  direction.dx = -direction.dy;
  direction.dy = temp;
};

const expandBranchQueue = (
  grid: MazeGridValue[][],
  size: number,
  branchSeeds: readonly MazeBranchSeed[],
  rng: MazeRng,
): void => {
  const branchQueue = [...branchSeeds];

  while (branchQueue.length > 0) {
    const branch = branchQueue.shift();

    if (!branch) {
      continue;
    }

    let bx = branch.x;
    let by = branch.y;
    const direction = createBranchDirection(rng);

    for (let i = 0; i < branch.life; i += 1) {
      carveBranchCell(grid, size, bx, by);

      bx += direction.dx;
      by += direction.dy;

      if (bx < 2 || bx >= size - 2 || by < 2 || by >= size - 2) {
        break;
      }

      turnBranchDirection(direction, rng);

      if (branch.gen > 0 && rng() < 0.05) {
        branchQueue.push({
          x: bx,
          y: by,
          gen: branch.gen - 1,
          life: branch.life * 0.5,
        });
      }
    }
  }
};

export const generateMaze = (
  options: MazeGenerationOptions = {},
): MazeResult => {
  const size = toGridSize(options.size);
  const rng = resolveMazeRng(options);
  const grid = createEmptyGrid(size);

  let x = Math.floor(size / 2);
  let y = Math.floor(size / 2);

  const start = { x, y };
  let mainPathLength = 0;
  const branchSeeds: MazeBranchSeed[] = [];
  const currentDir: MazeDirection = { dx: 1, dy: 0 };

  while (mainPathLength < TARGET_PATH_LENGTH) {
    carveMainCorridorCell(grid, size, x, y);

    if (mainPathLength > 0 && mainPathLength % BRANCH_INTERVAL === 0) {
      branchSeeds.push({
        x,
        y,
        gen: BRANCH_GENERATION,
        life: BRANCH_LIFE_MIN + rng() * BRANCH_LIFE_RANGE,
      });
    }

    x += currentDir.dx;
    y += currentDir.dy;
    mainPathLength += 1;

    if (
      x < EDGE_MARGIN ||
      x >= size - EDGE_MARGIN ||
      y < EDGE_MARGIN ||
      y >= size - EDGE_MARGIN
    ) {
      currentDir.dx *= -1;
      currentDir.dy *= -1;
      x += currentDir.dx * 3;
      y += currentDir.dy * 3;
    }

    turnDirection(currentDir, rng);
  }

  expandBranchQueue(grid, size, branchSeeds, rng);

  const end = { x, y };
  grid[start.y][start.x] = 3;
  grid[end.y][end.x] = 4;
  const cubeCandidates = selectCubeCandidates({ grid, start, end });
  const cubeSpawns = selectCubeSpawns({ candidates: cubeCandidates, rng });
  const targetSequence = createTargetSequence({ rng });
  const cubes = buildCubeSpawns({ cubeSpawns, cellSize: CELL_SIZE });
  const paths = buildPathsFromEndToCubeSpawns({
    grid,
    end,
    cubes,
    cellSize: CELL_SIZE,
  });

  return {
    grid,
    start,
    end,
    cubes,
    targetSequence,
    paths,
  };
};
