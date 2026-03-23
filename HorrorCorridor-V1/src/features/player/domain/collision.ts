import { CELL_SIZE } from "@/lib/constants";
import type { MazeGrid } from "@/features/maze/domain/mazeTypes";
import type { WorldPosition } from "@/types/shared";

import { PLAYER_RADIUS } from "./movement";

export type MazeCollisionResolution = Readonly<{
  position: WorldPosition;
  blockedX: boolean;
  blockedZ: boolean;
  hitWall: boolean;
}>;

const isInsideGrid = (grid: MazeGrid, gridX: number, gridY: number): boolean =>
  gridY >= 0 && gridY < grid.length && gridX >= 0 && gridX < grid[gridY].length;

const isWalkableCell = (grid: MazeGrid, worldX: number, worldZ: number): boolean => {
  const gridX = Math.floor(worldX / CELL_SIZE);
  const gridY = Math.floor(worldZ / CELL_SIZE);

  return isInsideGrid(grid, gridX, gridY) && grid[gridY][gridX] !== 0;
};

const canOccupyPosition = (
  grid: MazeGrid,
  position: WorldPosition,
  radius: number,
): boolean => {
  const sample = radius * 0.92;
  const corners: readonly [number, number][] = [
    [-sample, -sample],
    [sample, -sample],
    [-sample, sample],
    [sample, sample],
  ];

  return corners.every(([offsetX, offsetZ]) =>
    isWalkableCell(grid, position.x + offsetX, position.z + offsetZ),
  );
};

export const resolveMazeCollision = (
  currentPosition: WorldPosition,
  nextPosition: WorldPosition,
  grid: MazeGrid,
  radius: number = PLAYER_RADIUS,
): MazeCollisionResolution => {
  const candidateX = {
    x: nextPosition.x,
    y: nextPosition.y,
    z: currentPosition.z,
  };
  const blockedX = !canOccupyPosition(grid, candidateX, radius);
  const resolvedX = blockedX ? currentPosition.x : nextPosition.x;

  const candidateZ = {
    x: resolvedX,
    y: nextPosition.y,
    z: nextPosition.z,
  };
  const blockedZ = !canOccupyPosition(grid, candidateZ, radius);
  const resolvedZ = blockedZ ? currentPosition.z : nextPosition.z;

  return {
    position: {
      x: resolvedX,
      y: nextPosition.y,
      z: resolvedZ,
    },
    blockedX,
    blockedZ,
    hitWall: blockedX || blockedZ,
  };
};
