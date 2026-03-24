"use client";

import { CUBE_COLORS } from "@/lib/colors";
import { CELL_SIZE } from "@/lib/constants";
import type { ReplicatedGameSnapshot, WorldPosition } from "@/types/shared";

const MAP_SIZE = 168;
const MAP_PADDING = 10;
const VIEW_RADIUS = 12;

export const MINIMAP_CANVAS_ID = "runtime-minimap";

type MinimapFrameInput = Readonly<{
  canvas: HTMLCanvasElement | null;
  snapshot: ReplicatedGameSnapshot | null;
  localPlayerId: string | null;
  localPosition: WorldPosition;
  yaw: number;
}>;

const toCssColor = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;

const cubeColorMap = new Map(CUBE_COLORS.map((color) => [color.name, toCssColor(color.hex)] as const));

const ensureCanvasSize = (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void => {
  const dpr = window.devicePixelRatio || 1;
  const scaledWidth = MAP_SIZE * dpr;
  const scaledHeight = MAP_SIZE * dpr;

  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    canvas.style.width = `${MAP_SIZE}px`;
    canvas.style.height = `${MAP_SIZE}px`;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
};

export const drawMinimapFrame = ({
  canvas,
  snapshot,
  localPlayerId,
  localPosition,
  yaw,
}: MinimapFrameInput): void => {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  ensureCanvasSize(canvas, context);

  const drawRect = (x: number, y: number, size: number, color: string): void => {
    context.fillStyle = color;
    context.fillRect(x, y, size, size);
  };

  context.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
  context.fillStyle = "rgba(0, 7, 2, 0.94)";
  context.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  context.strokeStyle = "rgba(122, 255, 134, 0.35)";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, MAP_SIZE - 1, MAP_SIZE - 1);

  if (!snapshot) {
    context.fillStyle = "rgba(170, 255, 176, 0.55)";
    context.font = "10px monospace";
    context.fillText("NO MAP", 64, 86);
    return;
  }

  const localCellX = Math.floor(localPosition.x / CELL_SIZE);
  const localCellY = Math.floor(localPosition.z / CELL_SIZE);
  const centerX = MAP_SIZE / 2;
  const centerY = MAP_SIZE / 2;
  const cellSize = (MAP_SIZE - MAP_PADDING * 2) / (VIEW_RADIUS * 2 + 1);

  const drawCell = (cellX: number, cellY: number, color: string): void => {
    const dx = cellX - localCellX;
    const dy = cellY - localCellY;

    if (Math.abs(dx) > VIEW_RADIUS || Math.abs(dy) > VIEW_RADIUS) {
      return;
    }

    const x = centerX + dx * cellSize - cellSize / 2;
    const y = centerY + dy * cellSize - cellSize / 2;
    drawRect(x, y, cellSize * 0.86, color);
  };

  for (const cell of snapshot.maze) {
    if (cell.value === 0) {
      continue;
    }

    const baseColor =
      cell.value === 4
        ? "rgba(165, 255, 168, 0.92)"
        : cell.value === 3
          ? "rgba(123, 255, 138, 0.58)"
          : cell.value === 1
            ? "rgba(44, 48, 60, 0.48)"
            : "rgba(24, 48, 32, 0.62)";

    drawCell(cell.grid.x, cell.grid.y, baseColor);
  }

  for (const ooze of snapshot.oozeTrail) {
    const cellX = Math.floor(ooze.x / CELL_SIZE);
    const cellY = Math.floor(ooze.z / CELL_SIZE);
    const dx = cellX - localCellX;
    const dy = cellY - localCellY;

    if (Math.abs(dx) > VIEW_RADIUS || Math.abs(dy) > VIEW_RADIUS) {
      continue;
    }

    const x = centerX + dx * cellSize - cellSize * 0.14;
    const y = centerY + dy * cellSize - cellSize * 0.14;
    drawRect(x, y, cellSize * 0.28, "rgba(114, 255, 124, 0.4)");
  }

  for (const cube of snapshot.cubes) {
    if (cube.state !== "ground") {
      continue;
    }

    const cellX = Math.floor(cube.position.x / CELL_SIZE);
    const cellY = Math.floor(cube.position.z / CELL_SIZE);
    const dx = cellX - localCellX;
    const dy = cellY - localCellY;

    if (Math.abs(dx) > VIEW_RADIUS || Math.abs(dy) > VIEW_RADIUS) {
      continue;
    }

    const x = centerX + dx * cellSize - cellSize * 0.19;
    const y = centerY + dy * cellSize - cellSize * 0.19;
    drawRect(x, y, cellSize * 0.38, cubeColorMap.get(cube.color) ?? "#91ff9d");
  }

  for (const player of snapshot.players) {
    if (player.id === localPlayerId) {
      continue;
    }

    const cellX = Math.floor(player.position.x / CELL_SIZE);
    const cellY = Math.floor(player.position.z / CELL_SIZE);
    const dx = cellX - localCellX;
    const dy = cellY - localCellY;

    if (Math.abs(dx) > VIEW_RADIUS || Math.abs(dy) > VIEW_RADIUS) {
      continue;
    }

    const x = centerX + dx * cellSize;
    const y = centerY + dy * cellSize;
    context.beginPath();
    context.fillStyle = player.color;
    context.arc(x, y, Math.max(1.5, cellSize * 0.15), 0, Math.PI * 2);
    context.fill();
  }

  context.save();
  context.translate(centerX, centerY);
  context.rotate(-yaw);
  context.fillStyle = "rgba(255, 255, 255, 0.95)";
  context.beginPath();
  context.moveTo(0, -8);
  context.lineTo(5, 7);
  context.lineTo(0, 4);
  context.lineTo(-5, 7);
  context.closePath();
  context.fill();
  context.restore();

  context.fillStyle = "rgba(122, 255, 134, 0.7)";
  context.font = "8px monospace";
  context.fillText("N", centerX - 3, 8);
};

export default function Minimap() {
  return (
    <canvas
      id={MINIMAP_CANVAS_ID}
      width={MAP_SIZE}
      height={MAP_SIZE}
      className="block rounded-[1.35rem] border border-[#7aff86]/25 bg-[rgba(0,7,2,0.58)] shadow-[0_0_32px_rgba(122,255,134,0.08)]"
      aria-label="Minimap"
    />
  );
}
