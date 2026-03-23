import type {
  AppScreenState,
  CubeState,
  GameScreenState,
  LobbyPlayer,
  MazeCellSnapshot,
  OozeTrailItem,
  PlayerId,
  PlayerSnapshot,
  ReplicatedGameSnapshot,
  RoomState,
  SequenceSlot,
  WorldPosition,
} from "@/types/shared";

import type { MazeCellId, MazeRng } from "@/features/maze/domain/mazeTypes";

export type GameCellLookup = Readonly<Record<MazeCellId, MazeCellSnapshot>>;

export type GameState = Readonly<
  ReplicatedGameSnapshot & {
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
  CubeState,
  GameScreenState,
  LobbyPlayer,
  PlayerSnapshot,
  RoomState,
  SequenceSlot,
  WorldPosition,
  OozeTrailItem,
};
