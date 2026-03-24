import { CELL_SIZE, GRID_SIZE } from "@/lib/constants";
import type { LobbyPlayer, MazeCellSnapshot, ReplicatedGameSnapshot, RoomState } from "@/types/shared";

import { generateMaze } from "@/features/maze/domain/generateMaze";
import { cellKey } from "@/features/maze/domain/mazePathing";
import { createPlayerViewAngles, type PlayerViewAngles } from "@/features/player/domain/cameraLook";
import { createPlayerInputState, type PlayerInputState } from "@/features/player/domain/input";
import { PLAYER_EYE_HEIGHT, createPlayerPose, type PlayerPose } from "@/features/player/domain/movement";
import { buildReplicatedSnapshot } from "@/features/networking/protocol/syncSnapshot";

import type { GameState } from "./gameTypes";

export type InitialGameStateInput = Readonly<{
  roomId: string;
  joinCode: string | null;
  hostId: string;
  players: readonly LobbyPlayer[];
  localPlayerId: string;
  localPlayerName: string;
  seedSource: string;
}>;

export type InitialGameStateResult = Readonly<{
  maze: ReturnType<typeof generateMaze>;
  gameState: GameState;
  snapshot: ReplicatedGameSnapshot;
  localPlayerPose: PlayerPose;
  viewAngles: PlayerViewAngles;
  inputState: PlayerInputState;
}>;

const PLAYER_COLORS = ["#FF0055", "#00AAFF", "#FFDD00", "#AA00FF", "#00FFAA"] as const;

const hashSeed = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const createMazeCell = (x: number, y: number, value: number): MazeCellSnapshot => ({
  id: cellKey({ x, y }),
  grid: { x, y },
  value: value as MazeCellSnapshot["value"],
});

const mazeCellToWorld = (x: number, y: number): Readonly<{ x: number; y: number; z: number }> => ({
  x: x * CELL_SIZE + CELL_SIZE / 2,
  y: PLAYER_EYE_HEIGHT,
  z: y * CELL_SIZE + CELL_SIZE / 2,
});

export const createInitialGameState = (input: InitialGameStateInput): InitialGameStateResult => {
  const maze = generateMaze({
    size: GRID_SIZE,
    seed: hashSeed(input.seedSource),
  });

  const mazeCells: readonly MazeCellSnapshot[] = maze.grid.flatMap((row, y) =>
    row.map((value, x) => createMazeCell(x, y, value)),
  );
  const mazeLookup = Object.fromEntries(mazeCells.map((cell) => [cell.id, cell] as const));

  const cubeSnapshots = maze.cubes.map((cube) => ({
    id: cube.id,
    color: cube.colorName,
    cell: {
      x: Math.floor(cube.x / CELL_SIZE),
      y: Math.floor(cube.z / CELL_SIZE),
    },
    position: {
      x: cube.x,
      y: 0.12,
      z: cube.z,
    },
    visible: true,
    active: true,
    locked: false,
    highlighted: false,
    heldByPlayerId: null,
    assignedSlotId: null,
  }));

  const sequenceSlots = maze.targetSequence.map((color, index) => ({
    id: `slot-${index}`,
    index,
    requiredColor: color,
    occupiedCubeId: null,
    isUnlocked: index === 0,
    isSolved: false,
  }));

  const startPosition = mazeCellToWorld(maze.start.x, maze.start.y);
  const localPlayerPose = createPlayerPose({
    x: startPosition.x,
    y: PLAYER_EYE_HEIGHT,
    z: startPosition.z,
  });
  const localViewAngles = createPlayerViewAngles(-Math.PI / 2, 0, Date.now());
  const inputState = createPlayerInputState();

  const sourcePlayers =
    input.players.length > 0
      ? input.players
      : [
          {
            id: input.localPlayerId,
            name: input.localPlayerName,
            isHost: true,
            ready: true,
            connectionState: "connected" as const,
          },
        ];

  const remoteOffsets = [1.4, -1.4, 2.2, -2.2];

  const players = sourcePlayers.map((player, index) => {
    const color = PLAYER_COLORS[index % PLAYER_COLORS.length];

    if (player.id === input.localPlayerId) {
      return {
        id: player.id,
        name: input.localPlayerName,
        color,
        position: localPlayerPose.position,
        rotationY: localViewAngles.yaw,
        pitch: localViewAngles.pitch,
        velocity: localPlayerPose.velocity,
      };
    }

    const offset = remoteOffsets[index % remoteOffsets.length];

    return {
      id: player.id,
      name: player.name,
      color,
      position: {
        x: localPlayerPose.position.x + offset,
        y: PLAYER_EYE_HEIGHT,
        z: localPlayerPose.position.z + 1.2 + index * 0.6,
      },
      rotationY: 0,
      pitch: 0,
      velocity: {
        x: 0,
        y: 0,
        z: 0,
      },
    };
  });

  const room: RoomState = {
    roomId: input.roomId,
    joinCode: input.joinCode,
    hostId: input.hostId,
    phase: "active",
    maxPlayers: 4,
    players: sourcePlayers,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const gameState: GameState = {
    gameId: input.roomId,
    seed: hashSeed(input.seedSource),
    room,
    appState: "PLAYING",
    gameState: "playing",
    tick: 0,
    timestampMs: Date.now(),
    maze: mazeCells,
    players,
    cubes: cubeSnapshots,
    sequenceSlots,
    oozeTrail: [],
    oozeLevel: 0,
    mazeLookup: mazeLookup as GameState["mazeLookup"],
    endAnomalyCellId: cellKey(maze.end),
    lastOozeDecayTime: Date.now(),
  };

  return {
    maze,
    gameState,
    snapshot: buildReplicatedSnapshot(gameState),
    localPlayerPose,
    viewAngles: localViewAngles,
    inputState,
  };
};
