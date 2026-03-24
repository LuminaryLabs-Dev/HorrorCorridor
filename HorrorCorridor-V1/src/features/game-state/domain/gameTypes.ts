import type {
  AppScreenState,
  CellGridPosition,
  CubeStateId,
  GameScreenState,
  LobbyPlayer,
  MazeCellSnapshot,
  OozeTrailItem,
  PlayerId,
  PlayerSnapshot,
  ReplicatedGameSnapshot,
  RoomState,
  WorldPosition,
} from "@/types/shared";
import type { CubeColorKey } from "@/lib/colors";

import type { MazeCellId, MazeRng } from "@/features/maze/domain/mazeTypes";

export type GameCellLookup = Readonly<Record<MazeCellId, MazeCellSnapshot>>;

export type SequenceSlotId = string;

export type SequenceSlot = Readonly<{
  id: SequenceSlotId;
  index: number;
  requiredColor: CubeColorKey;
  occupiedCubeId: CubeStateId | null;
  isUnlocked: boolean;
  isSolved: boolean;
}>;

export type CubeState = Readonly<{
  id: CubeStateId;
  color: CubeColorKey;
  cell: CellGridPosition | null;
  position: WorldPosition;
  visible: boolean;
  active: boolean;
  locked: boolean;
  highlighted: boolean;
  heldByPlayerId: PlayerId | null;
  assignedSlotId: SequenceSlotId | null;
}>;

export type RuntimePlayerState = Readonly<
  PlayerSnapshot & {
    name: string;
    velocity: WorldPosition;
  }
>;

export type GameState = Readonly<
  Omit<ReplicatedGameSnapshot, "players" | "cubes" | "anomaly"> & {
    players: readonly RuntimePlayerState[];
    cubes: readonly CubeState[];
    sequenceSlots: readonly SequenceSlot[];
    mazeLookup: GameCellLookup;
    endAnomalyCellId: MazeCellId;
    oozeTrail: readonly OozeTrailItem[];
    lastOozeDecayTime: number;
  }
>;

export type GameActionInput = Readonly<{
  playerId: PlayerId;
}>;

export type CubeInteractionInput = Readonly<{
  playerId: PlayerId;
  cubeId?: string;
  slotId?: string;
}>;

export type EndAnomalyInteractionInput = Readonly<{
  playerId: PlayerId;
  slotId?: string;
}>;

export type OozeTrailUpdateInput = Readonly<{
  nowMs: number;
  playerPositions: readonly WorldPosition[];
  rng?: MazeRng;
}>;

export type SequenceProgressState = Readonly<{
  solvedCount: number;
  totalCount: number;
  complete: boolean;
}>;

export type GameStateUpdateResult = Readonly<{
  state: GameState;
  changed: boolean;
}>;

export type {
  AppScreenState,
  GameScreenState,
  LobbyPlayer,
  RuntimePlayerState as PlayerSnapshot,
  RoomState,
  WorldPosition,
  OozeTrailItem,
};
