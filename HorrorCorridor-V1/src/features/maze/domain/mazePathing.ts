import { CELL_SIZE } from "@/lib/constants";
import type { CellGridPosition } from "@/types/shared";

import type {
  MazeCellId,
  MazeGrid,
  MazePathMap,
  MazePathNode,
  MazePathingInput,
  MazePathingResult,
} from "./mazeTypes";

const DIRECTIONS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const isInsideGrid = (grid: MazeGrid, x: number, y: number): boolean =>
  y >= 0 && y < grid.length && x >= 0 && x < grid[y].length;

const createVisitedGrid = (size: number): boolean[][] =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => false));

const clonePath = (path: readonly MazePathNode[], node: MazePathNode): MazePathNode[] => [
  ...path,
  node,
];

export const cellKey = (cell: CellGridPosition): MazeCellId => `${cell.x}:${cell.y}`;

export const buildPathsFromEndToCubeSpawns = (
  input: MazePathingInput,
): MazePathingResult => {
  const { grid, end, cubes } = input;
  const cellSize = input.cellSize ?? CELL_SIZE;
  const size = grid.length;
  const paths: Record<string, readonly MazePathNode[]> = {};

  for (const cube of cubes) {
    const targetX = Math.floor(cube.x / cellSize);
    const targetY = Math.floor(cube.z / cellSize);
    const queue: MazePathNode[][] = [[{ x: end.x, y: end.y }]];
    const visited = createVisitedGrid(size);

    visited[end.y][end.x] = true;

    let foundPath: MazePathNode[] = [];

    while (queue.length > 0) {
      const path = queue.shift();

      if (!path) {
        continue;
      }

      const node = path[path.length - 1];

      if (node.x === targetX && node.y === targetY) {
        foundPath = path;
        break;
      }

      for (const [dx, dy] of DIRECTIONS) {
        const nx = node.x + dx;
        const ny = node.y + dy;

        if (
          isInsideGrid(grid, nx, ny) &&
          grid[ny][nx] !== 0 &&
          !visited[ny][nx]
        ) {
          visited[ny][nx] = true;
          queue.push(clonePath(path, { x: nx, y: ny }));
        }
      }
    }

    paths[cube.id] = foundPath;
  }

  return paths as MazePathMap;
};
